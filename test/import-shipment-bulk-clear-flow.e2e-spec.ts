import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipment-bulk-clear-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-152: 수입통관 INV/PKL(invoiceNo) 단위 일괄 통관완료처리.
describe('수입통관 일괄 통관완료처리 (PR-152)', () => {
  let app: INestApplication;
  let token: string;

  const post = (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);
  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const put = (url: string) => request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${token}`);

  const createStyle = async (styleNo: string) => {
    await post('/sales-orders/commit-analysis').send({
      overview: {
        styleNo, styleName: 'Bulk Clear Test', itemType: 'JK', brand: 'Test',
        productionType: 'FOB', factory: 'TY VN', buyer: 'Test Buyer', totalQty: 100, targetRdd: '2027-01-01',
      },
      bomItems: [],
      sizeSpecs: [],
      workNotes: null,
    }).expect(201);
  };

  const createShipment = async (styleNo: string, invoiceNo: string) => {
    await createStyle(styleNo);
    const res = await post('/import-shipments').send({
      styleNo,
      invoiceNo,
      invoiceDate: '2026-09-15',
      lines: [{ itemType: "WOMEN'S JACKET", fabricType: '직물', composition: 'WOOL 98%', qty: 10, unit: 'EA' }],
    }).expect(201);
    return res.body.data.id as number;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `import-bulk-clear-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Bulk Clear E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('같은 invoiceNo로 여러 건을 만들고 일괄처리하면 전부 CLEARED가 된다', async () => {
    const invoiceNo = `TYVN-BULK-${Date.now()}`;
    const id1 = await createShipment(`BULK-A-${Date.now()}`, invoiceNo);
    const id2 = await createShipment(`BULK-B-${Date.now()}`, invoiceNo);
    const id3 = await createShipment(`BULK-C-${Date.now()}`, invoiceNo);

    const res = await post('/import-shipments/bulk-clear').send({ invoiceNo }).expect(201);

    expect(res.body.data.clearedCount).toBe(3);
    expect(res.body.data.clearedIds.sort((a: number, b: number) => a - b)).toEqual([id1, id2, id3].sort((a, b) => a - b));
    expect(res.body.data.skippedAlreadyClearedCount).toBe(0);

    for (const id of [id1, id2, id3]) {
      const detail = await get(`/import-shipments/${id}`).expect(200);
      expect(detail.body.data.status).toBe('CLEARED');
      expect(detail.body.data.clearedAt).not.toBeNull();
    }
  });

  it('일부는 이미 CLEARED, 일부는 PENDING_CLEARANCE인 경우 대기 건만 바뀌고 완료 건은 건너뛴다', async () => {
    const invoiceNo = `TYVN-MIXED-${Date.now()}`;
    const id1 = await createShipment(`MIXED-A-${Date.now()}`, invoiceNo);
    const id2 = await createShipment(`MIXED-B-${Date.now()}`, invoiceNo);

    // id1을 먼저 건별로 통관완료 처리해둔다.
    await put(`/import-shipments/${id1}/status`).send({ status: 'CLEARED' }).expect(200);

    const res = await post('/import-shipments/bulk-clear').send({ invoiceNo }).expect(201);

    expect(res.body.data.clearedCount).toBe(1);
    expect(res.body.data.clearedIds).toEqual([id2]);
    expect(res.body.data.skippedAlreadyClearedCount).toBe(1);
    expect(res.body.data.skippedAlreadyClearedIds).toEqual([id1]);
  });

  it('존재하지 않는 invoiceNo는 404', async () => {
    await post('/import-shipments/bulk-clear').send({ invoiceNo: `NO-SUCH-INVOICE-${Date.now()}` }).expect(404);
  });

  it('invoiceNo도 ids도 없으면 400', async () => {
    await post('/import-shipments/bulk-clear').send({}).expect(400);
  });

  it('빈 문자열 invoiceNo는 400', async () => {
    await post('/import-shipments/bulk-clear').send({ invoiceNo: '' }).expect(400);
  });

  it('빈 배열 ids는 400', async () => {
    await post('/import-shipments/bulk-clear').send({ ids: [] }).expect(400);
  });

  it('ids로도 일괄처리할 수 있다', async () => {
    const invoiceNo = `TYVN-IDS-${Date.now()}`;
    const id1 = await createShipment(`IDS-A-${Date.now()}`, invoiceNo);
    const id2 = await createShipment(`IDS-B-${Date.now()}`, invoiceNo);

    const res = await post('/import-shipments/bulk-clear').send({ ids: [id1, id2] }).expect(201);

    expect(res.body.data.clearedCount).toBe(2);
    const detail1 = await get(`/import-shipments/${id1}`).expect(200);
    expect(detail1.body.data.status).toBe('CLEARED');
  });

  it('기존 건별 PUT :id/status는 그대로 동작한다(회귀)', async () => {
    const id = await createShipment(`SINGLE-${Date.now()}`, `TYVN-SINGLE-${Date.now()}`);
    const res = await put(`/import-shipments/${id}/status`).send({ status: 'CLEARED' }).expect(200);
    expect(res.body.data.status).toBe('CLEARED');
  });
});
