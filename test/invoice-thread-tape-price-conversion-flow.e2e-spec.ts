import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-invoice-thread-tape-price-conversion-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MidoPriceItem } from '../src/mido-price-table/entities/mido-price-item.entity';

// PR-182: 수출 INVOICE — 실/테이프 미터단가를 콘/롤단가로 환산. material_packaging_unit_rules
// (PR-175)와 mido_price_items 시드(마이그레이션)가 실제로 DB에 있어야 하는 e2e라 sqlite에
// synchronize로 스키마는 맞지만 시드 데이터는 없다 — 이 테스트는 직접 등록해 둔다(마이그레이션은
// Postgres 전용 raw SQL이라 sqlite e2e에서 실행되지 않는다. 기존 e2e들과 동일한 패턴).
describe('수출 INVOICE 실/테이프 미터단가 → 콘/롤단가 환산 (PR-182)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `invoice-thread-tape-e2e-${tag}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Thread Tape E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    // material_packaging_unit_rules 시드(PR-175 마이그레이션과 동일한 값).
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    for (const rule of [
      { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
      { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 },
      { materialSubType: 'POLY_JINUIDO', displayName: '폴리지누이도', packagingUnitLabel: '콘', unitLengthM: 500 },
      { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
      { materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 },
    ]) {
      await auth(request(app.getHttpServer()).post('/material-packaging-unit-rules')).send(rule).expect(201);
    }

    // mido_price_items는 조회 전용 API만 있어(등록 엔드포인트 없음) 마이그레이션과 동일한
    // 값을 DataSource로 직접 시드한다(sqlite e2e는 synchronize만 하고 마이그레이션은 돌지 않음 — 기존 e2e들과 동일한 패턴).
    await dataSource.getRepository(MidoPriceItem).save([
      { itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
      { itemName: '테이프(TAPE) 다데', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' },
      { itemName: '테이프(TAPE) 암홀', priceUsdMin: 0.01, priceUsdMax: 0.01, unit: 'M' },
    ]);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  // 자재(실/테이프) + BOM(threadType/tapeType 포함) + 발주 + 포장내역(카톤 수량 = 콘/롤 수)을 준비한다.
  const setup = async (opts: {
    itemName: string;
    unit: string; // 'CONE' | 'ROLL'
    styleNo: string;
    threadType?: string;
    tapeType?: string;
    qty: number;
  }) => {
    const supplierRes = await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `TT 공급사 ${tag}` }).expect(201);
    const itemRes = await auth(request(app.getHttpServer()).post('/items')).send({
      code: `MAT-TT-${tag}-${Math.random().toString(36).slice(2, 6)}`,
      name: opts.itemName,
      type: 'RAW_MATERIAL',
      unit: opts.unit,
    }).expect(201);
    const poRes = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: opts.qty, unitPrice: 1,
    }).expect(201);
    const purchaseOrderId = poRes.body.data.id;

    await auth(request(app.getHttpServer()).post('/mapping/commit')).send({
      styleNo: opts.styleNo,
      overviewData: { styleNo: opts.styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'TT E2E Buyer', shipDate: '' },
      bomItems: [{
        category: 'TRIM', itemName: opts.itemName, spec: null, consumption: 1, requiredQty: 100,
        ...(opts.threadType ? { threadType: opts.threadType } : {}),
        ...(opts.tapeType ? { tapeType: opts.tapeType } : {}),
      }],
    }).expect(201);

    await auth(request(app.getHttpServer()).post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)).send({
      materialCategory: 'TRIM',
      cartons: [{ cartonNo: 'CT-001', color: '1', qty: opts.qty, itemName: opts.itemName }],
    }).expect(201);

    return purchaseOrderId;
  };

  it('실(코아사) 발주를 생성하면 라인에 materialSubType이 복사되고, 콘단가 후보는 종류가 확정돼 있으면 하나로만 환산된다', async () => {
    const styleNo = `TT-COA-${tag}`;
    const poId = await setup({ itemName: `TT 코아사 ${tag}`, unit: 'CONE', styleNo, threadType: 'COA_SA', qty: 10 });

    const gen = await auth(request(app.getHttpServer()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) })).send({}).expect(201);
    const line = gen.body.data.lines[0];
    expect(line.materialSubType).toBe('COA_SA');
    expect(line.unit).toBe('CONE');

    const candidates = await auth(request(app.getHttpServer()).get('/mido-price-table/candidates')).query({
      materialName: 'THREAD', lineUnit: line.unit, materialSubType: line.materialSubType,
    }).expect(200);
    const threadCandidate = candidates.body.data.find((c: any) => c.itemName.includes('THREAD'));
    expect(threadCandidate.conversion.determined).toBe(true);
    expect(threadCandidate.conversion.options).toEqual([
      expect.objectContaining({ materialSubType: 'COA_SA', unitPriceUsd: 0.3 }),
    ]);

    // 확정 — priceBasisNote가 그대로 저장되고 amountUsd = 확정단가 × qty(콘 수).
    const confirmRes = await auth(request(app.getHttpServer()).patch(`/export-shipments/${gen.body.data.id}/lines/${line.id}/price`)).send({
      source: 'MIDO_PRICE_TABLE', unitPriceUsd: 0.3, midoPriceItemId: threadCandidate.id,
      priceBasisNote: `미도 단가표 ${threadCandidate.conversion.options[0].formula}(코아사)`,
    }).expect(200);
    expect(Number(confirmRes.body.data.amountUsd)).toBe(3); // 0.3 × 10콘
    expect(confirmRes.body.data.priceBasisNote).toContain('코아사');
  });

  it('종류 미지정(threadType 없음)이면 자동 환산하지 않고 실 종류별 후보가 전부 나열된다', async () => {
    const styleNo = `TT-UNK-${tag}`;
    const poId = await setup({ itemName: `TT 미지정실 ${tag}`, unit: 'CONE', styleNo, qty: 5 });
    const gen = await auth(request(app.getHttpServer()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) })).send({}).expect(201);
    const line = gen.body.data.lines[0];
    expect(line.materialSubType).toBeNull();

    const candidates = await auth(request(app.getHttpServer()).get('/mido-price-table/candidates')).query({
      materialName: 'THREAD', lineUnit: 'CONE',
    }).expect(200);
    const threadCandidate = candidates.body.data.find((c: any) => c.itemName.includes('THREAD'));
    expect(threadCandidate.conversion.determined).toBe(false);
    expect(threadCandidate.conversion.warning).toContain('미지정');
    expect(threadCandidate.conversion.options.map((o: any) => o.unitPriceUsd).sort()).toEqual([0.06, 0.3, 0.48]);
  });

  it('다데 테이프는 롤단가 $0.04로 환산되고 확정된다', async () => {
    const styleNo = `TT-DADE-${tag}`;
    const poId = await setup({ itemName: `TT 다데 ${tag}`, unit: 'ROLL', styleNo, tapeType: 'DADE', qty: 4 });
    const gen = await auth(request(app.getHttpServer()).post('/export-shipments/generate').query({ purchaseOrderIds: String(poId) })).send({}).expect(201);
    const line = gen.body.data.lines[0];
    expect(line.materialSubType).toBe('DADE');

    const candidates = await auth(request(app.getHttpServer()).get('/mido-price-table/candidates')).query({
      materialName: 'TAPE', lineUnit: 'ROLL', materialSubType: 'DADE',
    }).expect(200);
    const dadeCandidate = candidates.body.data.find((c: any) => c.itemName.includes('다데'));
    expect(dadeCandidate.conversion.determined).toBe(true);
    expect(dadeCandidate.conversion.options[0].unitPriceUsd).toBe(0.04);
  });

  it('다데/암홀이 합쳐진 것으로 보이는 라인(tapeType 미지정)은 자동 확정하지 않고 두 후보 모두 나열만 한다(PR-185: 과거 일괄청구 안내문은 제거)', async () => {
    const candidates = await auth(request(app.getHttpServer()).get('/mido-price-table/candidates')).query({
      materialName: 'TAPE', lineUnit: 'ROLL',
    }).expect(200);
    const tapeCandidates = candidates.body.data.filter((c: any) => c.itemName.includes('TAPE'));
    expect(tapeCandidates).toHaveLength(2);
    for (const c of tapeCandidates) {
      expect(c.conversion.determined).toBe(false);
      expect(c.conversion.referenceNote).toBeUndefined();
    }
    expect(tapeCandidates.find((c: any) => c.itemName.includes('다데')).conversion.options[0].unitPriceUsd).toBe(0.04);
    expect(tapeCandidates.find((c: any) => c.itemName.includes('암홀')).conversion.options[0].unitPriceUsd).toBe(0.5);
  });

  it('라인 단위가 M이면(수량이 이미 미터) 환산하지 않고 미터단가를 그대로 후보로 보여준다', async () => {
    const candidates = await auth(request(app.getHttpServer()).get('/mido-price-table/candidates')).query({
      materialName: 'THREAD', lineUnit: 'M', materialSubType: 'COA_SA',
    }).expect(200);
    const threadCandidate = candidates.body.data.find((c: any) => c.itemName.includes('THREAD'));
    expect(threadCandidate.conversion).toBeUndefined();
    expect(Number(threadCandidate.priceUsdMin)).toBe(0.00012);
  });
});
