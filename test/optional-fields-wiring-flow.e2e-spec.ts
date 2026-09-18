import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-optional-fields-wiring-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-106: 여러 화면(발주/원자재입고/납품포장내역/수출선적/입출금전표)에서 백엔드 DTO엔
// 있지만 프론트 생성 폼에 입력란이 없어 절대 채워지지 않던 선택 필드들을 화면에 연결했다.
// 이 테스트는 각 백엔드 엔드포인트가 해당 필드를 실제로 저장하는지(포함/미포함 두
// 케이스 모두) HTTP 레벨로 확인한다 — carrierName/trackingNumber/notes/weightKg/
// counterpartyBuyerId 등은 이전부터 DTO에 있었지만(PR-106 조사에서 미검증으로 발견),
// estimatedArrival만 이번에 DTO에 새로 추가되었다.
describe('화면에 누락되어 있던 선택 필드 일괄 연결 (PR-106)', () => {
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

    const email = `optional-fields-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Optional Fields E2E' });
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

  describe('발주(PurchaseOrder) — notes', () => {
    let supplierId: number;
    let itemId: number;

    beforeAll(async () => {
      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `PR106 발주 테스트 공급사 ${ts}` })
        .expect(201);
      supplierId = supplierRes.body.data.id;

      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `PR106-PO-${ts}`, name: `PR106 발주 테스트 원자재 ${ts}`, type: 'RAW_MATERIAL' })
        .expect(201);
      itemId = itemRes.body.data.id;
    });

    it('notes를 포함해 생성하면 그대로 저장된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 10, unitPrice: 1.5, notes: 'PR106 비고 테스트' })
        .expect(201);
      expect(res.body.data.notes).toBe('PR106 비고 테스트');
    });

    it('notes 없이 생성해도 정상 동작한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId, quantity: 5, unitPrice: 1.5 })
        .expect(201);
      expect(res.body.data.notes ?? null).toBeNull();
    });
  });

  describe('원자재입고(Shipment) — carrierName/trackingNumber/estimatedArrival', () => {
    it('세 필드를 모두 포함해 생성하면 그대로 저장된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shipmentNumber: `PR106-SHIP-${ts}`,
          carrierName: 'DHL',
          trackingNumber: 'TRK-123456',
          estimatedArrival: '2026-10-01',
        })
        .expect(201);
      expect(res.body.data.carrierName).toBe('DHL');
      expect(res.body.data.trackingNumber).toBe('TRK-123456');
      expect(res.body.data.estimatedArrival).toBeTruthy();
      expect(String(res.body.data.estimatedArrival).slice(0, 10)).toBe('2026-10-01');
    });

    it('세 필드 없이 생성해도 정상 동작한다(하위 호환)', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipments')
        .set('Authorization', `Bearer ${token}`)
        .send({ shipmentNumber: `PR106-SHIP-NOFIELDS-${ts}` })
        .expect(201);
      expect(res.body.data.carrierName ?? null).toBeNull();
      expect(res.body.data.estimatedArrival ?? null).toBeNull();
    });
  });

  describe('납품·포장내역(PackingReceipt) — 카톤 weightKg', () => {
    let purchaseOrderId: number;

    beforeAll(async () => {
      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `PR106 포장내역 테스트 공급사 ${ts}` })
        .expect(201);
      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `PR106-PACK-${ts}`, name: `PR106 포장내역 테스트 원자재 ${ts}`, type: 'RAW_MATERIAL' })
        .expect(201);
      const poRes = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 500, unitPrice: 1 })
        .expect(201);
      purchaseOrderId = poRes.body.data.id;
    });

    it('카톤에 weightKg를 포함해 등록하면 합계(totalWeightKg)에 반영된다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          materialCategory: 'TRIM',
          cartons: [
            { cartonNo: 'PR106-CT-001', qty: 100, weightKg: 12.5 },
            { cartonNo: 'PR106-CT-002', qty: 100, weightKg: 7.5 },
          ],
        })
        .expect(201);
      expect(res.body.data.cartons.map((c: any) => Number(c.weightKg))).toEqual([12.5, 7.5]);
      expect(Number(res.body.data.totals.totalWeightKg)).toBeCloseTo(20);
    });

    it('weightKg 없이 등록해도 정상 동작한다(totalWeightKg는 0)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          materialCategory: 'TRIM',
          cartons: [{ cartonNo: 'PR106-CT-NOWEIGHT', qty: 50 }],
        })
        .expect(201);
      expect(res.body.data.cartons[0].weightKg ?? null).toBeNull();
      expect(Number(res.body.data.totals.totalWeightKg) || 0).toBe(0);
    });
  });

  describe('수출선적(ExportShipment) — invoiceDate', () => {
    const setupPurchaseOrderWithBomAndPackingReceipt = async () => {
      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `PR106 수출선적 테스트 공급사 ${Date.now()}` })
        .expect(201);
      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `PR106-EXPORT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: `PR106 수출선적 테스트 자재 ${Date.now()}`,
          englishName: 'FOR THE FACE',
          type: 'RAW_MATERIAL',
        })
        .expect(201);
      const poRes = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 2, unitPrice: 1.5 })
        .expect(201);
      const purchaseOrderId = poRes.body.data.id;

      const styleNo = `PR106-EXPORT-STYLE-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/mapping/commit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          styleNo,
          overviewData: { styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'PR106 Buyer', shipDate: '' },
          bomItems: [
            {
              category: 'FABRIC',
              itemName: itemRes.body.data.name,
              spec: '53"',
              composition: 'WOOL 98%',
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
          rolls: [{ rollNo: '1', color: '4', widthCm: 133, grossWeight: 83, netWeight: 82 }],
        })
        .expect(201);

      return purchaseOrderId;
    };

    it('invoiceDate를 포함해 생성하면 그대로 저장된다', async () => {
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt();
      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceDate: '2026-09-20' })
        .expect(201);
      expect(String(res.body.data.invoiceDate).slice(0, 10)).toBe('2026-09-20');
    });

    it('invoiceDate 없이 생성하면 null로 저장된다', async () => {
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt();
      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(res.body.data.invoiceDate ?? null).toBeNull();
    });
  });

  describe('입출금전표(CashVoucher) — counterparty/related 연결 4종', () => {
    let buyerId: number;
    let supplierId: number;
    let purchaseOrderId: number;
    let productionContractId: number;

    beforeAll(async () => {
      const buyerRes = await request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `PR106 바이어 ${ts}` })
        .expect(201);
      buyerId = buyerRes.body.data.id;

      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `PR106 전표 테스트 공급사 ${ts}` })
        .expect(201);
      supplierId = supplierRes.body.data.id;

      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `PR106-CV-${ts}`, name: `PR106 전표 테스트 원자재 ${ts}`, type: 'RAW_MATERIAL' })
        .expect(201);
      const poRes = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId, itemId: itemRes.body.data.id, quantity: 10, unitPrice: 1 })
        .expect(201);
      purchaseOrderId = poRes.body.data.id;

      const pcRes = await request(app.getHttpServer())
        .post('/production-contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          styleNo: `PR106-CV-STYLE-${ts}`,
          manufacturerId: supplierId,
          priceSource: 'PRE_AGREED',
          cmtPrice: 5,
          quantity: 100,
          contractDate: '2026-09-01',
        })
        .expect(201);
      productionContractId = pcRes.body.data.id;
    });

    it('4개 연결 필드를 모두 포함해 생성하면 그대로 저장된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/cash-vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          voucherType: 'DEPOSIT',
          voucherDate: '2026-09-15',
          amount: 1000000,
          counterpartyName: 'PR106 연결 테스트',
          counterpartyBuyerId: buyerId,
          counterpartySupplierId: supplierId,
          relatedPurchaseOrderId: purchaseOrderId,
          relatedProductionContractId: productionContractId,
          account: '국민은행 태일무역',
          category: 'PR106 테스트',
        })
        .expect(201);
      expect(res.body.data.counterpartyBuyerId).toBe(buyerId);
      expect(res.body.data.counterpartySupplierId).toBe(supplierId);
      expect(res.body.data.relatedPurchaseOrderId).toBe(purchaseOrderId);
      expect(res.body.data.relatedProductionContractId).toBe(productionContractId);
    });

    it('연결 필드 없이("연결 안 함") 생성해도 정상 동작한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/cash-vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          voucherType: 'WITHDRAWAL',
          voucherDate: '2026-09-16',
          amount: 500000,
          counterpartyName: 'PR106 연결 없음 테스트',
          account: '국민은행 태일무역',
          category: 'PR106 테스트',
        })
        .expect(201);
      expect(res.body.data.counterpartyBuyerId ?? null).toBeNull();
      expect(res.body.data.counterpartySupplierId ?? null).toBeNull();
      expect(res.body.data.relatedPurchaseOrderId ?? null).toBeNull();
      expect(res.body.data.relatedProductionContractId ?? null).toBeNull();
    });
  });
});
