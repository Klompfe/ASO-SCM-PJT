import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-requirement-by-style-flow.sqlite');
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

// PR-129: BOM 소요명세서는 작업지시가 아니라 "스타일(자재명세) + 계획수량"이 기본 경로다. 작업지시가 0건이어도 소요량이 계산돼야 하고,
// 같은 물량이면 작업지시 기준 계산과 결과가 같아야 한다(화면은 두 응답을 같은 표로 그린다).
describe('BOM 소요명세서: 스타일 기준 (PR-129)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const item: Record<string, number> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));

  const mkStyle = async (styleNo: string, totalQty: number) => {
    await post('/master-styles').send({ styleNo, factory: '베트남', buyer: 'B', totalQty, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' }).expect(201);
    return dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo } });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `bom-by-style-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'BOM By Style' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    const supplierId = (await post('/suppliers').send({ name: 'BS공급' }).expect(201)).body.data.id;
    for (const [k, name] of [['fabric', 'BS-원단'], ['lining', 'BS-안감'], ['button', 'BS-단추']] as const) {
      item[k] = (await post('/items').send({ code: `BS-${k}`, name, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
    }
    const style = await mkStyle('BS-STYLE', 300);
    const bom = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo: 'B-BS', version: 'V1', isActive: true, style }));
    for (const [k, cons] of [['fabric', 1.25], ['lining', 0.8], ['button', 6]] as const) {
      await dataSource.getRepository(BomItem).save(
        dataSource.getRepository(BomItem).create({ bom, material: { id: item[k] } as Item, category: '겉감', colorCode: 'BK', spec: 'S', consumption: cons, requiredQty: 0, supplier: null, unitPrice: 0, remarks: '' }),
      );
    }
    await mkStyle('BS-NOBOM', 10);
    await mkStyle('BS-NOQTY', 0); // 총 생산수량 없음(0 = 기본 수량 없음)
    const noQtyStyle = await dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo: 'BS-NOQTY' } });
    const bom2 = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo: 'B-BSQ', version: 'V1', isActive: true, style: noQtyStyle }));
    await dataSource.getRepository(BomItem).save(
      dataSource.getRepository(BomItem).create({ bom: bom2, material: { id: item.fabric } as Item, category: '겉감', colorCode: 'BK', spec: 'S', consumption: 2, requiredQty: 0, supplier: null, unitPrice: 0, remarks: '' }),
    );
    // 원단 100 발주(취소 999는 제외)
    await post('/purchase-orders').send({ supplierId, itemId: item.fabric, quantity: 100, unitPrice: 1 }).expect(201);
    const cancelled = (await post('/purchase-orders').send({ supplierId, itemId: item.fabric, quantity: 999, unitPrice: 1 }).expect(201)).body.data.id;
    await auth(request(app.getHttpServer()).patch(`/purchase-orders/${cancelled}/status`)).send({ status: 'CANCELLED' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const req = async (q: string) => (await get(`/work-orders/style-requirements${q}`).expect(200)).body.data;
  const byName = (r: any) => Object.fromEntries(r.rows.map((x: any) => [x.itemName, x]));

  describe('작업지시가 0건인 상태 (이전 화면은 select가 비어 아무것도 볼 수 없었다)', () => {
    it('전제: 작업지시가 하나도 없다', async () => {
      const wo = (await get('/work-orders?page=1&limit=10').expect(200)).body.data;
      expect(wo.meta.total).toBe(0);
      expect(wo.items).toEqual([]);
    });

    it('스타일+계획수량만으로 필요 총수량/이미 발주/부족이 계산된다(취소 발주 제외)', async () => {
      const r = await req('?styleNo=BS-STYLE&quantity=1000');
      expect(r).toMatchObject({ styleNo: 'BS-STYLE', styleExists: true, quantity: 1000, quantitySource: 'REQUESTED', styleTotalQty: 300, reason: null });
      const by = byName(r);
      expect(by['BS-원단']).toMatchObject({ consumptionPerUnit: 1.25, requiredQty: 1250, orderedQty: 100, shortageQty: 1150 });
      expect(by['BS-안감']).toMatchObject({ requiredQty: 800, orderedQty: 0, shortageQty: 800 });
      expect(by['BS-단추']).toMatchObject({ requiredQty: 6000, orderedQty: 0, shortageQty: 6000 });
      expect(r.totals).toEqual({ materialCount: 3, shortageMaterialCount: 3 });
    });

    it('수량을 생략하면 스타일의 총 생산수량(300)으로 계산한다', async () => {
      const r = await req('?styleNo=BS-STYLE');
      expect(r).toMatchObject({ quantity: 300, quantitySource: 'STYLE_TOTAL_QTY' });
      expect(byName(r)['BS-원단'].requiredQty).toBe(375);
    });

    it('빈 quantity 파라미터(?quantity=)도 생략과 같이 스타일 총 생산수량을 쓴다', async () => {
      const r = await req('?styleNo=BS-STYLE&quantity=');
      expect(r).toMatchObject({ quantity: 300, quantitySource: 'STYLE_TOTAL_QTY' });
    });

    it('BOM이 없는 스타일은 reason NO_BOM(화면이 "아직 BOM이 등록되지 않았습니다" 안내)', async () => {
      const r = await req('?styleNo=BS-NOBOM&quantity=10');
      expect(r).toMatchObject({ reason: 'NO_BOM', rows: [], styleExists: true });
    });

    it('총 생산수량이 없는 스타일에 수량도 안 주면 quantity 0 / NONE(화면이 수량 입력 안내)', async () => {
      const r = await req('?styleNo=BS-NOQTY');
      expect(r).toMatchObject({ quantity: 0, quantitySource: 'NONE', styleTotalQty: 0 });
      const withQty = await req('?styleNo=BS-NOQTY&quantity=50');
      expect(byName(withQty)['BS-원단'].requiredQty).toBe(100); // 2 × 50
    });

    it('잘못된 요청: styleNo 없음, 0 이하/숫자 아닌 수량은 400', async () => {
      await get('/work-orders/style-requirements').expect(400);
      await get('/work-orders/style-requirements?styleNo=BS-STYLE&quantity=0').expect(400);
      await get('/work-orders/style-requirements?styleNo=BS-STYLE&quantity=-1').expect(400);
      await get('/work-orders/style-requirements?styleNo=BS-STYLE&quantity=abc').expect(400);
    });
  });

  describe('작업지시 기준(보조 경로)과 같은 계산', () => {
    it('같은 스타일·같은 물량이면 두 경로의 자재 행/합계가 일치한다', async () => {
      const fg = (await post('/items').send({ code: 'BS-FG', name: 'BS-완제품', type: 'FINISHED_GOOD', styleNo: 'BS-STYLE' }).expect(201)).body.data.id;
      const woId = (await post('/work-orders').send({ itemId: fg, targetQuantity: 1000 }).expect(201)).body.data.id;
      const byWo = (await get(`/work-orders/${woId}/material-requirements`).expect(200)).body.data;
      const byStyle = await req('?styleNo=BS-STYLE&quantity=1000');
      expect(byStyle.rows).toEqual(byWo.rows);
      expect(byStyle.totals).toEqual(byWo.totals);
      expect(byStyle.bom).toEqual(byWo.bom);
      expect(byWo.workOrder.targetQuantity).toBe(byStyle.quantity);
    });
  });
});
