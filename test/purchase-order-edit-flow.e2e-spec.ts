import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-edit-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-177: 미입고 발주 수정(PATCH) + 자재별 미입고 발주 조회(GET ?itemId&status=PENDING).
describe('발주 수정하기 흐름 회귀 테스트 (PR-177)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `po-edit-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Edit E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    supplierId = (await request(app.getHttpServer()).post('/suppliers').set('Authorization', `Bearer ${token}`).send({ name: 'PO Edit Supplier' }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const newItem = async (name: string) =>
    (await auth(request(app.getHttpServer()).post('/items')).send({ code: `MAT-EDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
  const newPo = async (itemId: number, quantity: number) =>
    (await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId, quantity, unitPrice: 4 }).expect(201)).body.data.id;

  it('발주가 없는 자재는 미입고 조회 결과가 비어 있다(→ 화면에서 "발주하기")', async () => {
    const itemId = await newItem('발주없는 원단');
    const res = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ itemId, status: 'PENDING' })).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('미입고 발주를 PATCH로 수정하면 값이 바뀌고, 미입고 조회에도 수정된 값으로 나온다', async () => {
    const itemId = await newItem('수정할 원단');
    const poId = await newPo(itemId, 10);
    await auth(request(app.getHttpServer()).patch(`/purchase-orders/${poId}`)).send({ quantity: 25, notes: '수정됨' }).expect(200);

    const res = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ itemId, status: 'PENDING' })).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: poId, quantity: 25, notes: '수정됨' });
  });

  it('같은 자재의 미입고 발주가 여러 건이면 조회 결과에 모두 나오고(화면은 가장 최근 것을 고른다), 입고된 발주는 빠진다', async () => {
    const itemId = await newItem('여러 번 나눠 발주한 원단');
    const first = await newPo(itemId, 5);
    const second = await newPo(itemId, 6);
    const third = await newPo(itemId, 7);
    await auth(request(app.getHttpServer()).patch(`/purchase-orders/${third}/status`)).send({ status: 'RECEIVED' }).expect(200);

    const res = await auth(request(app.getHttpServer()).get('/purchase-orders').query({ itemId, status: 'PENDING' })).expect(200);
    const ids = res.body.data.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([first, second]);
  });

  it('입고(RECEIVED)된 발주는 PATCH로 수정할 수 없다(400)', async () => {
    const itemId = await newItem('입고된 원단');
    const poId = await newPo(itemId, 3);
    await auth(request(app.getHttpServer()).patch(`/purchase-orders/${poId}/status`)).send({ status: 'RECEIVED' }).expect(200);
    await auth(request(app.getHttpServer()).patch(`/purchase-orders/${poId}`)).send({ quantity: 99 }).expect(400);
  });
});
