import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-style-pricing-flow.sqlite');
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
import { MaterialPackagingUnitRule } from '../src/material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
import { BrandPriceRule } from '../src/brand-price-rules/entities/brand-price-rule.entity';
import { BrandPrefixRule } from '../src/brand-prefix-rules/entities/brand-prefix-rule.entity';

// PR-185: 발주 ↔ 스타일 선택적 연결(두 트랙) + 소요량 기반 수량(콘/롤 환산 포함) +
// 단가표(USD) 참고단가 + INVOICE 연계 + lines/quantity 단독 변경 가드.
describe('발주 스타일 연결·소요량·단가표 참고단가 (PR-185)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `po-style-pricing-e2e-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Style Pricing E2E' });
    await dataSource.getRepository(User).update({ email }, { role: UserRole.MANAGER });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    // PR-175 포장단위 규칙 시드(마이그레이션과 동일한 값 — sqlite e2e는 마이그레이션이 안 돈다).
    await dataSource.getRepository(MaterialPackagingUnitRule).save([
      { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 },
      { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
    ]);
    // PR-185 브랜드 전용가 시드(마이그레이션과 동일한 값).
    await dataSource.getRepository(BrandPriceRule).save([
      { brandName: '뮤트', categoryKeyword: '겉감', priceUsd: 1.0, unit: 'YD', note: '뮤트 전용가', isActive: true },
    ]);
    // 뮤트 브랜드 판정 규칙(실제 운영 데이터 패턴 — 26FOT08 등).
    await dataSource.getRepository(BrandPrefixRule).save([
      { prefix: null, isNumericStart: true, numericPattern: '^\\d{2}[FS]', brandName: '뮤트' },
    ]);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 스타일 + BOM(자재 1종) + 공급업체를 만들고 { styleNo, itemId, supplierId }를 돌려준다.
  const setupStyleWithMaterial = async (opts: { styleNo: string; itemName: string; consumption: number; threadType?: string; unit?: string }) => {
    const supplierId = (await auth(request(http()).post('/suppliers')).send({ name: `PP공급사 ${tag}` }).expect(201)).body.data.id;
    await auth(request(http()).post('/mapping/commit')).send({
      styleNo: opts.styleNo,
      overviewData: { styleNo: opts.styleNo, factory: 'Vietnam', totalQty: 1, buyer: 'PP Buyer', shipDate: '' },
      bomItems: [{
        category: '겉감', itemName: opts.itemName, spec: null, consumption: opts.consumption, requiredQty: opts.consumption,
        ...(opts.threadType ? { threadType: opts.threadType } : {}),
      }],
    }).expect(201);
    const found = await auth(request(http()).get('/items').query({ keyword: opts.itemName })).expect(200);
    const itemId = found.body.data.items.find((i: any) => i.name === opts.itemName).id;
    if (opts.unit) {
      await auth(request(http()).patch(`/items/${itemId}`)).send({ unit: opts.unit }).expect(200);
    }
    return { supplierId, itemId };
  };

  describe('A. 발주 ↔ 스타일 선택적 연결', () => {
    it('styleNo를 지정하면 스타일 연결 트랙으로 생성되고, 존재하지 않는 스타일은 400', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPA1-${tag}`, itemName: `PPA원단1 ${tag}`, consumption: 1 });
      const created = await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId, quantity: 5, unitPrice: 1000, styleNo: `PPA1-${tag}`,
      }).expect(201);
      expect(created.body.data.styleNo).toBe(`PPA1-${tag}`);

      await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId, quantity: 5, unitPrice: 1000, styleNo: `없는스타일-${tag}`,
      }).expect(400);
    });

    it('스타일은 존재하지만 최신 BOM에 그 자재가 없으면 400(두 트랙을 섞지 않음)', async () => {
      const { supplierId } = await setupStyleWithMaterial({ styleNo: `PPA2-${tag}`, itemName: `PPA원단2 ${tag}`, consumption: 1 });
      const otherItem = await auth(request(http()).post('/items')).send({ code: `PPA-OTHER-${tag}`, name: `무관자재 ${tag}`, type: 'RAW_MATERIAL' }).expect(201);
      await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId: otherItem.body.data.id, quantity: 1, unitPrice: 100, styleNo: `PPA2-${tag}`,
      }).expect(400);
    });

    it('styleNo를 안 보내면(미연결) 기존 동작 그대로다', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPA3-${tag}`, itemName: `PPA원단3 ${tag}`, consumption: 1 });
      const created = await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 1, unitPrice: 1 }).expect(201);
      expect(created.body.data.styleNo ?? null).toBeNull();
    });

    it('일괄 생성도 행마다 styleNo를 저장하고, 하나라도 유효하지 않으면 전부 거절한다', async () => {
      const a = await setupStyleWithMaterial({ styleNo: `PPA4-${tag}`, itemName: `PPA원단4 ${tag}`, consumption: 1 });
      const b = await setupStyleWithMaterial({ styleNo: `PPA5-${tag}`, itemName: `PPA원단5 ${tag}`, consumption: 1 });

      const before = (await auth(request(http()).get('/purchase-orders')).expect(200)).body.data.length;
      await auth(request(http()).post('/purchase-orders/bulk')).send({
        orders: [
          { supplierId: a.supplierId, itemId: a.itemId, quantity: 1, unitPrice: 1, styleNo: `PPA4-${tag}` },
          { supplierId: b.supplierId, itemId: b.itemId, quantity: 1, unitPrice: 1, styleNo: `없는스타일2-${tag}` },
        ],
      }).expect(400);
      const after = (await auth(request(http()).get('/purchase-orders')).expect(200)).body.data.length;
      expect(after).toBe(before); // 하나도 생성되지 않음

      const res = await auth(request(http()).post('/purchase-orders/bulk')).send({
        orders: [
          { supplierId: a.supplierId, itemId: a.itemId, quantity: 1, unitPrice: 1, styleNo: `PPA4-${tag}` },
          { supplierId: b.supplierId, itemId: b.itemId, quantity: 1, unitPrice: 1 },
        ],
      }).expect(201);
      expect(res.body.data.map((p: any) => p.styleNo ?? null)).toEqual([`PPA4-${tag}`, null]);
    });

    it('수정으로 스타일을 연결/해제/변경할 수 있고, track/styleNo 필터로 목록을 거를 수 있다', async () => {
      const a = await setupStyleWithMaterial({ styleNo: `PPA6-${tag}`, itemName: `PPA원단6 ${tag}`, consumption: 1 });
      const created = await auth(request(http()).post('/purchase-orders')).send({ supplierId: a.supplierId, itemId: a.itemId, quantity: 1, unitPrice: 1 }).expect(201);
      expect(created.body.data.styleNo ?? null).toBeNull();

      const linked = await auth(request(http()).patch(`/purchase-orders/${created.body.data.id}`)).send({ styleNo: `PPA6-${tag}` }).expect(200);
      expect(linked.body.data.styleNo).toBe(`PPA6-${tag}`);

      const byTrackStyle = await auth(request(http()).get('/purchase-orders').query({ track: 'STYLE', styleNo: `PPA6-${tag}` })).expect(200);
      expect(byTrackStyle.body.data.map((p: any) => p.id)).toContain(created.body.data.id);

      const unlinked = await auth(request(http()).patch(`/purchase-orders/${created.body.data.id}`)).send({ styleNo: null }).expect(200);
      expect(unlinked.body.data.styleNo ?? null).toBeNull();

      const byTrackItemOnly = await auth(request(http()).get('/purchase-orders').query({ track: 'ITEM_ONLY' })).expect(200);
      expect(byTrackItemOnly.body.data.every((p: any) => !p.styleNo)).toBe(true);
    });
  });

  describe('B. 소요량 — 스타일별 분리 + 참고(미연결) 집계', () => {
    it('같은 자재를 쓰는 스타일 두 개에 각각 발주해도 서로의 orderedQty에 섞이지 않는다', async () => {
      const sharedItemName = `PPB공용원단 ${tag}`;
      const supplierId = (await auth(request(http()).post('/suppliers')).send({ name: `PPB공급사 ${tag}` }).expect(201)).body.data.id;

      const styleA = `PPB-A-${tag}`;
      const styleB = `PPB-B-${tag}`;
      for (const styleNo of [styleA, styleB]) {
        await auth(request(http()).post('/mapping/commit')).send({
          styleNo,
          overviewData: { styleNo, factory: 'Vietnam', totalQty: 10, buyer: 'PPB Buyer', shipDate: '' },
          bomItems: [{ category: '겉감', itemName: sharedItemName, spec: null, consumption: 1, requiredQty: 10 }],
        }).expect(201);
      }
      const found = await auth(request(http()).get('/items').query({ keyword: sharedItemName })).expect(200);
      const itemId = found.body.data.items.find((i: any) => i.name === sharedItemName).id;

      // A에는 3, B에는 5, 그리고 스타일 미연결 발주 100(참고로만 집계돼야 함).
      await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 3, unitPrice: 1, styleNo: styleA }).expect(201);
      await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 5, unitPrice: 1, styleNo: styleB }).expect(201);
      await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 100, unitPrice: 1 }).expect(201);

      const reqA = await auth(request(http()).get('/work-orders/style-requirements').query({ styleNo: styleA, quantity: 10 })).expect(200);
      const rowA = reqA.body.data.rows.find((r: any) => r.itemId === itemId);
      expect(rowA.orderedQty).toBe(3);
      expect(rowA.unlinkedOrderedQty).toBe(100);
      expect(rowA.shortageQty).toBe(7); // 10 - 3 (미연결 100은 차감하지 않음)

      const reqB = await auth(request(http()).get('/work-orders/style-requirements').query({ styleNo: styleB, quantity: 10 })).expect(200);
      const rowB = reqB.body.data.rows.find((r: any) => r.itemId === itemId);
      expect(rowB.orderedQty).toBe(5);
      expect(rowB.shortageQty).toBe(5);
    });

    it('취소된 발주는 orderedQty에서 제외된다', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPB-C-${tag}`, itemName: `PPB원단C ${tag}`, consumption: 1 });
      const po = await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 1, unitPrice: 1, styleNo: `PPB-C-${tag}` }).expect(201);
      await auth(request(http()).patch(`/purchase-orders/${po.body.data.id}/status`)).send({ status: 'CANCELLED' }).expect(200);
      const req = await auth(request(http()).get('/work-orders/style-requirements').query({ styleNo: `PPB-C-${tag}`, quantity: 1 })).expect(200);
      const row = req.body.data.rows.find((r: any) => r.itemId === itemId);
      expect(row.orderedQty).toBe(0);
    });
  });

  describe('B-2. 실/테이프 콘·롤 환산', () => {
    it('오바사 실(threadType 지정)은 소요량 응답에서 콘 단위로 환산되고, 부족 발주 폼 수량도 콘 단위로 미리 채울 수 있다', async () => {
      const { itemId } = await setupStyleWithMaterial({
        styleNo: `PPB2-A-${tag}`, itemName: `PPB2오바사 ${tag}`, consumption: 301270, threadType: 'OBA_SA_SKU_I_SA', unit: 'CONE',
      });
      const req = await auth(request(http()).get('/work-orders/style-requirements').query({ styleNo: `PPB2-A-${tag}`, quantity: 1 })).expect(200);
      const row = req.body.data.rows.find((r: any) => r.itemId === itemId);
      expect(row.packaging).toMatchObject({ packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76 });
      expect(row.conversionWarning).toBeUndefined();
    });

    it('종류 미지정(threadType 없음)이면 환산하지 않고 경고만 준다', async () => {
      const { itemId } = await setupStyleWithMaterial({
        styleNo: `PPB2-B-${tag}`, itemName: `PPB2미지정실 ${tag}`, consumption: 10000, unit: 'CONE',
      });
      const req = await auth(request(http()).get('/work-orders/style-requirements').query({ styleNo: `PPB2-B-${tag}`, quantity: 1 })).expect(200);
      const row = req.body.data.rows.find((r: any) => r.itemId === itemId);
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
    });
  });

  describe('C. 단가표(USD) 참고단가', () => {
    it('뮤트 스타일(26F…) 겉감은 브랜드 전용가가 미도 단가표보다 먼저 후보로 나오고 suggested가 채워진다', async () => {
      const { itemId } = await setupStyleWithMaterial({ styleNo: `26FOT${tag % 100}`, itemName: `PPC뮤트겉감 ${tag}`, consumption: 1, unit: 'YD' });
      const res = await auth(request(http()).get('/purchase-orders/price-reference').query({ itemId, styleNo: `26FOT${tag % 100}` })).expect(200);
      expect(res.body.data.brand).toBe('뮤트');
      expect(res.body.data.candidates[0]).toMatchObject({ source: 'BRAND_RULE', priceUsd: 1 });
      expect(res.body.data.suggested).toMatchObject({ source: 'BRAND_RULE', priceUsd: 1 });
    });

    it('styleNo 없이 brandName도 안 주면 브랜드 전용가 후보가 없다(사람이 고르기 전에는 적용 안 함)', async () => {
      const item = await auth(request(http()).post('/items')).send({ code: `PPC-NOBRAND-${tag}`, name: `PPC무브랜드겉감 ${tag}`, type: 'RAW_MATERIAL', unit: 'YD' }).expect(201);
      const res = await auth(request(http()).get('/purchase-orders/price-reference').query({ itemId: item.body.data.id })).expect(200);
      expect(res.body.data.brand).toBeNull();
      expect(res.body.data.candidates.every((c: any) => c.source !== 'BRAND_RULE')).toBe(true);
    });

    it('없는 품목이면 404', async () => {
      await auth(request(http()).get('/purchase-orders/price-reference').query({ itemId: 999999 })).expect(404);
    });
  });

  describe('E. 상세 줄(lines)이 있는 발주는 quantity만 단독으로 바꿀 수 없다', () => {
    it('lines 없이 quantity만 보내면 400, lines와 함께 보내면 정상 수정된다', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPE1-${tag}`, itemName: `PPE원단1 ${tag}`, consumption: 1 });
      const created = await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId, unitPrice: 1, quantity: 10, lines: [{ color: 'BLACK', qty: 10 }],
      }).expect(201);

      await auth(request(http()).patch(`/purchase-orders/${created.body.data.id}`)).send({ quantity: 20 }).expect(400);

      const updated = await auth(request(http()).patch(`/purchase-orders/${created.body.data.id}`)).send({
        lines: [{ color: 'BLACK', qty: 20 }],
      }).expect(200);
      expect(updated.body.data.quantity).toBe(20);
    });

    it('상세 줄이 없는 발주는 기존처럼 quantity만 바꿀 수 있다(회귀 없음)', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPE2-${tag}`, itemName: `PPE원단2 ${tag}`, consumption: 1 });
      const created = await auth(request(http()).post('/purchase-orders')).send({ supplierId, itemId, unitPrice: 1, quantity: 5 }).expect(201);
      const updated = await auth(request(http()).patch(`/purchase-orders/${created.body.data.id}`)).send({ quantity: 9 }).expect(200);
      expect(updated.body.data.quantity).toBe(9);
    });
  });

  describe('referenceUnitPriceUsd 저장 (KRW unitPrice와 독립)', () => {
    it('양수만 허용되고, unitPrice를 대신 채우지 않는다', async () => {
      const { supplierId, itemId } = await setupStyleWithMaterial({ styleNo: `PPF1-${tag}`, itemName: `PPF원단1 ${tag}`, consumption: 1 });
      await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId, quantity: 1, unitPrice: 1, referenceUnitPriceUsd: -1,
      }).expect(400);

      const created = await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId, quantity: 1, unitPrice: 1000,
        referenceUnitPriceUsd: 0.5, referencePriceSource: 'MIDO_TABLE', referencePriceNote: '테스트 근거',
      }).expect(201);
      expect(created.body.data.referenceUnitPriceUsd).toBe(0.5);
      expect(created.body.data.unitPrice).toBe(1000); // KRW는 그대로, USD가 대신 채우지 않음
    });
  });

  describe('D. INVOICE 연계 — 발주서 참고단가를 후보로만 보여준다(자동 확정 없음)', () => {
    it('KRW unitPrice가 없는 발주(CMT 등)에 referenceUnitPriceUsd가 있으면 수출선적서류 라인 상세에 참고단가가 실린다', async () => {
      const supplierId = (await auth(request(http()).post('/suppliers')).send({ name: `PPD공급사 ${tag}` }).expect(201)).body.data.id;
      const itemName = `PPD원단 ${tag}`;
      const itemRes = await auth(request(http()).post('/items')).send({ code: `PPD-${tag}`, name: itemName, type: 'RAW_MATERIAL', unit: 'YD' }).expect(201);
      const poRes = await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId: itemRes.body.data.id, quantity: 10, referenceUnitPriceUsd: 0.8, referencePriceSource: 'BRAND_RULE', referencePriceNote: 'PPD 테스트 근거',
      }).expect(201); // unitPrice(KRW) 생략 — CMT처럼 미입력
      const purchaseOrderId = poRes.body.data.id;

      const styleNo = `PPD-STYLE-${tag}`;
      await auth(request(http()).post('/mapping/commit')).send({
        styleNo,
        overviewData: { styleNo, factory: 'Vietnam', totalQty: 10, buyer: 'PPD Buyer', shipDate: '' },
        bomItems: [{ category: 'TRIM', itemName, spec: null, consumption: 1, requiredQty: 10 }],
      }).expect(201);
      await auth(request(http()).post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)).send({
        materialCategory: 'TRIM',
        cartons: [{ cartonNo: 'CT-001', color: '1', qty: 10, itemName }],
      }).expect(201);

      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(purchaseOrderId) })).send({}).expect(201);
      const detail = await auth(request(http()).get(`/export-shipments/${gen.body.data.id}`)).expect(200);
      const line = detail.body.data.lines[0];
      expect(line.purchaseOrderReferencePrice).toEqual({ unitPriceUsd: 0.8, source: 'BRAND_RULE', note: 'PPD 테스트 근거' });
    });

    it('KRW unitPrice가 있는 발주는(자동계산 대상) 참고단가를 덧붙이지 않는다', async () => {
      const supplierId = (await auth(request(http()).post('/suppliers')).send({ name: `PPD2공급사 ${tag}` }).expect(201)).body.data.id;
      const itemName = `PPD2원단 ${tag}`;
      const itemRes = await auth(request(http()).post('/items')).send({ code: `PPD2-${tag}`, name: itemName, type: 'RAW_MATERIAL', unit: 'YD' }).expect(201);
      const poRes = await auth(request(http()).post('/purchase-orders')).send({
        supplierId, itemId: itemRes.body.data.id, quantity: 10, unitPrice: 500, referenceUnitPriceUsd: 0.8,
      }).expect(201);
      const purchaseOrderId = poRes.body.data.id;
      const styleNo = `PPD2-STYLE-${tag}`;
      await auth(request(http()).post('/mapping/commit')).send({
        styleNo,
        overviewData: { styleNo, factory: 'Vietnam', totalQty: 10, buyer: 'PPD2 Buyer', shipDate: '' },
        bomItems: [{ category: 'TRIM', itemName, spec: null, consumption: 1, requiredQty: 10 }],
      }).expect(201);
      await auth(request(http()).post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)).send({
        materialCategory: 'TRIM',
        cartons: [{ cartonNo: 'CT-001', color: '1', qty: 10, itemName }],
      }).expect(201);
      const gen = await auth(request(http()).post('/export-shipments/generate').query({ purchaseOrderIds: String(purchaseOrderId) })).send({ exchangeRateUsdKrw: 1300 }).expect(201);
      const detail = await auth(request(http()).get(`/export-shipments/${gen.body.data.id}`)).expect(200);
      expect(detail.body.data.lines[0].purchaseOrderReferencePrice ?? null).toBeNull();
    });
  });
});
