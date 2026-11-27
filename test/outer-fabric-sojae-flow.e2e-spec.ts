import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-outer-fabric-sojae-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Bom } from '../src/boms/entities/bom.entity';

// PR-261: 구분 "소재"를 겉감 계열로 인정 — 점검·보충·작지 비교/합치기를 실제 API+DB 로 확인. 데이터 보정 없음, 합성 값만, 네트워크 호출 0.
describe('구분 "소재" = 겉감 계열 (PR-261)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const post = (url: string) => request(http()).post(url).set('Authorization', `Bearer ${token}`);
  const get = (url: string) => request(http()).get(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const email = `sojae-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Sojae E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const ov = (styleNo: string) => ({ styleNo, factory: '베트남', totalQty: 100, buyer: 'PR261 Buyer', shipDate: '' });
  const seed = (styleNo: string, bomItems: Record<string, unknown>[]) => post('/mapping/commit').send({ styleNo, overviewData: ov(styleNo), bomItems }).expect(201);
  const line = (category: string, itemName: string, composition?: string) => ({ category, itemName: `${itemName}${tag}`, consumption: 1, requiredQty: 100, ...(composition ? { composition } : {}) });
  const rows = async (styleNo: string) =>
    (await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo } }, relations: ['items', 'items.material'] })).items.sort((a, b) => a.id - b.id);
  const auditStatus = async (styleNo: string) =>
    (await get(`/boms/outer-fabric-audit?q=${styleNo}`).expect(200)).body.data.items.find((i: any) => i.styleNo === styleNo)?.status;
  const ai = (styleNo: string, bomItems: Record<string, unknown>[], decisions?: unknown) => ({
    overview: { styleNo, styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
    bomItems, sizeSpecs: [], workNotes: null, ...(decisions ? { decisions } : {}),
  });
  const aiRow = (category: string, itemName: string, composition: string | null = null) => ({ category, itemName: `${itemName}${tag}`, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null, composition });

  it('점검 API: 소재 단독은 채워지면 목록에서 빠지고, 비면 blank, 부소재만 있으면 noRow 다. 저장된 구분은 "소재" 그대로다', async () => {
    const filled = `SJ-FILLED-${tag}`;
    const blank = `SJ-BLANK-${tag}`;
    const sub = `SJ-SUB-${tag}`;
    await seed(filled, [line('소재', '원단합성A', 'X/Y=60/40')]);
    await seed(blank, [line('소재', '원단합성B')]);
    await seed(sub, [line('부소재', '원단합성C', 'X/Y=60/40')]);
    expect(await auditStatus(filled)).toBeUndefined();
    expect(await auditStatus(blank)).toBe('blank');
    expect(await auditStatus(sub)).toBe('noRow');
    expect((await rows(filled))[0].category).toBe('소재');
  });

  it('안감 기본값은 소재 행에 붙지 않는다(안감 행에만)', async () => {
    const styleNo = `SJ-LINING-${tag}`;
    await seed(styleNo, [line('소재', '원단합성D'), line('안감', '안감합성D')]);
    const [outer, lining] = await rows(styleNo);
    expect(outer.composition ?? null).toBeNull();
    expect(lining.composition).toBe('POLYESTER 100%');
  });

  it('겉감 보충: 소재 단독 스타일은 ALREADY_HAS_OUTER_FABRIC 이고 아무것도 쓰지 않는다', async () => {
    const styleNo = `SJ-SUPP-${tag}`;
    await seed(styleNo, [line('소재', '원단합성E', 'X/Y=60/40'), line('라벨', '라벨합성E')]);
    const body = { styleNo, bomItems: [{ category: '겉감 OUT-SHELL', itemName: `겉감 OUT-SHELL ${tag}`, consumption: 1 }, { category: '라벨', itemName: `라벨합성E${tag}`, consumption: 1 }] };
    for (const url of ['/mapping/outer-fabric-supplement/check', '/mapping/outer-fabric-supplement']) {
      const res = await post(url).send(body).expect(200);
      expect(res.body.data).toMatchObject({ applied: false, reason: 'ALREADY_HAS_OUTER_FABRIC' });
    }
    expect(await rows(styleNo)).toHaveLength(2);
  });

  it('작지 재인식: 기존 소재 1줄 + 새 겉감 1줄은 겉감 짝(삭제 후보 아님)이고, 합치면 구분은 "소재" 그대로·혼용률만 반영된다', async () => {
    const styleNo = `SJ-PAIR-${tag}`;
    await seed(styleNo, [line('소재', '원단합성F')]);
    const before = (await rows(styleNo))[0];
    const incoming = [aiRow('겉감', '작지소재F', 'X/Y=60/40')];
    const cmp = (await post('/sales-orders/bom-compare').send(ai(styleNo, incoming)).expect(201)).body.data.rows;
    expect(cmp).toHaveLength(1);
    expect(cmp[0]).toMatchObject({ type: 'similar', outerFabricPair: true });

    await post('/sales-orders/commit-analysis').send(ai(styleNo, incoming, { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: before.id }] })).expect(201);
    const after = await rows(styleNo);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].category).toBe('소재'); // 구분 유지
    expect(after[0].material.name).toBe(before.material.name); // 이름 유지
    expect(Number(after[0].consumption)).toBe(1);
    expect(after[0].composition).toBe('X/Y=60/40');
    expect(await auditStatus(styleNo)).toBeUndefined();
  });

  it('소재(채움)+겉감(빈칸) 공존: 점검은 blank, 새 겉감 1줄에는 짝이 없고, 합치기 요청은 거부된다(겉감 2줄과 동일)', async () => {
    const styleNo = `SJ-BOTH-${tag}`;
    await seed(styleNo, [line('소재', '원단합성G', 'X/Y=60/40'), line('겉감', '단편합성G')]);
    expect(await auditStatus(styleNo)).toBe('blank');
    const incoming = [aiRow('겉감', '작지소재G', 'X/Y=60/40')];
    const cmp = (await post('/sales-orders/bom-compare').send(ai(styleNo, incoming)).expect(201)).body.data.rows;
    expect(cmp.some((r: any) => r.outerFabricPair)).toBe(false);
    const sojae = (await rows(styleNo)).find((r) => r.category === '소재')!;
    await post('/sales-orders/commit-analysis').send(ai(styleNo, incoming, { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: sojae.id }] })).expect(400);
    expect(await rows(styleNo)).toHaveLength(2);
  });
});
