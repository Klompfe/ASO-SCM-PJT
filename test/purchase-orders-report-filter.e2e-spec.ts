import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-orders-report-filter.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// PR-116: 발주 현황표가 쓰는 기간/공급업체/상태 필터. 특히 endDate는 "그날 하루 전체"를 포함해야 한다.
describe('발주 목록 필터 — 발주 현황표 (PR-116)', () => {
  let app: INestApplication;
  let token: string;
  let supplierA: number;
  let supplierB: number;
  let poIds: number[] = [];

  const post = (url: string, body: any) =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const list = async (q: string) =>
    (await request(app.getHttpServer()).get(`/purchase-orders${q}`).set('Authorization', `Bearer ${token}`).expect(200)).body.data
      .map((p: any) => p.id)
      .filter((id: number) => poIds.includes(id))
      .sort((a: number, b: number) => a - b);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `po-report-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Report E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    supplierA = (await post('/suppliers', { name: '보고서공급A' }).expect(201)).body.data.id;
    supplierB = (await post('/suppliers', { name: '보고서공급B' }).expect(201)).body.data.id;
    const itemId = (await post('/items', { code: `PO_RPT_${Date.now()}`, name: '보고서원단', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;

    const mk = async (supplierId: number, quantity: number, unitPrice: number) =>
      (await post('/purchase-orders', { supplierId, itemId, quantity, unitPrice }).expect(201)).body.data.id;
    poIds = [await mk(supplierA, 10, 100), await mk(supplierA, 5, 200), await mk(supplierB, 3, 1000)];
    // poIds[1] 입고완료, poIds[2] 취소
    await request(app.getHttpServer()).patch(`/purchase-orders/${poIds[1]}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'RECEIVED' });
    await request(app.getHttpServer()).patch(`/purchase-orders/${poIds[2]}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'CANCELLED' });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('endDate가 오늘이면 오늘 생성된 발주가 포함된다(종료일 당일 포함)', async () => {
    expect(await list(`?startDate=${isoDay(0)}&endDate=${isoDay(0)}`)).toEqual(poIds);
    expect(await list(`?endDate=${isoDay(0)}`)).toEqual(poIds);
  });

  it('기간 밖(어제까지 / 내일부터)은 제외된다', async () => {
    expect(await list(`?endDate=${isoDay(-1)}`)).toEqual([]);
    expect(await list(`?startDate=${isoDay(1)}`)).toEqual([]);
    expect(await list(`?startDate=${isoDay(-1)}&endDate=${isoDay(1)}`)).toEqual(poIds);
  });

  it('공급업체·상태 필터는 기간과 조합해서 동작한다', async () => {
    expect(await list(`?supplierId=${supplierA}`)).toEqual([poIds[0], poIds[1]]);
    expect(await list(`?status=CANCELLED&startDate=${isoDay(0)}`)).toEqual([poIds[2]]);
    expect(await list(`?supplierId=${supplierA}&status=RECEIVED&endDate=${isoDay(0)}`)).toEqual([poIds[1]]);
    expect(await list(`?supplierId=${supplierB}&status=PENDING`)).toEqual([]);
  });
});
