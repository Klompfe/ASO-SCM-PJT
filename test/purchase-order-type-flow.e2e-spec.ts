import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-type-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-180: 발주 구분(실발주 FIRM / 가발주 PROVISIONAL) — 제안은 BOM 스타일 계약방식 기준, 저장은 사람이 고른 값만.
describe('발주 구분 실발주/가발주 (PR-180)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;
  let itemFob: number;
  let itemCmt: number;
  let itemMixed: number;
  let itemNone: number;
  const tag = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `po-type-e2e-${tag}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Type E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `구분 공급사 ${tag}` }).expect(201)).body.data.id;

    const commit = (styleNo: string, productionType: 'FOB' | 'CMT' | undefined, bomItems: { itemName: string }[]) =>
      auth(request(app.getHttpServer()).post('/mapping/commit')).send({
        styleNo,
        overviewData: { styleNo, factory: 'Vietnam', totalQty: 10, buyer: 'PO Type Buyer', shipDate: '', productionType },
        bomItems: bomItems.map((b) => ({ category: 'FABRIC', itemName: b.itemName, spec: '150cm', consumption: 1, requiredQty: 10 })),
      }).expect(201);
    const findItem = async (name: string) =>
      ((await auth(request(app.getHttpServer()).get('/items').query({ keyword: name }))).body.data?.items ?? [])
        .find((i: any) => i.name === name)?.id;

    await commit(`FOB-${tag}`, 'FOB', [{ itemName: `FOB원단 ${tag}` }, { itemName: `공용원단 ${tag}` }]);
    await commit(`CMT-${tag}`, 'CMT', [{ itemName: `CMT원단 ${tag}` }, { itemName: `공용원단 ${tag}` }]);
    await commit(`NONE-${tag}`, undefined, [{ itemName: `계약없음원단 ${tag}` }]);
    itemFob = await findItem(`FOB원단 ${tag}`);
    itemCmt = await findItem(`CMT원단 ${tag}`);
    itemMixed = await findItem(`공용원단 ${tag}`);
    itemNone = await findItem(`계약없음원단 ${tag}`);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const suggest = (itemId: number) =>
    auth(request(app.getHttpServer()).get('/purchase-orders/order-type-suggestion').query({ itemId })).expect(200);

  it('FOB 스타일만 쓰는 자재는 실발주(FIRM)를 제안한다', async () => {
    const res = await suggest(itemFob);
    expect(res.body.data.orderType).toBe('FIRM');
    expect(res.body.data.styleNos).toEqual([`FOB-${tag}`]);
  });

  it('CMT 스타일만 쓰는 자재는 가발주(PROVISIONAL)를 제안한다', async () => {
    const res = await suggest(itemCmt);
    expect(res.body.data.orderType).toBe('PROVISIONAL');
  });

  it('FOB와 CMT 스타일이 함께 쓰는 자재는 제안하지 않는다', async () => {
    const res = await suggest(itemMixed);
    expect(res.body.data.orderType).toBeNull();
    expect(res.body.data.styleNos.sort()).toEqual([`CMT-${tag}`, `FOB-${tag}`].sort());
  });

  it('계약방식이 없는 스타일만 쓰는 자재는 제안하지 않는다', async () => {
    const res = await suggest(itemNone);
    expect(res.body.data.orderType).toBeNull();
  });

  it('발주 생성 시 사람이 고른 구분이 저장된다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId: itemCmt, quantity: 3, unitPrice: 1, orderType: 'PROVISIONAL',
    }).expect(201);
    expect(res.body.data.orderType).toBe('PROVISIONAL');
  });

  it('구분을 보내지 않으면 서버가 추측해서 채우지 않고 null로 남는다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId: itemFob, quantity: 3, unitPrice: 1,
    }).expect(201);
    expect(res.body.data.orderType).toBeNull();
  });

  it('허용되지 않는 구분 값은 400으로 거절한다', async () => {
    await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId: itemFob, quantity: 3, unitPrice: 1, orderType: 'MAYBE',
    }).expect(400);
  });

  it('일괄발주도 행마다 고른 구분을 저장한다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/purchase-orders/bulk')).send({
      orders: [
        { supplierId, itemId: itemFob, quantity: 2, unitPrice: 1, orderType: 'FIRM' },
        { supplierId, itemId: itemCmt, quantity: 2, unitPrice: 1, orderType: 'PROVISIONAL' },
      ],
    }).expect(201);
    expect(res.body.data.map((p: any) => p.orderType)).toEqual(['FIRM', 'PROVISIONAL']);
  });
});
