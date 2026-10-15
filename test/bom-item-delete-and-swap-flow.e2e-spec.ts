import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-item-delete-and-swap-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-197: 저장된 BOM 행 삭제·자재 교체·요척(소요량) 수정 — 자재 마스터/발주는 그대로
// 두고 이 스타일 BOM 행만 다룬다. 실제 사례(요척 엑셀 2.9 vs BOM 2.7로 필요량이
// 틀렸던 건) 회귀 케이스도 함께 확인한다.
describe('BOM 행 삭제·자재 교체·요척 수정 (PR-197)', () => {
  let app: INestApplication;
  let token: string;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));
  const get = (url: string) => auth(request(http()).get(url));
  const patch = (url: string) => auth(request(http()).patch(url));
  const del = (url: string) => auth(request(http()).delete(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `bom-item-delete-swap-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'BOM Item Delete/Swap E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('삭제 — DELETE /boms/items/:id', () => {
    const styleNo = `PR197-DEL-${tag}`;
    let supplierId: number;
    let materialItemId: number;
    let bomItemId: number;

    it('준비: 스타일 BOM 1행 + 그 자재로 연결 발주 1건', async () => {
      supplierId = (await post('/suppliers').send({ name: `PR197공급-${tag}` }).expect(201)).body.data.id;
      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR197 Buyer', shipDate: '' },
        bomItems: [{ category: 'FABRIC', itemName: `PR197-삭제대상-${tag}`, spec: '53"', consumption: 1, requiredQty: 100 }],
      }).expect(201);

      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      bomItemId = bomRes.body.data.items[0].id;
      materialItemId = bomRes.body.data.items[0].material.id;

      await post('/purchase-orders').send({ supplierId, itemId: materialItemId, quantity: 10, unitPrice: 1, styleNo }).expect(201);
    });

    it('삭제하면 그 행만 없어지고(Item 마스터는 그대로), 연결된 발주(취소 제외) 건수를 함께 돌려준다', async () => {
      const res = await del(`/boms/items/${bomItemId}`).expect(200);
      expect(res.body.data).toEqual({ deletedId: bomItemId, linkedPurchaseOrderCount: 1 });

      const itemRes = await get('/items/' + materialItemId).expect(200);
      expect(itemRes.body.data.id).toBe(materialItemId); // Item(자재 마스터)은 그대로 남아 있다

      const poListRes = await get('/purchase-orders').query({ styleNo }).expect(200);
      expect(poListRes.body.data).toHaveLength(1); // 발주도 그대로 남아 있다
    });

    it('삭제 후 그 스타일의 소요량 조회(getStyleRequirements)에서 그 자재가 사라진다', async () => {
      const res = await get('/work-orders/style-requirements').query({ styleNo }).expect(200);
      expect(res.body.data.rows.find((r: any) => r.itemId === materialItemId)).toBeUndefined();
    });

    it('존재하지 않는 id는 404', async () => {
      await del(`/boms/items/${bomItemId}`).expect(404);
    });
  });

  describe('자재 교체 — PATCH /boms/items/:id/material', () => {
    const styleNo = `PR197-SWAP-${tag}`;
    let bomItemId: number;
    let wrongMaterialId: number;
    let correctMaterialId: number;
    let poId: number;

    it('준비: BOM 행 1개(오인식된 이름) + 올바른 이름의 기존 자재 + 그 BOM 행 자재로 연결된 발주', async () => {
      const supplierId = (await post('/suppliers').send({ name: `PR197스왑공급-${tag}` }).expect(201)).body.data.id;
      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR197 Buyer', shipDate: '' },
        bomItems: [{ category: 'FABRIC', itemName: `스판사-${tag}`, spec: '53"', consumption: 1, requiredQty: 100 }],
      }).expect(201);
      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      bomItemId = bomRes.body.data.items[0].id;
      wrongMaterialId = bomRes.body.data.items[0].material.id;

      correctMaterialId = (await post('/items').send({ code: `PR197-CORRECT-${tag}`, name: `스쿠이사-${tag}`, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      poId = (await post('/purchase-orders').send({ supplierId, itemId: wrongMaterialId, quantity: 5, unitPrice: 1 }).expect(201)).body.data.id;
    });

    it('이미 등록된 다른 자재로 교체할 수 있다', async () => {
      const res = await patch(`/boms/items/${bomItemId}/material`).send({ materialId: correctMaterialId }).expect(200);
      expect(res.body.data.material.id).toBe(correctMaterialId);
    });

    it('교체해도 기존 발주의 itemId는 바뀌지 않는다(발주와 BOM 행은 별개 레코드)', async () => {
      const poRes = await get(`/purchase-orders/${poId}`).expect(200);
      expect(poRes.body.data.itemId).toBe(wrongMaterialId);
    });

    it('존재하지 않는 자재 이름으로 교체하려 하면 400(새로 만들지 않음)', async () => {
      await patch(`/boms/items/${bomItemId}/material`).send({ materialName: `없는자재-${tag}` }).expect(400);
    });

    it('존재하지 않는 BOM 행 id는 404', async () => {
      await patch('/boms/items/9999999/material').send({ materialId: correctMaterialId }).expect(404);
    });
  });

  describe('요척 수정 — PATCH /boms/items/:id (consumption → requiredQty 재계산)', () => {
    const styleNo = `PR197-CONS-${tag}`;
    let bomItemId: number;
    let materialItemId: number;

    it('준비: 총수량 980인 스타일에 요척 2.7로 잘못 저장된 BOM 행', async () => {
      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 980, buyer: 'PR197 Buyer', shipDate: '' },
        bomItems: [{ category: 'FABRIC', itemName: `다데실크-${tag}`, spec: '53"', consumption: 2.7, requiredQty: 2646 }],
      }).expect(201);
      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      bomItemId = bomRes.body.data.items[0].id;
      materialItemId = bomRes.body.data.items[0].material.id;
    });

    it('요척을 2.9로 고치면 requiredQty가 2.9×980=2,842로 재계산되고 응답에 before가 담긴다', async () => {
      const res = await patch(`/boms/items/${bomItemId}`).send({ consumption: 2.9 }).expect(200);
      expect(Number(res.body.data.consumption)).toBe(2.9);
      expect(Number(res.body.data.requiredQty)).toBe(2842);
      expect(res.body.data.before).toMatchObject({ consumption: 2.7, requiredQty: 2646 });
    });

    it('음수 요척은 거부된다(400)', async () => {
      await patch(`/boms/items/${bomItemId}`).send({ consumption: -1 }).expect(400);
    });

    it('숫자가 아닌 요척은 거부된다(400)', async () => {
      await patch(`/boms/items/${bomItemId}`).send({ consumption: 'abc' }).expect(400);
    });
  });
});
