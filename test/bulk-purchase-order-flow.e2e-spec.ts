import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bulk-purchase-order-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-179: 일괄발주 — 전부 유효하면 행마다 단건과 같은 필드로 생성, 하나라도 없으면 전부 취소.
describe('일괄발주 (PR-179)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;
  let itemA: number;
  let itemB: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `bulk-po-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Bulk PO E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '일괄 공급사' }).expect(201)).body.data.id;
    itemA = (await auth(request(app.getHttpServer()).post('/items')).send({ code: `MAT-BULK-A-${Date.now()}`, name: '일괄 원단A', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
    itemB = (await auth(request(app.getHttpServer()).post('/items')).send({ code: `MAT-BULK-B-${Date.now()}`, name: '일괄 원단B', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('전부 유효하면 행마다 단건 생성과 같은 필드(수량/단가/비고/공급업체/품목)로 한 번에 생성된다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({
      orders: [
        { supplierId, itemId: itemA, quantity: 12, unitPrice: 3.5, notes: '1차' },
        { supplierId, itemId: itemB, quantity: 7, unitPrice: 0.007 },
      ],
    }).expect(201);
    expect(res.body.data).toHaveLength(2);
    const [a, b] = res.body.data;
    expect(a).toMatchObject({ quantity: 12, notes: '1차', status: 'PENDING', supplierId, itemId: itemA });
    expect(Number(a.unitPrice)).toBe(3.5);
    expect(Number(b.unitPrice)).toBe(0.007);

    const list = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ supplierId })).expect(200);
    expect(list.body.data.filter((p: any) => p.itemId === itemA || p.itemId === itemB)).toHaveLength(2);
  });

  it('행 하나라도 공급업체/품목이 없으면 404이고, 앞의 유효한 행도 만들어지지 않는다(전체 취소)', async () => {
    const before = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ supplierId })).expect(200);
    const countBefore = before.body.data.length;

    const res = await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({
      orders: [
        { supplierId, itemId: itemA, quantity: 5, unitPrice: 1 },
        { supplierId, itemId: 999999, quantity: 5, unitPrice: 1 },
      ],
    }).expect(404);
    expect(JSON.stringify(res.body)).toContain('999999');

    const after = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ supplierId })).expect(200);
    expect(after.body.data.length).toBe(countBefore);
  });

  it('빈 목록이나 잘못된 행(수량 0)은 400', async () => {
    await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({ orders: [] }).expect(400);
    await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({
      orders: [{ supplierId, itemId: itemA, quantity: 0, unitPrice: 1 }],
    }).expect(400);
  });

  // MERGE-2(PR-173+179 통합): CMT(가발주) 건은 단가가 당장 필요 없다 — 일괄발주에서도
  // unitPrice 없이 저장돼야 한다(선적서류 작성 시점에 입력).
  it('단가(unitPrice)를 생략한 행도 저장된다(CMT 발주 — 선택 입력)', async () => {
    const res = await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({
      orders: [{ supplierId, itemId: itemA, quantity: 5, orderType: 'PROVISIONAL' }],
    }).expect(201);
    expect(res.body.data[0].unitPrice).toBeNull();
    expect(res.body.data[0].orderType).toBe('PROVISIONAL');
  });
});
