import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-composition-save-path-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-246: 혼용률(자재 행 단위) 저장 경로 — 작지 저장(commit-analysis) → 비교(bom-compare) → 재저장.
// 합성 값만 사용. 서버가 규칙을 강제한다: 비어 있음→채움 / 같음→변화 없음 / 다름→유지(덮어쓰기 표시가
// 있을 때만 교체) / 빈 값은 지우지 않음.
describe('혼용률 저장 경로 (PR-246)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `composition-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Composition E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const stamp = Date.now();
  const styleNo = `COMPO-${stamp}`;
  const fabricName = `FABRIC_A_${stamp}`;
  const buttonName = `BUTTON_A_${stamp}`;

  const overview = {
    styleNo, styleName: null, itemType: 'JACKET', brand: null, productionType: null,
    factory: '베트남', buyer: 'Composition E2E Buyer', totalQty: 100, targetRdd: null,
  };
  const row = (extra: Record<string, unknown> = {}) => ({
    category: '겉감', itemName: fabricName, spec: 'FABRIC', colorCode: 'BK', consumption: 1, requiredQty: 100,
    supplier: null, remarks: null, ...extra,
  });
  const post = (url: string, body: unknown) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body as object);
  const getItems = async () => {
    const res = await request(app.getHttpServer()).get('/boms').query({ styleNo }).set('Authorization', `Bearer ${token}`).expect(200);
    return res.body.data.items as any[];
  };
  const fabricRow = async () => (await getItems()).find((i) => i.material?.name === fabricName);
  const commit = (bomItems: unknown[], decisions?: unknown) =>
    post('/sales-orders/commit-analysis', { overview, bomItems, sizeSpecs: [], workNotes: null, ...(decisions ? { decisions } : {}) });

  it('신규 저장: 입력한 혼용률이 문자열 그대로 저장되고, 혼용률 없는 부자재 행은 null(저장은 막히지 않음)', async () => {
    await commit([row({ composition: '  Cotton 60% polyester 40% ' }), row({ category: '단추', itemName: buttonName, colorCode: null, spec: null })]).expect(201);
    expect((await fabricRow()).composition).toBe('Cotton 60% polyester 40%');
    const button = (await getItems()).find((i) => i.material?.name === buttonName);
    expect(button.composition ?? null).toBeNull();
  });

  it('비교 API: 기존 행과 같으면 same / 다르면 differs / 새 값이 비면 incomingEmpty (읽기 전용)', async () => {
    const compare = async (composition: unknown) =>
      (await post('/sales-orders/bom-compare', { overview, bomItems: [row({ composition })], sizeSpecs: [], workNotes: null }).expect(201)).body.data.rows.find((r: any) => r.type === 'same');
    expect((await compare('Cotton 60% polyester 40%')).compositionStatus).toBe('same');
    const differs = await compare('COTTON 100%');
    expect(differs).toMatchObject({ compositionStatus: 'differs', existingComposition: 'Cotton 60% polyester 40%', incomingComposition: 'COTTON 100%' });
    expect((await compare(null)).compositionStatus).toBe('incomingEmpty');
    expect((await fabricRow()).composition).toBe('Cotton 60% polyester 40%'); // 비교는 저장하지 않는다
  });

  it('재저장: 다른 값이 와도 기본은 기존 값 유지(COMPOSITION_DIFF_KEPT 안내)', async () => {
    const res = await commit([row({ composition: 'COTTON 100%' })]).expect(201);
    expect((await fabricRow()).composition).toBe('Cotton 60% polyester 40%');
    // commit-analysis 응답은 notices가 아니라 warnings(문자열 배열)로 알림을 돌려준다(PR-098).
    expect(res.body.data.warnings.some((w: string) => w.includes('혼용률이 기존 값과 달라 기존 값을 유지'))).toBe(true);
  });

  it('재저장: 빈 혼용률(없음/빈 문자열)은 기존 값을 지우지 않는다', async () => {
    await commit([row({ composition: '' })]).expect(201);
    await commit([row()]).expect(201);
    expect((await fabricRow()).composition).toBe('Cotton 60% polyester 40%');
  });

  it('재저장: overwriteComposition:false/없음이면 유지, true를 보낸 행만 교체', async () => {
    await commit([row({ composition: 'COTTON 100%' })], { incoming: [{ index: 0, action: 'update', overwriteComposition: false }] }).expect(201);
    expect((await fabricRow()).composition).toBe('Cotton 60% polyester 40%');
    await commit([row({ composition: 'COTTON 100%' })], { incoming: [{ index: 0, action: 'update', overwriteComposition: true }] }).expect(201);
    expect((await fabricRow()).composition).toBe('COTTON 100%');
  });

  it('비어 있던 기존 행(부자재)은 새 값으로 채우고, skipComposition:true를 보내면 채우지 않는다', async () => {
    const buttonRow = (extra: Record<string, unknown> = {}) => row({ category: '단추', itemName: buttonName, colorCode: null, spec: null, ...extra });
    await commit([buttonRow({ composition: 'ZINC 100%' })], { incoming: [{ index: 0, action: 'update', skipComposition: true }] }).expect(201);
    expect(((await getItems()).find((i) => i.material?.name === buttonName)).composition ?? null).toBeNull();
    const res = await commit([buttonRow({ composition: 'ZINC 100%' })]).expect(201);
    expect(((await getItems()).find((i) => i.material?.name === buttonName)).composition).toBe('ZINC 100%');
    expect(res.body.data.warnings.some((w: string) => w.includes('혼용률이 비어 있어 새 값으로 채웠습니다'))).toBe(true);
  });

  it('혼용률을 보내지 않는 일괄 저장 요청은 이전과 동일하게 동작한다(기존 값 그대로)', async () => {
    const before = (await fabricRow()).composition;
    await commit([row({ requiredQty: 100 })]).expect(201);
    expect((await fabricRow()).composition).toBe(before);
  });

  it('검증: 길이 500자 초과 혼용률은 400', async () => {
    await commit([row({ composition: 'A'.repeat(501) })]).expect(400);
  });
});
