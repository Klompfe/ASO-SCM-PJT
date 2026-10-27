import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-style-attribution-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-196: 발주(PurchaseOrder)가 품목(itemId)만으로 찾아지던 버그 — 다른 스타일의 같은
// 품목 발주가 섞여 보이는 문제. "미연결 발주 정리" API + 인보이스/포장내역의 스타일
// 모호성 안전장치(400)를 e2e로 검증한다.
describe('발주 스타일 귀속 — 미연결 발주 정리 / 인보이스·포장내역 모호성 안전장치 (PR-196)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));
  const get = (url: string) => auth(request(http()).get(url));
  const patch = (url: string) => auth(request(http()).patch(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `po-style-attribution-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Style Attribution E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    supplierId = (await post('/suppliers').send({ name: `PSA공급-${tag}` }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 스타일 하나 + 그 스타일 BOM에 자재 하나(itemName으로 재사용 가능)를 등록한다.
  const commitStyleWithItem = async (styleNo: string, itemName: string) => {
    await post('/mapping/commit').send({
      styleNo,
      overviewData: { styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'PSA Buyer', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName, spec: '53"', composition: 'COTTON 100%', hsCode: '5208.11', consumption: 1, requiredQty: 100 }],
    }).expect(201);
  };

  describe('공용 자재를 두 스타일이 씀 — 연결 발주 vs 미연결(모호)', () => {
    const styleA = `PSA-A-${tag}`;
    const styleB = `PSA-B-${tag}`;
    const sharedItemName = `PSA-공용원단-${tag}`;
    let sharedItemId: number;
    let linkedPoId: number; // styleA로 연결된 발주
    let unlinkedAmbiguousPoId: number; // 스타일 미연결 + 공용 자재(모호)
    let unlinkedAutoItemName: string;
    let unlinkedAutoPoId: number; // 스타일 미연결 + 자재를 쓰는 스타일이 1개뿐(자동 귀속)

    it('준비: 스타일 A·B가 같은 자재를 쓰도록 BOM을 등록한다', async () => {
      await commitStyleWithItem(styleA, sharedItemName);
      await commitStyleWithItem(styleB, sharedItemName);
      const items = (await get('/items').query({ keyword: sharedItemName })).body.data;
      const list = Array.isArray(items) ? items : items.items;
      sharedItemId = list.find((i: any) => i.name === sharedItemName).id;
    });

    it('styleNo=A로 연결된 발주를 만든다', async () => {
      const res = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 50, unitPrice: 1, styleNo: styleA }).expect(201);
      linkedPoId = res.body.data.id;
    });

    it('스타일 미연결 + 공용 자재 발주를 만든다(모호)', async () => {
      const res = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 30, unitPrice: 1 }).expect(201);
      unlinkedAmbiguousPoId = res.body.data.id;
    });

    it('스타일 미연결 + 단독으로 쓰는 자재 발주를 만든다(자동 귀속 대상)', async () => {
      unlinkedAutoItemName = `PSA-단독원단-${tag}`;
      await commitStyleWithItem(styleA, unlinkedAutoItemName);
      const items = (await get('/items').query({ keyword: unlinkedAutoItemName })).body.data;
      const list = Array.isArray(items) ? items : items.items;
      const onlyItemId = list.find((i: any) => i.name === unlinkedAutoItemName).id;
      const res = await post('/purchase-orders').send({ supplierId, itemId: onlyItemId, quantity: 10, unitPrice: 1 }).expect(201);
      unlinkedAutoPoId = res.body.data.id;
    });

    describe('GET /purchase-orders/unlinked', () => {
      it('연결 발주는 목록에 안 나오고, 모호한 미연결 발주는 candidateStyles 2개 + AMBIGUOUS, 단독 자재는 candidateStyles 1개 + AUTO다', async () => {
        const rows: any[] = (await get('/purchase-orders/unlinked').expect(200)).body.data;
        expect(rows.find((r) => r.poId === linkedPoId)).toBeUndefined();

        const ambiguousRow = rows.find((r) => r.poId === unlinkedAmbiguousPoId);
        expect(ambiguousRow.attribution).toBe('AMBIGUOUS');
        expect(ambiguousRow.candidateStyles.map((c: any) => c.styleNo).sort()).toEqual([styleA, styleB].sort());

        const autoRow = rows.find((r) => r.poId === unlinkedAutoPoId);
        expect(autoRow.attribution).toBe('AUTO');
        expect(autoRow.candidateStyles).toEqual([{ styleNo: styleA, styleName: null }]);
      });
    });

    describe('PATCH /purchase-orders/:id/style-link', () => {
      it('모호한 발주를 사람이 직접 B로 연결 확정할 수 있다', async () => {
        const res = await patch(`/purchase-orders/${unlinkedAmbiguousPoId}/style-link`).send({ styleNo: styleB }).expect(200);
        expect(res.body.data.styleNo).toBe(styleB);
      });

      it('이미 연결된 발주를 다시 연결하려 하면 400이다(재연결 범위 아님)', async () => {
        await patch(`/purchase-orders/${unlinkedAmbiguousPoId}/style-link`).send({ styleNo: styleA }).expect(400);
      });

      it('존재하지 않는 스타일로 연결하면 400이다', async () => {
        await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 5, unitPrice: 1 }).expect(201).then(async (r) => {
          await patch(`/purchase-orders/${r.body.data.id}/style-link`).send({ styleNo: `없는스타일-${tag}` }).expect(400);
        });
      });

      it('취소된 발주는 연결할 수 없다(400)', async () => {
        const res = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 7, unitPrice: 1 }).expect(201);
        const cancelId = res.body.data.id;
        await patch(`/purchase-orders/${cancelId}/status`).send({ status: 'CANCELLED' }).expect(200);
        await patch(`/purchase-orders/${cancelId}/style-link`).send({ styleNo: styleA }).expect(400);
      });
    });

    describe('POST /purchase-orders/style-link/bulk', () => {
      it('여러 건을 한 번에 연결 확정하고, 하나라도 무효면 전부 취소된다(all-or-nothing)', async () => {
        const poRes1 = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 1, unitPrice: 1 }).expect(201);
        const poRes2 = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 2, unitPrice: 1 }).expect(201);

        // 하나는 존재하지 않는 스타일 — 전체 실패해야 한다.
        await post('/purchase-orders/style-link/bulk').send({
          links: [{ poId: poRes1.body.data.id, styleNo: styleA }, { poId: poRes2.body.data.id, styleNo: `없는스타일2-${tag}` }],
        }).expect(400);
        const unchanged = (await get(`/purchase-orders/${poRes1.body.data.id}`)).body.data;
        expect(unchanged.styleNo).toBeNull();

        // 둘 다 유효하면 전부 연결된다.
        const ok = await post('/purchase-orders/style-link/bulk').send({
          links: [{ poId: poRes1.body.data.id, styleNo: styleA }, { poId: poRes2.body.data.id, styleNo: styleB }],
        }).expect(201);
        expect(ok.body.data.map((p: any) => p.styleNo).sort()).toEqual([styleA, styleB].sort());
      });
    });

    describe('POST /export-shipments/generate — 스타일 모호성 안전장치', () => {
      it('styleNo로 연결된 발주는 그 스타일로만 인보이스 라인이 생성된다(같은 자재가 다른 스타일 BOM에도 있어도)', async () => {
        await post(`/purchase-orders/${linkedPoId}/packing-receipts`).send({
          materialCategory: 'FABRIC',
          rolls: [{ rollNo: '1', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 83, netWeight: 82, thickness: 22.7, lengthYd: 50 }],
        }).expect(201);

        const res = await post('/export-shipments/generate').query({ purchaseOrderIds: String(linkedPoId) }).send({}).expect(201);
        expect(res.body.data.styleNos).toEqual([styleA]);
      });

      it('스타일에 연결되지 않았고 여러 스타일이 쓰는 자재의 발주는 400 + 안내 문구', async () => {
        const res = await post('/purchase-orders').send({ supplierId, itemId: sharedItemId, quantity: 20, unitPrice: 1 }).expect(201);
        const ambiguousPoId = res.body.data.id;
        await post(`/purchase-orders/${ambiguousPoId}/packing-receipts`).send({
          materialCategory: 'FABRIC',
          rolls: [{ rollNo: '1', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 83, netWeight: 82, thickness: 22.7, lengthYd: 20 }],
        }).expect(201);

        const genRes = await post('/export-shipments/generate').query({ purchaseOrderIds: String(ambiguousPoId) }).send({}).expect(400);
        expect(JSON.stringify(genRes.body)).toContain("미연결 발주 정리");
      });
    });
  });
});
