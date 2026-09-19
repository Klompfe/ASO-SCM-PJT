import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-requirements-flow.sqlite');
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

// PR-120: GET /work-orders/:id/material-requirements — 실제 작업지시 + BOM + 발주 조합으로
// 필요 총수량/이미 발주 수량/부족 수량과 BOM 선택 규칙(중복 BOM 중 최신 id)을 검증한다.
describe('BOM 소요명세서 (PR-120)', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;
  let supplierId: number;
  const item: Record<string, number> = {};
  let woId: number;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const req = async (id: number) => (await auth(request(app.getHttpServer()).get(`/work-orders/${id}/material-requirements`)).expect(200)).body.data;
  const mkItem = async (code: string, type: string, extra: any = {}) =>
    (await auth(request(app.getHttpServer()).post('/items')).send({ code, name: code, type, ...extra }).expect(201)).body.data.id as number;
  const mkStyle = async (styleNo: string) => {
    await auth(request(app.getHttpServer()).post('/master-styles'))
      .send({ styleNo, factory: '베트남', buyer: 'REQ', totalQty: 100, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' })
      .expect(201);
    return dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo } });
  };
  const mkBom = async (style: MasterStyle, lines: [number, number, string, string][], bomNo = 'BOM-1') => {
    const bom = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo, version: 'V1', style }));
    for (const [materialId, consumption, category, colorCode] of lines) {
      await dataSource.getRepository(BomItem).save(
        dataSource.getRepository(BomItem).create({
          bom, material: { id: materialId } as Item, category, colorCode, spec: 'S', consumption, requiredQty: 999999, supplier: null, unitPrice: 0, remarks: '',
        }),
      );
    }
    return bom;
  };
  const mkPo = async (itemId: number, quantity: number, status?: string) => {
    const id = (await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId, quantity, unitPrice: 1 }).expect(201)).body.data.id;
    if (status) await auth(request(app.getHttpServer()).patch(`/purchase-orders/${id}/status`)).send({ status }).expect(200);
  };
  const mkWo = async (itemId: number, targetQuantity: number) =>
    (await auth(request(app.getHttpServer()).post('/work-orders')).send({ itemId, targetQuantity }).expect(201)).body.data.id as number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `bom-req-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'BOM Req E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '소요량공급' }).expect(201)).body.data.id;

    item.fabric = await mkItem('REQ-FABRIC', 'RAW_MATERIAL');
    item.lining = await mkItem('REQ-LINING', 'RAW_MATERIAL');
    item.button = await mkItem('REQ-BUTTON', 'RAW_MATERIAL');

    const style = await mkStyle('REQ-STYLE-1');
    item.finished = await mkItem('REQ-FG-1', 'FINISHED_GOOD', { styleNo: 'REQ-STYLE-1' });
    // 같은 스타일에 Bom이 2건(실제 운영 데이터와 같은 상황): 오래된 것은 원단 1.0만, 최신 것이 진짜 BOM
    await mkBom(style, [[item.fabric, 1, '겉감', 'BK']], 'BOM-REQ-001');
    await mkBom(style, [[item.fabric, 1.25, '겉감', 'BK'], [item.lining, 0.8, '안감', 'BK'], [item.button, 6, '부자재', 'BK']], 'BOM-REQ-001');

    // 발주: 원단 500(PENDING) + 250(RECEIVED) + 9999(CANCELLED → 제외), 안감 100, 단추 없음
    await mkPo(item.fabric, 500);
    await mkPo(item.fabric, 250, 'RECEIVED');
    await mkPo(item.fabric, 9999, 'CANCELLED');
    await mkPo(item.lining, 100);
    woId = await mkWo(item.finished, 1000);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('최신 BOM(id 최대)으로 필요 총수량 = 소요량 × 작업지시 물량, 발주는 취소 제외 합계, 부족분 계산', async () => {
    const r = await req(woId);
    expect(r.reason).toBeNull();
    expect(r.workOrder).toMatchObject({ id: woId, targetQuantity: 1000, itemName: 'REQ-FG-1' });
    expect(r.styleNo).toBe('REQ-STYLE-1');
    expect(r.bomCount).toBe(2);
    expect(r.bom.bomNo).toBe('BOM-REQ-001');

    const by = Object.fromEntries(r.rows.map((x: any) => [x.itemName, x]));
    expect(Object.keys(by).sort()).toEqual(['REQ-BUTTON', 'REQ-FABRIC', 'REQ-LINING']); // 오래된 BOM(원단만)이 아니라 최신 3종
    expect(by['REQ-FABRIC']).toMatchObject({ consumptionPerUnit: 1.25, requiredQty: 1250, orderedQty: 750, shortageQty: 500, categories: ['겉감'] });
    expect(by['REQ-LINING']).toMatchObject({ consumptionPerUnit: 0.8, requiredQty: 800, orderedQty: 100, shortageQty: 700 });
    expect(by['REQ-BUTTON']).toMatchObject({ consumptionPerUnit: 6, requiredQty: 6000, orderedQty: 0, shortageQty: 6000 });
    expect(r.totals).toEqual({ materialCount: 3, shortageMaterialCount: 3 });
  });

  it('저장된 BomItem.requiredQty(등록 당시 스냅샷 999999)는 쓰지 않는다', async () => {
    const r = await req(woId);
    expect(r.rows.every((x: any) => x.requiredQty !== 999999)).toBe(true);
  });

  it('발주량이 필요량 이상이면 부족분은 0(음수 아님)', async () => {
    await mkPo(item.button, 8000);
    const r = await req(woId);
    const button = r.rows.find((x: any) => x.itemName === 'REQ-BUTTON');
    expect(button).toMatchObject({ requiredQty: 6000, orderedQty: 8000, shortageQty: 0 });
    expect(r.totals.shortageMaterialCount).toBe(2);
  });

  it('작업지시 물량이 바뀌면 필요 총수량도 물량에 비례한다', async () => {
    const wo2 = await mkWo(item.finished, 10);
    const r = await req(wo2);
    expect(r.rows.find((x: any) => x.itemName === 'REQ-FABRIC')).toMatchObject({ requiredQty: 12.5, shortageQty: 0 });
  });

  it('BOM이 없는 스타일은 NO_BOM(에러 아님), 스타일번호 없는 품목은 NO_STYLE_NO', async () => {
    await mkStyle('REQ-STYLE-NOBOM');
    const fgNoBom = await mkItem('REQ-FG-NOBOM', 'FINISHED_GOOD', { styleNo: 'REQ-STYLE-NOBOM' });
    const r1 = await req(await mkWo(fgNoBom, 5));
    expect(r1).toMatchObject({ reason: 'NO_BOM', bom: null, rows: [], styleNo: 'REQ-STYLE-NOBOM' });

    const noStyleItem = await mkItem('REQ-FG-NOSTYLE', 'FINISHED_GOOD');
    const r2 = await req(await mkWo(noStyleItem, 5));
    expect(r2).toMatchObject({ reason: 'NO_STYLE_NO', rows: [], styleNo: null });
  });

  it('없는 작업지시는 404', async () => {
    await auth(request(app.getHttpServer()).get('/work-orders/999999/material-requirements')).expect(404);
  });
});
