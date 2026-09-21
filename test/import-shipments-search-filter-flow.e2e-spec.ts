import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-search-filter-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-102: GET /import-shipments?styleNo=&materialName=&sheetNo= 검색 필터를 실제
// HTTP 요청으로 검증한다 — 스타일 A/B로 각각 다른 품목(itemType)의 수입통관 문서를
// 만든 뒤, 각 조건으로 필터링했을 때 정확한 건수만 반환되는지 확인한다.
describe('수입통관 검색 필터 (PR-102)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `import-search-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Import Search E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const ts = Date.now();
  const styleA = `IMPORT-SEARCH-A-${ts}`;
  const styleB = `IMPORT-SEARCH-B-${ts}`;
  const invoiceNoA = `TYVN-SEARCH-A-${ts}`;
  let shipmentIdA: number;
  let shipmentIdB: number;

  const createStyle = async (styleNo: string) => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo, styleName: 'Import Search Test', itemType: 'JK', brand: 'Test',
          productionType: 'FOB', factory: 'TY VN', buyer: 'Test Buyer', totalQty: 100, targetRdd: '2027-01-01',
        },
        bomItems: [], sizeSpecs: [], workNotes: null,
      })
      .expect(201);
  };

  it('사전 준비: 스타일 A(JACKET 품목)와 스타일 B(PANTS 품목)로 각각 수입통관 문서를 생성한다', async () => {
    await createStyle(styleA);
    await createStyle(styleB);

    const resA = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: styleA,
        invoiceNo: invoiceNoA,
        lines: [{ itemType: 'JACKET', qty: 100, unit: 'EA' }],
      })
      .expect(201);
    shipmentIdA = resA.body.data.id;

    const resB = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: styleB,
        lines: [{ itemType: 'PANTS', qty: 50, unit: 'EA' }],
      })
      .expect(201);
    shipmentIdB = resB.body.data.id;

    expect(shipmentIdA).not.toBe(shipmentIdB);
  });

  it('styleNo로 검색하면 그 스타일의 수입통관 문서만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/import-shipments')
      .query({ styleNo: styleA })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(shipmentIdA);
    expect(ids).not.toContain(shipmentIdB);
  });

  it('materialName(품목)으로 검색하면 해당 품목을 포함한 문서만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/import-shipments')
      .query({ materialName: 'JACKET' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(shipmentIdA);
    expect(ids).not.toContain(shipmentIdB);
  });

  it('sheetNo(INVOICE 번호)로 검색하면 정확히 1건만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/import-shipments')
      .query({ sheetNo: invoiceNoA })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(shipmentIdA);
  });

  it('아무 필터도 지정하지 않으면 둘 다 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toEqual(expect.arrayContaining([shipmentIdA, shipmentIdB]));
  });
});
