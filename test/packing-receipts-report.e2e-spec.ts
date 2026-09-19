import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-packing-receipts-report.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-118: 포장내역 집계 보고서용 GET /packing-receipts — 발주를 가로질러 TRIM(카톤) 포장내역만,
// 입고일(receivedDate) 기간 필터(양끝 포함), 발주/공급업체/품목 정보 포함.
describe('포장내역 집계 보고서 조회 (PR-118)', () => {
  let app: INestApplication;
  let token: string;
  let poA: number;
  let poB: number;
  const ids: Record<string, number> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const list = async (q: string) =>
    (await auth(request(app.getHttpServer()).get(`/packing-receipts${q}`)).expect(200)).body.data as any[];
  const mkReceipt = async (key: string, poId: number, body: any) => {
    ids[key] = (await auth(request(app.getHttpServer()).post(`/purchase-orders/${poId}/packing-receipts`)).send(body).expect(201)).body.data.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `pr-report-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PR Report E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    const supA = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '집계공급A' }).expect(201)).body.data.id;
    const supB = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '집계공급B' }).expect(201)).body.data.id;
    const item = (await auth(request(app.getHttpServer()).post('/items')).send({ code: `PKR-${Date.now()}`, name: '집계원자재', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
    const mkPo = async (supplierId: number) =>
      (await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId: item, quantity: 100, unitPrice: 1 }).expect(201)).body.data.id;
    poA = await mkPo(supA);
    poB = await mkPo(supB);

    await mkReceipt('sep1', poA, {
      materialCategory: 'TRIM', receivedDate: '2031-09-01',
      cartons: [
        { cartonNo: '1', itemName: '라벨', color: 'BK', qty: 100, weightKg: 1.5 },
        { cartonNo: '2', itemName: '라벨', color: 'BK', qty: 50, weightKg: 0.75 },
      ],
    });
    await mkReceipt('sep30', poB, { materialCategory: 'TRIM', receivedDate: '2031-09-30', cartons: [{ cartonNo: '1', itemName: '단추', color: 'WH', qty: 20 }] });
    await mkReceipt('oct5', poA, { materialCategory: 'TRIM', receivedDate: '2031-10-05', cartons: [{ cartonNo: '1', itemName: '지퍼', qty: 7, weightKg: 2 }] });
    await mkReceipt('fabric', poA, { materialCategory: 'FABRIC', receivedDate: '2031-09-10', rolls: [{ rollNo: 'R1', netWeight: 10 }] });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const mine = (rows: any[]) => rows.filter((r) => Object.values(ids).includes(r.id)).map((r) => r.id).sort((a, b) => a - b);

  it('TRIM(카톤) 포장내역만 내려주고 FABRIC(롤)은 제외한다', async () => {
    const rows = await list('');
    expect(mine(rows)).toEqual([ids.sep1, ids.sep30, ids.oct5].sort((a, b) => a - b));
    expect(rows.every((r) => r.materialCategory === 'TRIM')).toBe(true);
  });

  it('카톤·발주·공급업체·품목 정보를 함께 내려준다', async () => {
    const r = (await list('')).find((x) => x.id === ids.sep1);
    expect(r.cartons.map((c: any) => [c.cartonNo, c.itemName, c.color, c.qty])).toEqual([['1', '라벨', 'BK', 100], ['2', '라벨', 'BK', 50]]);
    expect(r.purchaseOrder.id).toBe(poA);
    expect(r.purchaseOrder.supplier.name).toBe('집계공급A');
    expect(r.purchaseOrder.item.name).toBe('집계원자재');
  });

  it('입고일 from/to 필터: 양끝 포함, 한쪽만 가능, 형식 오류는 400', async () => {
    expect(mine(await list('?from=2031-09-01&to=2031-09-30'))).toEqual([ids.sep1, ids.sep30].sort((a, b) => a - b));
    expect(mine(await list('?from=2031-09-30&to=2031-09-30'))).toEqual([ids.sep30]);
    expect(mine(await list('?from=2031-10-01'))).toEqual([ids.oct5]);
    expect(mine(await list('?to=2031-08-31'))).toEqual([]);
    await auth(request(app.getHttpServer()).get('/packing-receipts?from=bad')).expect(400);
  });
});
