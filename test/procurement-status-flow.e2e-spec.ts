import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-procurement-status-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-089: 오더관리 하위 "발주·입고·출고 현황" 리포트(GET /order-process-stages/procurement-status)가
// 실제 발주/입고/출고 데이터를 조합해 올바른 종합상태를 반환하는지 검증한다.
describe('발주·입고·출고 현황 보고서 (PR-089)', () => {
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

    const email = `procurement-status-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Procurement Status E2E' });
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

  it('로그인 없이 호출하면 401이어야 한다', async () => {
    await request(app.getHttpServer()).get('/order-process-stages/procurement-status').expect(401);
  });

  // 자재 하나짜리 BOM을 스타일에 커밋하고, 그 자재로 발주를 만든다. quantity를 넉넉히
  // 줘서 packing-receipt 롤 합계와 무관하게 발주수량 비교 경고(PR-086)가 끼어들지
  // 않게 한다(이번 테스트가 검증하려는 대상이 아니므로).
  const setupStyleWithMaterial = async (opts: { styleNo: string; itemName: string }) => {
    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Procurement Status E2E Supplier' })
      .expect(201);

    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-PSTAT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: opts.itemName,
        type: 'RAW_MATERIAL',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: opts.styleNo,
        overviewData: {
          styleNo: opts.styleNo,
          factory: 'Vietnam',
          totalQty: 100,
          buyer: 'Procurement Status E2E Buyer',
          shipDate: '',
        },
        bomItems: [
          {
            category: 'FABRIC',
            itemName: opts.itemName,
            spec: '',
            composition: 'COTTON 100%',
            consumption: 1,
            requiredQty: 100,
          },
        ],
      })
      .expect(201);

    const poRes = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 1000, unitPrice: 1 })
      .expect(201);

    return { itemId: itemRes.body.data.id as number, purchaseOrderId: poRes.body.data.id as number };
  };

  const getRow = async (styleNo: string) => {
    const res = await request(app.getHttpServer())
      .get('/order-process-stages/procurement-status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = res.body.data.find((r: any) => r.styleNo === styleNo);
    expect(row).toBeDefined();
    return row;
  };

  it('발주만 되고 입고 전이면 poCreated=true, materialReadiness 0/1, overallStatus=입고대기여야 한다', async () => {
    const styleNo = `PSTAT-CASE1-${Date.now()}`;
    await setupStyleWithMaterial({ styleNo, itemName: `PSTAT Case1 Material ${Date.now()}` });

    const row = await getRow(styleNo);
    expect(row.buyer).toBe('Procurement Status E2E Buyer');
    expect(row.poCreated).toBe(true);
    expect(row.materialReadiness).toEqual({ ready: 0, total: 1 });
    expect(row.exported).toBe(false);
    expect(row.overallStatus).toBe('입고대기');
  });

  it('발주 + 일부 입고(자재 2개 중 1개만 RECEIVED)면 materialReadiness 1/2, overallStatus=입고대기여야 한다', async () => {
    const styleNo = `PSTAT-CASE2-${Date.now()}`;
    const timestamp = Date.now();

    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Procurement Status E2E Supplier 2' })
      .expect(201);

    const item1Name = `PSTAT Case2 Material A ${timestamp}`;
    const item2Name = `PSTAT Case2 Material B ${timestamp}`;
    const item1Res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MAT-PSTAT2A-${timestamp}`, name: item1Name, type: 'RAW_MATERIAL' })
      .expect(201);
    const item2Res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MAT-PSTAT2B-${timestamp}`, name: item2Name, type: 'RAW_MATERIAL' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        overviewData: { styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'Procurement Status E2E Buyer', shipDate: '' },
        bomItems: [
          { category: 'FABRIC', itemName: item1Name, spec: '', composition: 'COTTON 100%', consumption: 1, requiredQty: 100 },
          { category: 'TRIM', itemName: item2Name, spec: '', composition: 'POLYESTER 100%', consumption: 1, requiredQty: 100 },
        ],
      })
      .expect(201);

    const po1Res = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplierRes.body.data.id, itemId: item1Res.body.data.id, quantity: 100, unitPrice: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplierRes.body.data.id, itemId: item2Res.body.data.id, quantity: 100, unitPrice: 1 })
      .expect(201);

    // 자재 A만 입고 처리(RECEIVED), 자재 B는 PENDING으로 남긴다.
    await request(app.getHttpServer())
      .patch(`/purchase-orders/${po1Res.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' })
      .expect(200);

    const row = await getRow(styleNo);
    expect(row.poCreated).toBe(true);
    expect(row.materialReadiness).toEqual({ ready: 1, total: 2 });
    expect(row.exported).toBe(false);
    expect(row.overallStatus).toBe('입고대기');
  });

  it('발주 + 전체 입고 + 출고(export-shipments/generate)까지 완료되면 overallStatus=완료여야 한다', async () => {
    const styleNo = `PSTAT-CASE3-${Date.now()}`;
    const { purchaseOrderId } = await setupStyleWithMaterial({
      styleNo,
      itemName: `PSTAT Case3 Material ${Date.now()}`,
    });

    await request(app.getHttpServer())
      .patch(`/purchase-orders/${purchaseOrderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' })
      .expect(200);

    // 완전 입고 상태에서는 아직 출고대기여야 한다(출고 전).
    const beforeExport = await getRow(styleNo);
    expect(beforeExport.materialReadiness).toEqual({ ready: 1, total: 1 });
    expect(beforeExport.exported).toBe(false);
    expect(beforeExport.overallStatus).toBe('출고대기');

    await request(app.getHttpServer())
      .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialCategory: 'FABRIC',
        rolls: [{ rollNo: '1', color: '1', widthCm: 100, widthInch: 39.4, grossWeight: 10, netWeight: 9, thickness: 20 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/export-shipments/generate')
      .query({ purchaseOrderIds: String(purchaseOrderId) })
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const afterExport = await getRow(styleNo);
    expect(afterExport.poCreated).toBe(true);
    expect(afterExport.materialReadiness).toEqual({ ready: 1, total: 1 });
    expect(afterExport.exported).toBe(true);
    expect(afterExport.overallStatus).toBe('완료');
  });
});
