import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-export-shipments-search-filter-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-102: GET /export-shipments?styleNo=&materialName=&sheetNo= 검색 필터를 실제
// HTTP 요청으로 검증한다 — 스타일 A/B로 각각 자재명이 다른 선적서류를 생성한 뒤,
// 각 조건으로 필터링했을 때 정확한 건수만 반환되는지 확인한다.
describe('수출선적서류 검색 필터 (PR-102)', () => {
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

    const email = `export-search-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Export Search E2E' });
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
  const styleA = `SEARCH-A-${ts}`;
  const styleB = `SEARCH-B-${ts}`;
  const sheetNoA = `SHEET-A-${ts}`;
  let shipmentIdA: number;
  let shipmentIdB: number;

  const setupPurchaseOrderWithBomAndPackingReceipt = async (opts: {
    itemName: string;
    englishName: string;
    styleNo: string;
    composition: string;
  }) => {
    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Export Search E2E Supplier' })
      .expect(201);

    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-SEARCH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: opts.itemName,
        englishName: opts.englishName,
        type: 'RAW_MATERIAL',
      })
      .expect(201);

    const poRes = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 100, unitPrice: 1 })
      .expect(201);
    const purchaseOrderId = poRes.body.data.id;

    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: opts.styleNo,
        overviewData: { styleNo: opts.styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'Export Search E2E Buyer', shipDate: '' },
        bomItems: [
          {
            category: 'FABRIC',
            itemName: opts.itemName,
            spec: '53"',
            composition: opts.composition,
            hsCode: '6202.20.1000',
            consumption: 1,
            requiredQty: 100,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialCategory: 'FABRIC',
        rolls: [{ rollNo: '1', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 83, netWeight: 82, thickness: 22.7 }],
      })
      .expect(201);

    return purchaseOrderId;
  };

  it('사전 준비: 스타일 A(WOOL 자재)와 스타일 B(COTTON 자재)로 각각 선적서류를 생성한다', async () => {
    const poIdA = await setupPurchaseOrderWithBomAndPackingReceipt({
      itemName: `E2E Search Wool Fabric ${ts}`,
      englishName: 'WOOL FABRIC',
      styleNo: styleA,
      composition: 'WOOL 98%, POLYURETHANE 2%',
    });
    const resA = await request(app.getHttpServer())
      .post('/export-shipments/generate')
      .query({ purchaseOrderIds: String(poIdA) })
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetNo: sheetNoA })
      .expect(201);
    shipmentIdA = resA.body.data.id;

    const poIdB = await setupPurchaseOrderWithBomAndPackingReceipt({
      itemName: `E2E Search Cotton Fabric ${ts}`,
      englishName: 'COTTON FABRIC',
      styleNo: styleB,
      composition: 'COTTON 100%',
    });
    const resB = await request(app.getHttpServer())
      .post('/export-shipments/generate')
      .query({ purchaseOrderIds: String(poIdB) })
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    shipmentIdB = resB.body.data.id;

    expect(shipmentIdA).not.toBe(shipmentIdB);
  });

  it('styleNo로 검색하면 그 스타일이 포함된 선적서류만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/export-shipments')
      .query({ styleNo: styleA })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(shipmentIdA);
    expect(ids).not.toContain(shipmentIdB);
  });

  it('materialName(자재명)으로 검색하면 해당 자재를 포함한 선적서류만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/export-shipments')
      .query({ materialName: 'WOOL' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(shipmentIdA);
    expect(ids).not.toContain(shipmentIdB);
  });

  it('sheetNo(선적건번호)로 검색하면 정확히 1건만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/export-shipments')
      .query({ sheetNo: sheetNoA })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(shipmentIdA);
  });

  it('아무 필터도 지정하지 않으면 둘 다 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/export-shipments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toEqual(expect.arrayContaining([shipmentIdA, shipmentIdB]));
  });
});
