import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-search-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MasterStyle } from '../src/styles/entities/master-style.entity';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';
import { Item } from '../src/items/entities/item.entity';

// PR-126: 발주 등록 화면의 검색 선택 — (1) 품목이 100개를 넘어도 검색으로 찾아 발주할 수 있다(기존 select는 최초 100개만 불러와
// 그 뒤 품목은 선택 자체가 불가능했다), (2) 공급업체 keyword 검색, (3) 스타일 → 부족 자재 → 발주 흐름.
describe('발주 등록 화면 검색 선택 (PR-126)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `po-search-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Search' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('품목 100개 초과 (기존 select의 캡 버그)', () => {
    let hiddenItemId: number; // 가장 오래된 품목 — 목록이 최신순(id DESC)이라 처음 100개에 들지 못한다
    let supplierId: number;

    beforeAll(async () => {
      // 원자재 105개(코드 PS-001 ~ PS-105). GET /items는 최신순이라, 기존 방식(limit 100)으로는 가장 오래된 5개(PS-001~005)가 보이지 않는다.
      for (let i = 1; i <= 105; i++) {
        const code = `PS-${String(i).padStart(3, '0')}`;
        const id = (await post('/items').send({ code, name: `검색자재 ${i}`, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
        if (i === 1) hiddenItemId = id;
      }
      supplierId = (await post('/suppliers').send({ name: '검색공급 Alpha' }).expect(201)).body.data.id;
    });

    it('버그 재현: 예전처럼 최초 100개만 불러오면(limit 100) 오래된 품목(PS-001)은 목록에 없어 선택할 수 없다', async () => {
      const res = (await get('/items?limit=100&type=RAW_MATERIAL').expect(200)).body.data;
      expect(res.items).toHaveLength(100);
      expect(res.meta.total).toBeGreaterThanOrEqual(105);
      expect(res.items.some((i: any) => i.code === 'PS-105')).toBe(true); // 최신 품목은 보이지만
      expect(res.items.some((i: any) => i.code === 'PS-001')).toBe(false); // 오래된 품목은 이 화면에서 선택할 방법이 없었다
    });

    it('수정 확인: 서버 검색(keyword+type+limit 20)으로 100개 밖의 품목(PS-001)도 찾아지고, 그 품목으로 발주가 생성된다', async () => {
      const res = (await get('/items?keyword=PS-001&type=RAW_MATERIAL&limit=20').expect(200)).body.data;
      expect(res.items.map((i: any) => i.code)).toEqual(['PS-001']);
      expect(res.items[0].id).toBe(hiddenItemId);

      const po = (await post('/purchase-orders').send({ supplierId, itemId: hiddenItemId, quantity: 50, unitPrice: 12.5 }).expect(201)).body.data;
      expect(po.itemId).toBe(hiddenItemId);
    });

    it('검색은 이름/코드 부분일치이고 type=RAW_MATERIAL이면 완제품 Item이 섞이지 않는다', async () => {
      await post('/items').send({ code: 'PS-FG-1', name: '검색자재 완제품', type: 'FINISHED_GOOD' }).expect(201);
      const res = (await get('/items?keyword=' + encodeURIComponent('검색자재') + '&type=RAW_MATERIAL&limit=100').expect(200)).body.data;
      expect(res.items.every((i: any) => i.type === 'RAW_MATERIAL')).toBe(true);
      expect(res.items.some((i: any) => i.code === 'PS-FG-1')).toBe(false);
      expect((await get('/items?keyword=NO-SUCH-KEYWORD&limit=20').expect(200)).body.data.items).toEqual([]);
    });

    it('최근 발주 이력: GET /purchase-orders?itemId= 는 최신(id 내림차순)이 첫 번째라 공급업체/단가 자동 채움에 쓸 수 있다', async () => {
      const second = (await post('/suppliers').send({ name: '검색공급 Beta' }).expect(201)).body.data.id;
      await post('/purchase-orders').send({ supplierId: second, itemId: hiddenItemId, quantity: 10, unitPrice: 20 }).expect(201);
      const list = (await get(`/purchase-orders?itemId=${hiddenItemId}`).expect(200)).body.data;
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]).toMatchObject({ supplierId: second });
      expect(Number(list[0].unitPrice)).toBe(20); // 가장 최근 발주의 값
      expect(list[0].supplier.name).toBe('검색공급 Beta');
      expect((await get('/purchase-orders?itemId=999999').expect(200)).body.data).toEqual([]); // 이력 없음
    });
  });

  describe('공급업체 keyword 검색', () => {
    beforeAll(async () => {
      await post('/suppliers').send({ name: 'Gamma Textile', abbrCode: 'gt' }).expect(201);
      await post('/suppliers').send({ name: '델타 부자재상사' }).expect(201);
    });
    const names = async (q: string) => (await get(`/suppliers${q}`).expect(200)).body.data.map((s: any) => s.name);

    it('부분일치·대소문자 무시(영문), 한글 부분일치, 약칭/코드로도 검색된다', async () => {
      expect(await names('?keyword=gamma')).toEqual(['Gamma Textile']);
      expect(await names('?keyword=TEXTILE')).toEqual(['Gamma Textile']);
      expect(await names('?keyword=' + encodeURIComponent('부자재'))).toEqual(['델타 부자재상사']);
      expect(await names('?keyword=GT')).toContain('Gamma Textile'); // 약칭 gt (대소문자 무시)
    });

    it('결과 없음은 빈 배열, keyword가 없으면 전체(기존 동작)', async () => {
      expect(await names('?keyword=zzzz-none')).toEqual([]);
      const all = await names('');
      expect(all).toEqual(expect.arrayContaining(['Gamma Textile', '델타 부자재상사', '검색공급 Alpha', '검색공급 Beta']));
      expect(await names('?keyword=')).toEqual(all);
    });
  });

  describe('스타일 기준 부족 자재 → 발주 흐름', () => {
    const mat: Record<string, number> = {};
    let supplierId: number;

    beforeAll(async () => {
      for (const [k, name] of [['fabric', 'SR-원단'], ['lining', 'SR-안감'], ['button', 'SR-단추']] as const) {
        mat[k] = (await post('/items').send({ code: `SR-${k}`, name, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      }
      supplierId = (await post('/suppliers').send({ name: 'SR공급' }).expect(201)).body.data.id;
      await post('/master-styles').send({ styleNo: 'SR-STYLE', factory: '베트남', buyer: 'B', totalQty: 300, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' }).expect(201);
      const style = await dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo: 'SR-STYLE' } });
      const bom = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo: 'B-SR', version: 'V1', isActive: true, style }));
      for (const [k, cons] of [['fabric', 1.25], ['lining', 0.8], ['button', 6]] as const) {
        await dataSource.getRepository(BomItem).save(
          dataSource.getRepository(BomItem).create({ bom, material: { id: mat[k] } as Item, category: '겉감', colorCode: 'BK', spec: 'S', consumption: cons, requiredQty: 0, supplier: null, unitPrice: 0, remarks: '' }),
        );
      }
      await post('/master-styles').send({ styleNo: 'SR-NOBOM', factory: '베트남', buyer: 'B', totalQty: 10, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' }).expect(201);
      // 원단은 이미 100만큼 발주(취소 건 999는 제외되어야 한다)
      await post('/purchase-orders').send({ supplierId, itemId: mat.fabric, quantity: 100, unitPrice: 3 }).expect(201);
      const cancelled = (await post('/purchase-orders').send({ supplierId, itemId: mat.fabric, quantity: 999, unitPrice: 3 }).expect(201)).body.data.id;
      await auth(request(app.getHttpServer()).patch(`/purchase-orders/${cancelled}/status`)).send({ status: 'CANCELLED' }).expect(200);
    });

    const req = async (q: string) => (await get(`/work-orders/style-requirements${q}`).expect(200)).body.data;
    const byName = (r: any) => Object.fromEntries(r.rows.map((x: any) => [x.itemName, x]));

    it('스타일+수량으로 자재별 필요/이미 발주/부족을 계산한다(PR-120과 같은 계산, 취소 발주 제외)', async () => {
      const r = await req('?styleNo=SR-STYLE&quantity=1000');
      expect(r).toMatchObject({ styleNo: 'SR-STYLE', styleExists: true, quantity: 1000, quantitySource: 'REQUESTED', reason: null });
      expect(r.bom).toMatchObject({ bomNo: 'B-SR', isActive: true });
      const by = byName(r);
      expect(by['SR-원단']).toMatchObject({ consumptionPerUnit: 1.25, requiredQty: 1250, orderedQty: 100, shortageQty: 1150 });
      expect(by['SR-안감']).toMatchObject({ requiredQty: 800, orderedQty: 0, shortageQty: 800 });
      expect(by['SR-단추']).toMatchObject({ requiredQty: 6000, shortageQty: 6000 });
      expect(r.totals).toEqual({ materialCount: 3, shortageMaterialCount: 3 });
    });

    it('수량을 안 주면 스타일 총 수량(오더개요 totalQty=300)을 쓴다', async () => {
      const r = await req('?styleNo=SR-STYLE');
      expect(r).toMatchObject({ quantity: 300, quantitySource: 'STYLE_TOTAL_QTY', styleTotalQty: 300 });
      expect(byName(r)['SR-원단'].requiredQty).toBe(375);
    });

    it('BOM이 없는 스타일/존재하지 않는 스타일은 NO_BOM(에러 아님)', async () => {
      expect(await req('?styleNo=SR-NOBOM')).toMatchObject({ reason: 'NO_BOM', styleExists: true, rows: [] });
      expect(await req('?styleNo=NO-SUCH')).toMatchObject({ reason: 'NO_BOM', styleExists: false, quantitySource: 'NONE', quantity: 0 });
    });

    it('styleNo 누락/잘못된 quantity는 400', async () => {
      await get('/work-orders/style-requirements').expect(400);
      await get('/work-orders/style-requirements?styleNo=SR-STYLE&quantity=abc').expect(400);
      await get('/work-orders/style-requirements?styleNo=SR-STYLE&quantity=-5').expect(400);
    });

    it('부족 수량대로 발주하면 그 자재의 부족이 0이 된다(스타일 → 부족 자재 → 발주 → 반영 전체 흐름)', async () => {
      const before = byName(await req('?styleNo=SR-STYLE&quantity=1000'))['SR-안감'];
      await post('/purchase-orders').send({ supplierId, itemId: mat.lining, quantity: Math.ceil(before.shortageQty), unitPrice: 2 }).expect(201);
      const after = await req('?styleNo=SR-STYLE&quantity=1000');
      expect(byName(after)['SR-안감']).toMatchObject({ orderedQty: 800, shortageQty: 0 });
      expect(after.totals.shortageMaterialCount).toBe(2);
    });

    it('기존 작업지시 기준 소요명세서(PR-120)는 그대로 동작한다(공용 계산 리팩터링 회귀)', async () => {
      const fg = (await post('/items').send({ code: 'SR-FG', name: 'SR-FG', type: 'FINISHED_GOOD', styleNo: 'SR-STYLE' }).expect(201)).body.data.id;
      const wo = (await post('/work-orders').send({ itemId: fg, targetQuantity: 1000 }).expect(201)).body.data.id;
      const r = (await get(`/work-orders/${wo}/material-requirements`).expect(200)).body.data;
      expect(r.workOrder.targetQuantity).toBe(1000);
      expect(byName(r)['SR-원단'].requiredQty).toBe(1250);
    });
  });
});
