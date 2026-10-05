import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-cmt-unit-price-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-173: CMT 계약 건의 원부자재 발주는 단가 없이 생성할 수 있어야 하고(수출선적서류
// 작성 시점에만 필요), FOB 건은 기존처럼 단가가 필수여야 한다. 또한 단가 입력값의
// 소수점 정밀도가 0.01 → 0.0001 이상(최대 6자리)으로 완화됐는지도 함께 확인한다.
describe('CMT 발주 단가 선택 입력 + 소수점 정밀도 완화 회귀 테스트 (PR-173)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `po-cmt-price-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'PO CMT Price E2E' });
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

  // 품목 생성 → BOM 연결(생산유형 포함)까지 한 번에 준비한다 — /mapping/commit이
  // MasterStyle+StyleOverview+Bom+BomItem을 한 번에 만든다(export-shipments/packing-
  // receipt-template e2e 테스트와 동일한 패턴).
  const setupItemWithStyle = async (opts: { itemName: string; styleNo: string; productionType: 'CMT' | 'FOB' }) => {
    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MAT-CMTPRICE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: opts.itemName, type: 'RAW_MATERIAL' })
      .expect(201);
    const itemId = itemRes.body.data.id;

    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: opts.styleNo,
        overviewData: {
          styleNo: opts.styleNo,
          factory: '베트남',
          totalQty: 100,
          buyer: 'PO CMT Price E2E Buyer',
          productionType: opts.productionType,
          shipDate: '',
        },
        bomItems: [
          { category: 'FABRIC', itemName: opts.itemName, spec: '150cm', consumption: 1, requiredQty: 100 },
        ],
      })
      .expect(201);

    return itemId;
  };

  const createSupplier = async (name: string) => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return res.body.data.id;
  };

  describe('GET /purchase-orders/material-context', () => {
    it('CMT 스타일에 연결된 자재는 productionType: CMT를 돌려준다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `CMT Context Material ${Date.now()}`, styleNo: `CMT-CTX-${Date.now()}`, productionType: 'CMT' });
      const res = await request(app.getHttpServer())
        .get('/purchase-orders/material-context')
        .query({ itemId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.productionType).toBe('CMT');
    });

    it('FOB 스타일에 연결된 자재는 productionType: FOB를 돌려준다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `FOB Context Material ${Date.now()}`, styleNo: `FOB-CTX-${Date.now()}`, productionType: 'FOB' });
      const res = await request(app.getHttpServer())
        .get('/purchase-orders/material-context')
        .query({ itemId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.productionType).toBe('FOB');
    });

    it('BOM에 연결되지 않은 자재는 둘 다 null이다(발주 생성 자체를 막지 않음)', async () => {
      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `MAT-NOBOMCTX-${Date.now()}`, name: 'No BOM Context Material', type: 'RAW_MATERIAL' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get('/purchase-orders/material-context')
        .query({ itemId: itemRes.body.data.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data).toEqual({ styleNo: null, productionType: null });
    });
  });

  describe('단가 선택/필수 — 서버는 어느 쪽이든 단가 없이 저장을 허용한다(필수 여부 판단은 프론트 책임)', () => {
    it('unitPrice 없이 발주를 생성할 수 있고 null로 저장된다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `CMT No Price Material ${Date.now()}`, styleNo: `CMT-NOPRICE-${Date.now()}`, productionType: 'CMT' });
      const supplierId = await createSupplier('CMT No Price Supplier');

      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 100 })
        .expect(201);
      expect(res.body.data.unitPrice).toBeNull();

      const detail = await request(app.getHttpServer())
        .get(`/purchase-orders/${res.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detail.body.data.unitPrice).toBeNull();
    });

    it('unitPrice를 보내면(FOB 등) 정상적으로 저장된다(기존 동작 회귀 없음)', async () => {
      const itemId = await setupItemWithStyle({ itemName: `FOB With Price Material ${Date.now()}`, styleNo: `FOB-PRICE-${Date.now()}`, productionType: 'FOB' });
      const supplierId = await createSupplier('FOB With Price Supplier');

      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 100, unitPrice: 12.5 })
        .expect(201);
      expect(Number(res.body.data.unitPrice)).toBe(12.5);
    });
  });

  describe('단가 소수점 정밀도 완화 (0.01 → 최대 6자리)', () => {
    it('0.007(소수 3자리)이 더 이상 거부되지 않는다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `Precision 3dp Material ${Date.now()}`, styleNo: `PREC-3DP-${Date.now()}`, productionType: 'FOB' });
      const supplierId = await createSupplier('Precision 3dp Supplier');

      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 100, unitPrice: 0.007 })
        .expect(201);
      expect(Number(res.body.data.unitPrice)).toBe(0.007);
    });

    it('0.00012(소수 5자리, 실제 미도 단가표 실측 최대값)까지 저장된다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `Precision 5dp Material ${Date.now()}`, styleNo: `PREC-5DP-${Date.now()}`, productionType: 'FOB' });
      const supplierId = await createSupplier('Precision 5dp Supplier');

      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 100, unitPrice: 0.00012 })
        .expect(201);
      expect(Number(res.body.data.unitPrice)).toBe(0.00012);
    });

    it('소수 7자리(최대 허용치 초과)는 400으로 거부된다', async () => {
      const itemId = await setupItemWithStyle({ itemName: `Precision 7dp Material ${Date.now()}`, styleNo: `PREC-7DP-${Date.now()}`, productionType: 'FOB' });
      const supplierId = await createSupplier('Precision 7dp Supplier');

      await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 100, unitPrice: 0.1234567 })
        .expect(400);
    });
  });
});
