import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-multi-style-bulk-order-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as xlsx from 'xlsx';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MasterStyle } from '../src/styles/entities/master-style.entity';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';
import { Item } from '../src/items/entities/item.entity';
import { PurchaseOrder } from '../src/purchase-orders/entities/purchase-order.entity';

// PR-194: 여러 스타일 묶음 일괄발주 — 1단계(다스타일 소요량 조회) → 2단계(스타일 연결
// 발주 N건 생성, 기존 bulk 재사용) → 3단계(업체별 합본 발주서 1장). 발주 1건=품목1×스타일1
// 구조는 그대로 두고(스타일별 부족분·입고 추적 유지), "업체에 보내는 서류"만 합친다.
describe('다품번 일괄발주 (PR-194)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let supplierId: number;
  let fabricItemId: number;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));

  const mkStyle = async (styleNo: string, totalQty: number, targetRdd: string = '2026-12-01') => {
    await post('/master-styles').send({ styleNo, factory: '베트남', buyer: 'B', totalQty, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd }).expect(201);
    return dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo } });
  };

  const mkBomWithFabric = async (style: MasterStyle, consumption: number) => {
    const bom = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo: `B-${style.styleNo}`, version: 'V1', isActive: true, style }));
    await dataSource.getRepository(BomItem).save(
      dataSource.getRepository(BomItem).create({ bom, material: { id: fabricItemId } as Item, category: '겉감', colorCode: 'BK', spec: 'S', consumption, requiredQty: 0, supplier: null, unitPrice: 0, remarks: '' }),
    );
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `multi-style-bulk-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Multi Style Bulk' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    supplierId = (await post('/suppliers').send({ name: 'MSB공급' }).expect(201)).body.data.id;
    fabricItemId = (await post('/items').send({ code: `MSB-FABRIC-${Date.now()}`, name: 'MSB-원단', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('A-1. GET /work-orders/multi-style-requirements', () => {
    it('스타일 2개를 한 번에 조회하면 스타일마다 소요량이 계산된다', async () => {
      const styleA = await mkStyle('MSB-STYLE-A', 100, '2026-12-01');
      const styleB = await mkStyle('MSB-STYLE-B', 50, '2026-12-10');
      await mkBomWithFabric(styleA, 2);
      await mkBomWithFabric(styleB, 3);

      const res = await get('/work-orders/multi-style-requirements').query({ styleNos: 'MSB-STYLE-A,MSB-STYLE-B' }).expect(200);
      const [a, b] = res.body.data;
      expect(a).toMatchObject({ styleNo: 'MSB-STYLE-A', totalQty: 100, targetRdd: '2026-12-01' });
      expect(a.rows[0]).toMatchObject({ itemName: 'MSB-원단', requiredQty: 200 });
      expect(b).toMatchObject({ styleNo: 'MSB-STYLE-B', totalQty: 50, targetRdd: '2026-12-10' });
      expect(b.rows[0]).toMatchObject({ itemName: 'MSB-원단', requiredQty: 150 });
    });

    it('한 스타일에 BOM이 없어도 그 스타일만 error가 달리고 나머지는 정상 반환된다(전체 실패 금지)', async () => {
      await mkStyle('MSB-STYLE-NOBOM', 10);
      const res = await get('/work-orders/multi-style-requirements').query({ styleNos: 'MSB-STYLE-A,MSB-STYLE-NOBOM' }).expect(200);
      const [a, nobom] = res.body.data;
      expect(a.error).toBeUndefined();
      expect(nobom).toMatchObject({ styleNo: 'MSB-STYLE-NOBOM', rows: [] });
      expect(nobom.error).toBeTruthy();
    });

    it('존재하지 않는 스타일도 그 스타일만 error가 달린다', async () => {
      const res = await get('/work-orders/multi-style-requirements').query({ styleNos: 'MSB-STYLE-A,MSB-NO-SUCH-STYLE' }).expect(200);
      const notFound = res.body.data.find((r: any) => r.styleNo === 'MSB-NO-SUCH-STYLE');
      expect(notFound.error).toBeTruthy();
      expect(notFound.rows).toEqual([]);
    });

    it('styleNos가 없으면 400', async () => {
      await get('/work-orders/multi-style-requirements').expect(400);
    });

    it('31개를 넘기면 400(최대 30개)', async () => {
      const many = Array.from({ length: 31 }, (_, i) => `MSB-MANY-${i}`).join(',');
      await get('/work-orders/multi-style-requirements').query({ styleNos: many }).expect(400);
    });
  });

  describe('A-2/A-3. 스타일 연결 bulk 생성 → 업체별 합본 발주서', () => {
    let poIdA: number;
    let poIdB: number;

    it('스타일 2개(같은 품목) → bulk 생성 → 스타일 연결 발주 2건이 만들어진다', async () => {
      const res = await post('/purchase-orders/bulk').send({
        orders: [
          { supplierId, itemId: fabricItemId, quantity: 200, unitPrice: 2, styleNo: 'MSB-STYLE-A' },
          { supplierId, itemId: fabricItemId, quantity: 150, unitPrice: 2, styleNo: 'MSB-STYLE-B' },
        ],
      }).expect(201);
      expect(res.body.data).toHaveLength(2);
      poIdA = res.body.data[0].id;
      poIdB = res.body.data[1].id;
    });

    it('합본 발주서 1개에 스타일별 행 2개와 품목 소계·업체 전체 합계가 들어 있다', async () => {
      const res = await post('/purchase-orders/documents/combined').send({ poIds: [poIdA, poIdB] }).expect(201);
      expect(res.body.data).toHaveLength(1); // 공급업체가 하나뿐이므로 파일 1개
      const file = res.body.data[0];
      expect(file.supplierName).toBe('MSB공급');
      expect(file.filename).toContain('MSB공급');

      const wb = xlsx.read(Buffer.from(file.base64, 'base64'), { type: 'buffer' });
      const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['합본발주서'], { header: 1, defval: '' });
      const styleARow = rows.find((r) => r[3] === 'MSB-STYLE-A');
      const styleBRow = rows.find((r) => r[3] === 'MSB-STYLE-B');
      expect(styleARow?.[4]).toBe(200);
      expect(styleARow?.[7]).toBe('2026-12-01'); // 요구납기 = 스타일 targetRdd
      expect(styleBRow?.[4]).toBe(150);
      const subtotal = rows.find((r) => String(r[1]).includes('소계'));
      expect(subtotal?.[4]).toBe(350); // 200 + 150
      const grandTotal = rows.find((r) => r[1] === '업체 전체 합계');
      expect(grandTotal?.[4]).toBe(350);
    });

    it('존재하지 않는 발주 id가 섞이면 404', async () => {
      await post('/purchase-orders/documents/combined').send({ poIds: [poIdA, 9_999_999] }).expect(404);
    });

    it('공급업체가 지정되지 않은 발주가 섞이면 400(어느 발주인지 목록에 나온다)', async () => {
      await dataSource.getRepository(PurchaseOrder).update(poIdB, { supplierId: null as any });
      const res = await post('/purchase-orders/documents/combined').send({ poIds: [poIdA, poIdB] }).expect(400);
      expect(JSON.stringify(res.body)).toContain(`#${poIdB}`);
      // 원복(다른 테스트에 영향 없도록)
      await dataSource.getRepository(PurchaseOrder).update(poIdB, { supplierId });
    });

    it('poIds가 비어 있으면 400', async () => {
      await post('/purchase-orders/documents/combined').send({ poIds: [] }).expect(400);
    });
  });

  describe('PR-196 회귀: 같은 자재를 쓰는 스타일 중 하나만 발주해도 다른 스타일 부족분은 그대로다', () => {
    it('같은 자재를 쓰는 두 스타일 중 하나만 이 화면으로 발주하면, 점검표에서 그 스타일만 발주 처리로 보이고 나머지는 미발주로 남는다', async () => {
      const styleD = await mkStyle('MSB-STYLE-D', 10, '2026-10-01');
      const styleE = await mkStyle('MSB-STYLE-E', 10, '2026-10-01');
      await mkBomWithFabric(styleD, 1);
      await mkBomWithFabric(styleE, 1);

      // D만 이 화면의 발주 플로우(styleNo 명시된 /purchase-orders/bulk)로 발주한다.
      await post('/purchase-orders/bulk').send({
        orders: [{ supplierId, itemId: fabricItemId, quantity: 10, unitPrice: 2, styleNo: 'MSB-STYLE-D' }],
      }).expect(201);

      const report = await get('/order-process-stages/procurement-status').expect(200);
      const rowD = report.body.data.find((r: any) => r.styleNo === 'MSB-STYLE-D');
      const rowE = report.body.data.find((r: any) => r.styleNo === 'MSB-STYLE-E');
      expect(rowD.poCreated).toBe(true);
      expect(rowE.poCreated).toBe(false);
    });
  });

  describe('업체가 2곳이면 합본 발주서도 2개', () => {
    it('서로 다른 업체로 발주하면 업체별로 파일이 따로 나온다', async () => {
      const supplier2 = (await post('/suppliers').send({ name: 'MSB공급2' }).expect(201)).body.data.id;
      const styleC = await mkStyle('MSB-STYLE-C', 20, '2026-11-01');
      await mkBomWithFabric(styleC, 1);

      const bulkRes = await post('/purchase-orders/bulk').send({
        orders: [
          { supplierId, itemId: fabricItemId, quantity: 20, unitPrice: 2, styleNo: 'MSB-STYLE-C' },
          { supplierId: supplier2, itemId: fabricItemId, quantity: 30, unitPrice: 3, styleNo: 'MSB-STYLE-C' },
        ],
      }).expect(201);
      const [poC1, poC2] = bulkRes.body.data;

      const res = await post('/purchase-orders/documents/combined').send({ poIds: [poC1.id, poC2.id] }).expect(201);
      expect(res.body.data).toHaveLength(2);
      const supplierNames = res.body.data.map((f: any) => f.supplierName).sort();
      expect(supplierNames).toEqual(['MSB공급', 'MSB공급2']);
    });
  });
});
