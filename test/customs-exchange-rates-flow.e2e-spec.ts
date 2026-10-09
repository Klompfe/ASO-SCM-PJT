import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-customs-exchange-rates-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User, UserRole } from '../src/users/entities/user.entity';

// PR-184: 관세청 주간환율(수출/수입) CRUD·겹침 거절·lookup/status, 그리고 수출선적서류
// 생성/환율수정 시 exchangeRateSource가 서버 스스로 판정되는지 확인한다.
describe('관세청 주간환율 CRUD · lookup/status · exchangeRateSource 판정 (PR-184)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let userToken: string;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${managerToken}`);
  const asUser = (r: request.Test) => r.set('Authorization', `Bearer ${userToken}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const managerEmail = `cer-manager-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email: managerEmail, password: 'password123!', name: 'CER Manager' });
    await dataSource.getRepository(User).update({ email: managerEmail }, { role: UserRole.MANAGER });
    managerToken = (await request(http()).post('/auth/login').send({ email: managerEmail, password: 'password123!' }).expect(201)).body.data.accessToken;

    const userEmail = `cer-user-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email: userEmail, password: 'password123!', name: 'CER User' });
    userToken = (await request(http()).post('/auth/login').send({ email: userEmail, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('등록(정상), 시작일>종료일 400, 겹침 400, 다른 구분/통화는 겹쳐도 허용', async () => {
    const created = await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'USD', validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1343, note: 'PR-184 TEST',
    }).expect(201);
    expect(created.body.data).toEqual(expect.objectContaining({ rateType: 'EXPORT', rate: 1343 }));

    await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'USD', validFrom: '2026-10-20', validTo: '2026-10-10', rate: 1300,
    }).expect(400);

    await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'USD', validFrom: '2026-10-08', validTo: '2026-10-15', rate: 1350,
    }).expect(400);

    // 다른 구분(IMPORT)은 같은 기간이어도 허용.
    const importCreated = await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'IMPORT', currency: 'USD', validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1350, note: 'PR-184 TEST',
    }).expect(201);
    expect(importCreated.body.data.rateType).toBe('IMPORT');

    // 다른 통화도 같은 기간이어도 허용.
    await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'JPY', validFrom: '2026-10-05', validTo: '2026-10-11', rate: 9.1, note: 'PR-184 TEST',
    }).expect(201);
  });

  it('수정 시 겹침을 자기 자신은 빼고 재검사한다', async () => {
    const a = await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'GBP', validFrom: '2026-11-01', validTo: '2026-11-07', rate: 1700, note: 'PR-184 TEST',
    }).expect(201);
    await auth(request(http()).patch(`/customs-exchange-rates/${a.body.data.id}`)).send({ note: 'PR-184 TEST 수정' }).expect(200);

    const b = await auth(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'GBP', validFrom: '2026-11-08', validTo: '2026-11-14', rate: 1710, note: 'PR-184 TEST',
    }).expect(201);
    await auth(request(http()).patch(`/customs-exchange-rates/${b.body.data.id}`)).send({ validFrom: '2026-11-05' }).expect(400);
  });

  it('USER는 조회 200, 등록/수정/삭제는 403', async () => {
    await asUser(request(http()).get('/customs-exchange-rates')).expect(200);
    await asUser(request(http()).post('/customs-exchange-rates')).send({
      rateType: 'EXPORT', currency: 'CNY', validFrom: '2026-12-01', validTo: '2026-12-07', rate: 190,
    }).expect(403);
  });

  it('lookup: 경계일 포함, 범위 밖이면 found:false+previous, 날짜 형식 오류 400', async () => {
    const atFrom = await auth(request(http()).get('/customs-exchange-rates/lookup')).query({ rateType: 'EXPORT', currency: 'USD', date: '2026-10-05' }).expect(200);
    expect(atFrom.body.data).toEqual(expect.objectContaining({ found: true, rate: 1343 }));
    const atTo = await auth(request(http()).get('/customs-exchange-rates/lookup')).query({ rateType: 'EXPORT', currency: 'USD', date: '2026-10-11' }).expect(200);
    expect(atTo.body.data.found).toBe(true);

    const outside = await auth(request(http()).get('/customs-exchange-rates/lookup')).query({ rateType: 'EXPORT', currency: 'USD', date: '2026-10-15' }).expect(200);
    expect(outside.body.data.found).toBe(false);
    expect(outside.body.data.previous).toEqual(expect.objectContaining({ rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' }));

    await auth(request(http()).get('/customs-exchange-rates/lookup')).query({ rateType: 'EXPORT', currency: 'USD', date: '2026/10/05' }).expect(400);
  });

  it('status: date 생략 시 형식이 맞는 오늘 날짜를 쓰고, EXPORT/IMPORT를 함께 돌려준다', async () => {
    const res = await auth(request(http()).get('/customs-exchange-rates/status')).query({ currency: 'USD' }).expect(200);
    expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.data).toHaveProperty('EXPORT');
    expect(res.body.data).toHaveProperty('IMPORT');
  });

  describe('exchangeRateSource 판정 — 수출선적서류 생성/환율수정 흐름', () => {
    const setup = async (itemName: string, qty: number) => {
      const supplierRes = await auth(request(http()).post('/suppliers')).send({ name: `CER 공급사 ${tag}` }).expect(201);
      const itemRes = await auth(request(http()).post('/items')).send({
        code: `MAT-CER-${tag}-${Math.random().toString(36).slice(2, 6)}`, name: itemName, type: 'RAW_MATERIAL', unit: 'YD',
      }).expect(201);
      const poRes = await auth(request(http()).post('/purchase-orders')).send({
        supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: qty, unitPrice: 10,
      }).expect(201);
      const purchaseOrderId = poRes.body.data.id;
      const styleNo = `CER-${tag}-${Math.random().toString(36).slice(2, 6)}`;
      await auth(request(http()).post('/mapping/commit')).send({
        styleNo,
        overviewData: { styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'CER Buyer', shipDate: '' },
        bomItems: [{ category: 'TRIM', itemName, spec: null, consumption: 1, requiredQty: qty }],
      }).expect(201);
      await auth(request(http()).post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)).send({
        materialCategory: 'TRIM',
        cartons: [{ cartonNo: 'CT-001', color: '1', qty, itemName }],
      }).expect(201);
      return purchaseOrderId;
    };

    it('생성 시 환율이 그 주 EXPORT 등록값과 같으면 CUSTOMS_WEEKLY_EXPORT로 판정한다', async () => {
      const poId = await setup(`CER 원단 EXPORT ${tag}`, 10);
      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) }))
        .send({ invoiceDate: '2026-10-07', exchangeRateUsdKrw: 1343 }).expect(201);
      expect(gen.body.data.exchangeRateSource).toBe('CUSTOMS_WEEKLY_EXPORT');
    });

    it('환율이 그 주 IMPORT 등록값과 같으면 CUSTOMS_WEEKLY_IMPORT로 판정한다', async () => {
      const poId = await setup(`CER 원단 IMPORT ${tag}`, 10);
      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) }))
        .send({ invoiceDate: '2026-10-07', exchangeRateUsdKrw: 1350 }).expect(201);
      expect(gen.body.data.exchangeRateSource).toBe('CUSTOMS_WEEKLY_IMPORT');
    });

    it('등록된 어느 쪽과도 다르면 MANUAL로 판정하고, 상세 화면 환율수정에서도 같은 규칙이 적용된다', async () => {
      const poId = await setup(`CER 원단 MANUAL ${tag}`, 10);
      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) }))
        .send({ invoiceDate: '2026-10-07', exchangeRateUsdKrw: 1399 }).expect(201);
      expect(gen.body.data.exchangeRateSource).toBe('MANUAL');

      const updated = await auth(request(http()).patch(`/export-shipments/${gen.body.data.id}/exchange-rate`))
        .send({ exchangeRateUsdKrw: 1343 }).expect(200);
      expect(updated.body.data.exchangeRateSource).toBe('CUSTOMS_WEEKLY_EXPORT');
    });

    it('환율 없이 생성하면 exchangeRateSource는 null이다', async () => {
      const poId = await setup(`CER 원단 NONE ${tag}`, 10);
      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) }))
        .send({}).expect(201);
      expect(gen.body.data.exchangeRateSource ?? null).toBeNull();
    });
  });
});
