import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-sales-order-bom-compare-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 자재와 비교" — 비교 API(읽기 전용)와
// commit()의 decisions(선택 사항) 반영을 실제 API+DB로 검증한다. 합성 자재명/스타일
// 번호만 사용(실제 업무 데이터 아님), sqlite 테스트 DB만 사용.
describe('작지 저장 전 자재 비교 + 선택 반영 저장 (PR-235)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));
  const get = (url: string) => auth(request(http()).get(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const email = `sales-order-bom-compare-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Sales Order BOM Compare E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const aiResult = (styleNo: string, bomItems: any[]) => ({
    overview: { styleNo, styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
    bomItems,
    sizeSpecs: [],
    workNotes: null,
  });

  it('기존 BOM이 없는 스타일은 hasExistingBom=false, rows는 빈 배열이다(비교 없이 바로 저장)', async () => {
    const styleNo = `PR235-NEW-${tag}`;
    const res = await post('/sales-orders/bom-compare')
      .send(aiResult(styleNo, [{ category: '부자재', itemName: `자재${tag}`, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }]))
      .expect(201);
    expect(res.body.data).toEqual({ hasExistingBom: false, rows: [] });
  });

  describe('기존 BOM이 있는 스타일', () => {
    const styleNo = `PR235-CMP-${tag}`;
    const nameA = `자재A${tag}`;
    const nameB = `자재B${tag}`;
    const nameC = `자재C${tag}`;
    let bomItemIdA: number;
    let bomItemIdB: number;
    let bomItemIdC: number;
    let materialIdA: number;
    let materialIdC: number;

    it('준비: 초기 저장(A/X, B/Y, C/W)', async () => {
      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR235 Buyer', shipDate: '' },
        bomItems: [
          { category: '부자재', itemName: nameA, colorCode: 'X', consumption: 1, requiredQty: 100 },
          { category: '부자재', itemName: nameB, colorCode: 'Y', consumption: 1, requiredQty: 50 },
          { category: '부자재', itemName: nameC, colorCode: 'W', consumption: 1, requiredQty: 30 },
        ],
      }).expect(201);

      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      const items = bomRes.body.data.items;
      bomItemIdA = items.find((i: any) => i.material.name === nameA).id;
      bomItemIdB = items.find((i: any) => i.material.name === nameB).id;
      bomItemIdC = items.find((i: any) => i.material.name === nameC).id;
      materialIdA = items.find((i: any) => i.material.name === nameA).material.id;
      materialIdC = items.find((i: any) => i.material.name === nameC).material.id;
    });

    it('비교: 완전 일치→same, 비슷한 이름→similar, 새 이름→new, 응답에 없는 기존 행→existingOnly', async () => {
      const res = await post('/sales-orders/bom-compare')
        .send(
          aiResult(styleNo, [
            { category: '부자재', itemName: nameA, colorCode: 'X', consumption: 1, requiredQty: 100, supplier: null, remarks: null },
            { category: '부자재', itemName: `${nameB}추가`, colorCode: 'Y', consumption: 1, requiredQty: 50, supplier: null, remarks: null },
            { category: '부자재', itemName: `완전신규자재${tag}`, colorCode: 'Z', consumption: 1, requiredQty: 10, supplier: null, remarks: null },
          ]),
        )
        .expect(201);

      expect(res.body.data.hasExistingBom).toBe(true);
      const byType = (t: string) => res.body.data.rows.filter((r: any) => r.type === t);
      expect(byType('same')).toHaveLength(1);
      expect(byType('same')[0].existing.itemName).toBe(nameA);
      expect(byType('similar')).toHaveLength(1);
      expect(byType('similar')[0].existing.itemName).toBe(nameB);
      expect(byType('new')).toHaveLength(1);
      expect(byType('new')[0].incoming.itemName).toBe(`완전신규자재${tag}`);
      expect(byType('existingOnly')).toHaveLength(1);
      expect(byType('existingOnly')[0].existing.itemName).toBe(nameC);
      // 비교는 읽기 전용 — BOM이 그대로 3행이어야 한다.
      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      expect(bomRes.body.data.items).toHaveLength(3);
    });

    it('mergeInto: 확정 값(수동 필요수량·확정 단가·종류 지정·비고)을 지정한 기존 행에, 전혀 다른 이름의 새 인식을 합쳐도 확정 값은 그대로다', async () => {
      await request(http()).patch(`/boms/items/${bomItemIdB}`).set('Authorization', `Bearer ${token}`)
        .send({ manualRequiredQty: 77, manualRequiredQtyNote: '현장 확인', threadType: 'COA_SA', composition: '수입산 100%' })
        .expect(200);
      // PATCH /boms/items/:id에는 unitPrice 수정 API가 없어(UpdateBomItemDto에 필드 없음)
      // "확정 단가"를 직접 테스트 DB에 반영한다(API 경로가 아니라 사전조건 구성일 뿐).
      await dataSource.query('UPDATE bom_item_details SET unitPrice = ? WHERE id = ?', [9.5, bomItemIdB]);

      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR235 Buyer', shipDate: '' },
        bomItems: [{ category: '부자재', itemName: `전혀다른이름${tag}`, colorCode: 'Y', consumption: 9, requiredQty: 999, sheetQty: 300, sheetQtyUnit: 'Y' }],
        decisions: { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: bomItemIdB }] },
      }).expect(201);

      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      const rowB = bomRes.body.data.items.find((i: any) => i.id === bomItemIdB);
      expect(rowB.material.name).toBe(nameB); // 새 Item으로 바뀌지 않았다.
      expect(Number(rowB.manualRequiredQty)).toBe(77);
      expect(Number(rowB.unitPrice)).toBe(9.5);
      expect(rowB.threadType).toBe('COA_SA');
      expect(Number(rowB.consumption)).toBe(1); // 확정 요척 — 9로 안 바뀜.
      // 들고 온 전혀 다른 이름으로 새 Item이 만들어지지 않았다.
      const itemsByBogusName = await request(http()).get('/items').query({ keyword: `전혀다른이름${tag}` }).set('Authorization', `Bearer ${token}`).expect(200);
      expect(itemsByBogusName.body.data.items).toHaveLength(0);

      const bomRes2 = await get('/boms').query({ styleNo }).expect(200);
      expect(bomRes2.body.data.items).toHaveLength(3); // 행 수 그대로(새로 추가되지 않음).
    });

    it('existing delete: 발주가 연결된 행을 삭제하려 하면 400으로 거부되고 그대로 남는다', async () => {
      const supplierId = (await post('/suppliers').send({ name: `PR235공급-${tag}` }).expect(201)).body.data.id;
      await post('/purchase-orders').send({ supplierId, itemId: materialIdC, quantity: 5, unitPrice: 1, styleNo }).expect(201);

      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR235 Buyer', shipDate: '' },
        bomItems: [],
        decisions: { existing: [{ bomItemId: bomItemIdC, action: 'delete' }] },
      }).expect(400);

      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      expect(bomRes.body.data.items.some((i: any) => i.id === bomItemIdC)).toBe(true); // 그대로 남아 있다.
    });

    it('existing delete: 연결된 발주가 없는 행은 삭제되고, 자재 마스터(Item)는 남는다', async () => {
      await post('/mapping/commit').send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR235 Buyer', shipDate: '' },
        bomItems: [],
        decisions: { existing: [{ bomItemId: bomItemIdA, action: 'delete' }] },
      }).expect(201);

      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      expect(bomRes.body.data.items.some((i: any) => i.id === bomItemIdA)).toBe(false); // BOM 행은 없어졌다.

      const itemRes = await request(http()).get(`/items/${materialIdA}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(itemRes.body.data.id).toBe(materialIdA); // 자재 마스터는 그대로 남아 있다.
    });
  });
});
