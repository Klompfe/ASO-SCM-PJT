import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-currency-columns-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-244a: 단가 통화(currency) 컬럼 — 검증/정규화, 통화 변경 시 단가 불변, 수출 INVOICE
// 환산 가드(KRW 동일 / USD 직접 / 혼합), 엑셀·작지 업로드 기본 KRW. (모두 합성 데이터)
describe('단가 통화 컬럼 흐름 (PR-244a)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const post = (u: string) => auth(request(http()).post(u));
  const patch = (u: string) => auth(request(http()).patch(u));
  const get = (u: string) => auth(request(http()).get(u));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `currency-e2e-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Currency E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    supplierId = (await post('/suppliers').send({ name: `합성공급사-${tag}` }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  let seq = 0;
  const newItem = async (name: string) =>
    (await post('/items').send({ code: `MAT-CUR-${tag}-${++seq}`, name, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;

  describe('발주 통화 검증·정규화', () => {
    it('통화를 보내지 않으면 KRW 로 저장된다', async () => {
      const itemId = await newItem('합성원단-기본');
      const res = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 100 }).expect(201);
      expect(res.body.data.currency).toBe('KRW');
    });

    it('소문자 usd 는 USD 로 정규화되고, 빈 문자열은 KRW 가 된다', async () => {
      const itemId = await newItem('합성원단-소문자');
      const usd = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 2.5, currency: 'usd' }).expect(201);
      expect(usd.body.data.currency).toBe('USD');
      const empty = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 2.5, currency: '' }).expect(201);
      expect(empty.body.data.currency).toBe('KRW');
    });

    it('허용되지 않는 통화는 400 + 한국어 메시지(생성/일괄/수정 모두)', async () => {
      const itemId = await newItem('합성원단-거부');
      const msg = '허용되지 않는 통화입니다. KRW 또는 USD 만 선택할 수 있습니다.';
      const create = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 1, currency: 'EUR' }).expect(400);
      expect(JSON.stringify(create.body)).toContain(msg);
      const bulk = await post('/purchase-orders/bulk').send({ orders: [{ supplierId, itemId, quantity: 10, unitPrice: 1, currency: 'JPY' }] }).expect(400);
      expect(JSON.stringify(bulk.body)).toContain(msg);
      const ok = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 1 }).expect(201);
      const upd = await patch(`/purchase-orders/${ok.body.data.id}`).send({ currency: 'CNY' }).expect(400);
      expect(JSON.stringify(upd.body)).toContain(msg);
    });

    it('일괄 생성도 통화를 저장한다', async () => {
      const itemId = await newItem('합성원단-일괄');
      const res = await post('/purchase-orders/bulk')
        .send({ orders: [{ supplierId, itemId, quantity: 5, unitPrice: 3, currency: 'usd' }, { supplierId, itemId, quantity: 5, unitPrice: 3 }] })
        .expect(201);
      expect(res.body.data.map((p: any) => p.currency)).toEqual(['USD', 'KRW']);
    });

    it('통화를 바꿔도 단가 숫자는 자동 환산되지 않는다', async () => {
      const itemId = await newItem('합성원단-불변');
      const po = await post('/purchase-orders').send({ supplierId, itemId, quantity: 10, unitPrice: 1500 }).expect(201);
      const res = await patch(`/purchase-orders/${po.body.data.id}`).send({ currency: 'USD' }).expect(200);
      expect(res.body.data.currency).toBe('USD');
      expect(Number(res.body.data.unitPrice)).toBe(1500);
    });
  });

  describe('BOM 행 통화', () => {
    const commit = (styleNo: string, itemName: string, extra: Record<string, unknown> = {}) =>
      post('/mapping/commit')
        .send({
          styleNo,
          overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: '합성바이어', shipDate: '' },
          bomItems: [{ category: '부자재', itemName, spec: '53"', consumption: 1, requiredQty: 100, colorCode: 'BK', ...extra }],
        })
        .expect(201);

    it('엑셀·작지 업로드(mapping/commit)로 들어온 단가는 통화를 추측하지 않고 KRW 로 저장된다', async () => {
      const styleNo = `CUR-UP-${tag}`;
      await commit(styleNo, `합성업로드자재-${tag}`, { unitPrice: 2.5 });
      const bom = await get('/boms').query({ styleNo }).expect(200);
      expect(bom.body.data.items[0].currency).toBe('KRW');
      expect(Number(bom.body.data.items[0].unitPrice)).toBe(2.5);
    });

    it('BOM 행 통화 변경: 검증·정규화되고 단가 숫자는 그대로다', async () => {
      const styleNo = `CUR-BOM-${tag}`;
      await commit(styleNo, `합성BOM자재-${tag}`);
      const bom = await get('/boms').query({ styleNo }).expect(200);
      const id = bom.body.data.items[0].id;
      await patch(`/boms/items/${id}`).send({ unitPrice: 1234 }).expect(200);
      const res = await patch(`/boms/items/${id}`).send({ currency: 'usd' }).expect(200);
      expect(res.body.data.currency).toBe('USD');
      expect(Number(res.body.data.unitPrice)).toBe(1234);
      const bad = await patch(`/boms/items/${id}`).send({ currency: 'EUR' }).expect(400);
      expect(JSON.stringify(bad.body)).toContain('KRW 또는 USD');
      const back = await patch(`/boms/items/${id}`).send({ currency: '' }).expect(200);
      expect(back.body.data.currency).toBe('KRW');
    });
  });

  describe('수출 INVOICE USD 환산 가드', () => {
    const setupPo = async (label: string, unitPrice: number, currency?: string) => {
      const itemName = `합성INV자재-${label}-${tag}`;
      const itemId = (await post('/items').send({ code: `MAT-INV-${tag}-${++seq}`, name: itemName, englishName: 'SYN', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      const po = await post('/purchase-orders')
        .send({ supplierId, itemId, quantity: 100, unitPrice, ...(currency ? { currency } : {}) })
        .expect(201);
      const styleNo = `CUR-INV-${label}-${tag}`;
      await post('/mapping/commit')
        .send({
          styleNo,
          overviewData: { styleNo, factory: 'Vietnam', totalQty: 100, buyer: '합성바이어', shipDate: '' },
          bomItems: [{ category: 'TRIM', itemName, spec: '', composition: 'POLYESTER 100%', hsCode: '5807.10', consumption: 1, requiredQty: 100 }],
        })
        .expect(201);
      await post(`/purchase-orders/${po.body.data.id}/packing-receipts`)
        .send({ materialCategory: 'TRIM', cartons: [{ cartonNo: 'CT-1', color: '4', qty: 10, itemName }] })
        .expect(201);
      return po.body.data.id as number;
    };
    const generate = (ids: number[], rate?: number) =>
      post('/export-shipments/generate')
        .query({ purchaseOrderIds: ids.join(',') })
        .send({ sheetNo: `TY-CUR-${tag}-${++seq}`, ...(rate ? { exchangeRateUsdKrw: rate } : {}) })
        .expect(201);

    it('KRW(통화 비움) 발주: 기존과 같이 단가 ÷ 환율', async () => {
      const id = await setupPo('krw', 1500);
      const res = await generate([id], 1500);
      const line = res.body.data.lines[0];
      expect(Number(line.unitPriceUsd)).toBe(1);
      expect(Number(line.amountUsd)).toBe(10);
    });

    it('USD 발주: 환산하지 않고 단가를 그대로 USD 단가로 쓴다(환율이 있어도 나누지 않음)', async () => {
      const id = await setupPo('usd', 2.5, 'USD');
      const res = await generate([id], 1500);
      const line = res.body.data.lines[0];
      expect(Number(line.unitPriceUsd)).toBe(2.5);
      expect(Number(line.amountUsd)).toBe(25);
    });

    it('USD 발주는 환율이 없어도 USD 값이 채워지고, 한 INVOICE 에 KRW/USD 가 섞이면 행마다 따로 판단한다', async () => {
      const krw = await setupPo('mixk', 3000);
      const usd = await setupPo('mixu', 4, 'USD');
      const res = await generate([krw, usd], 1500);
      const byUnit = res.body.data.lines.map((l: any) => Number(l.unitPriceUsd)).sort((a: number, b: number) => a - b);
      expect(byUnit).toEqual([2, 4]);
      const noRate = await generate([usd]);
      expect(Number(noRate.body.data.lines[0].unitPriceUsd)).toBe(4);
    });

    it('환율 재계산(PATCH exchange-rate)도 USD 발주 행은 환산하지 않는다', async () => {
      const id = await setupPo('recalc', 5, 'USD');
      const created = await generate([id]);
      const shipmentId = created.body.data.id;
      await patch(`/export-shipments/${shipmentId}/exchange-rate`).send({ exchangeRateUsdKrw: 1400 }).expect(200);
      const after = await get(`/export-shipments/${shipmentId}`).expect(200);
      expect(Number(after.body.data.lines[0].unitPriceUsd)).toBe(5);
    });
  });
});
