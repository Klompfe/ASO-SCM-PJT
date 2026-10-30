import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-style-color-size-quantities-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-212: MATERIAL LIST 업로드 → 커밋 → 조회 → 재업로드(값 변경) 전체 플로우. 새 합성
// 엑셀을 또 만들지 않고 test/mapping-flow.e2e-spec.ts가 이미 쓰는(저장소에 이미 있는) 실제
// 샘플 파일을 그대로 재사용한다 — MB62SLM103Z 시트는 CLOOR/SIZE 블록이 단색(NA)×3사이즈
// (55/66/77=320/300/80, 합계 700)로 알려진 고정 데이터(기존 mapping-flow 테스트가 이미
// 이 시트의 totalQty=700을 검증한다).
const SOURCE_XLSX_PATH = path.resolve(__dirname, '../docs/26-SS 미센스 Material List Update 12. 08.xlsx');

describe('색상×사이즈 수량 — 업로드/커밋/조회/재업로드 플로우 (PR-212)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const email = `qty-flow-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Qty Flow E2E' });
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201);
    jwtToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${jwtToken}`);

  let sheetPayload: any;

  it('업로드하면 MB62SLM103Z 시트의 colorSizeQuantities가 응답에 포함된다(NA/55,66,77=320,300,80)', async () => {
    const res = await auth(request(app.getHttpServer()).post('/mapping/parse')).attach('file', SOURCE_XLSX_PATH).expect(201);
    sheetPayload = res.body.data.find((s: any) => s.styleNo === 'MB62SLM103Z');
    expect(sheetPayload).toBeDefined();
    expect(sheetPayload.colorSizeQuantities.rows).toEqual(
      expect.arrayContaining([
        { color: 'NA', size: '55', qty: 320 },
        { color: 'NA', size: '66', qty: 300 },
        { color: 'NA', size: '77', qty: 80 },
      ]),
    );
  });

  it('커밋 후 GET /master-styles/:styleNo/quantities로 저장된 수량을 조회할 수 있다', async () => {
    await auth(request(app.getHttpServer()).post('/mapping/commit')).send({
      styleNo: sheetPayload.styleNo,
      overviewData: sheetPayload.overview,
      bomItems: sheetPayload.bomItems,
      colorSizeQuantities: sheetPayload.colorSizeQuantities.rows,
    }).expect(201);

    const res = await auth(request(app.getHttpServer()).get(`/master-styles/${sheetPayload.styleNo}/quantities`)).expect(200);
    expect(res.body.data.grandTotal).toBe(700);
    expect(res.body.data.sizes).toEqual(['55', '66', '77']);
    expect(res.body.data.totalByColor).toEqual([{ color: 'NA', qty: 700 }]);
  });

  it('같은 값으로 재업로드/재커밋하면 수량이 중복 저장되지 않고 합계가 그대로 700이다', async () => {
    await auth(request(app.getHttpServer()).post('/mapping/commit')).send({
      styleNo: sheetPayload.styleNo,
      overviewData: sheetPayload.overview,
      bomItems: sheetPayload.bomItems,
      colorSizeQuantities: sheetPayload.colorSizeQuantities.rows,
    }).expect(201);

    const res = await auth(request(app.getHttpServer()).get(`/master-styles/${sheetPayload.styleNo}/quantities`)).expect(200);
    expect(res.body.data.grandTotal).toBe(700);
    expect(res.body.data.rows).toHaveLength(3);
  });

  it('수량을 바꿔 재커밋하면 QTY_UPDATED 알림과 함께 값이 갱신된다', async () => {
    const changed = sheetPayload.colorSizeQuantities.rows.map((r: any) => (r.size === '55' ? { ...r, qty: 400 } : r));
    const res = await auth(request(app.getHttpServer()).post('/mapping/commit')).send({
      styleNo: sheetPayload.styleNo,
      overviewData: sheetPayload.overview,
      bomItems: sheetPayload.bomItems,
      colorSizeQuantities: changed,
    }).expect(201);

    expect(res.body.data.notices.some((n: any) => n.code === 'QTY_UPDATED')).toBe(true);
    const qtyRes = await auth(request(app.getHttpServer()).get(`/master-styles/${sheetPayload.styleNo}/quantities`)).expect(200);
    expect(qtyRes.body.data.rows).toEqual(expect.arrayContaining([{ color: 'NA', size: '55', qty: 400 }]));
    expect(qtyRes.body.data.grandTotal).toBe(780);
  });

  it('수량이 아직 없는 스타일은 404가 아니라 빈 배열을 반환한다', async () => {
    const res = await auth(request(app.getHttpServer()).get('/master-styles/NO-SUCH-STYLE-QTY/quantities')).expect(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.grandTotal).toBe(0);
  });
});
