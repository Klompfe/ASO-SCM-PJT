import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-export-shipments-flow.sqlite');
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

describe('수출선적서류(ExportShipment) 자동생성 회귀 테스트 (PR-075)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const userEmail = `export-e2e-user-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123!', name: 'Export E2E User' });
    userToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    const managerEmail = `export-e2e-manager-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: managerEmail, password: 'password123!', name: 'Export E2E Manager' });
    await dataSource.getRepository(User).update({ email: managerEmail }, { role: UserRole.MANAGER });
    managerToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: managerEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 발주 하나를 완전히 준비한다: 원자재 Item(영문명 포함) 생성 → 공급업체 → 발주 →
  // 해당 자재를 쓰는 BOM(스타일+규격+혼용율+HS코드 포함, PR-073) → 포장내역(PR-074).
  const setupPurchaseOrderWithBomAndPackingReceipt = async (opts: {
    itemName: string;
    englishName: string;
    styleNo: string;
    spec: string;
    composition: string;
    hsCode: string;
    category: 'FABRIC' | 'TRIM';
  }) => {
    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: `SUP-EXPORT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: 'Export E2E Supplier' })
      .expect(201);

    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        code: `MAT-EXPORT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: opts.itemName,
        englishName: opts.englishName,
        type: 'RAW_MATERIAL',
      })
      .expect(201);

    const poRes = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 1000, unitPrice: 1.5 })
      .expect(201);
    const purchaseOrderId = poRes.body.data.id;

    // BomItem 등록(spec/composition/hsCode 포함) — mapping/commit이 PR-073에서
    // composition/hsCode를 그대로 저장하도록 확장된 경로다. itemName을 정확히
    // 일치시켜야 새 Item을 만들지 않고 위에서 만든 Item을 그대로 재사용한다.
    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        styleNo: opts.styleNo,
        overviewData: { styleNo: opts.styleNo, factory: 'Vietnam', totalQty: 100, buyer: 'Export E2E Buyer', shipDate: '' },
        bomItems: [
          {
            category: opts.category,
            itemName: opts.itemName,
            spec: opts.spec,
            composition: opts.composition,
            hsCode: opts.hsCode,
            consumption: 1,
            requiredQty: 100,
          },
        ],
      })
      .expect(201);

    // 포장내역 직접입력(PR-074)
    if (opts.category === 'FABRIC') {
      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          materialCategory: 'FABRIC',
          rolls: [
            { rollNo: '1', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 83, netWeight: 82, thickness: 22.7 },
            { rollNo: '2', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 85, netWeight: 84, thickness: 23.2 },
          ],
        })
        .expect(201);
    } else {
      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          materialCategory: 'TRIM',
          cartons: [
            { cartonNo: 'CT-001', color: '4', qty: 250, itemName: opts.itemName },
            { cartonNo: 'CT-002', color: '5', qty: 100, itemName: opts.itemName },
          ],
        })
        .expect(201);
    }

    return purchaseOrderId;
  };

  describe('생성(generate) — description 자동생성 및 집계', () => {
    it('FABRIC 발주로 생성하면 description이 "규격 영문명 혼용율" 형태(실제 원본 파일과 동일한 형식)로 나오고, 롤 합계가 정확해야 한다', async () => {
      const styleNo = `EXPORT-E2E-FABRIC-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Fabric Material ${Date.now()}`,
        englishName: 'FOR THE FACE',
        styleNo,
        spec: '53"',
        composition: 'WOOL 98%, POLYURETHANE 2%',
        hsCode: '6202.20.1000',
        category: 'FABRIC',
      });

      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${userToken}`)
        .send({ sheetNo: 'TY-260704K' })
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.sheetNo).toBe('TY-260704K');
      expect(res.body.data.styleNos).toEqual([styleNo]);
      expect(res.body.data.lines).toHaveLength(1);

      const line = res.body.data.lines[0];
      // 실제 원본 파일의 DESCRIPTION 문구: `53" FOR THE FACE WOOL 98%, POLYURETHANE 2%(HS CODE: 6202.20.1000)`
      // — hsCode는 별도 컬럼으로 분리 저장하므로 description 자체는 괄호 없이 이 형태여야 한다.
      expect(line.description).toBe('53" FOR THE FACE WOOL 98%, POLYURETHANE 2%');
      expect(line.hsCode).toBe('6202.20.1000');
      expect(line.styleNo).toBe(styleNo);
      // qty의 직렬화 타입은 DB 드라이버에 따라 다르다(Postgres pg 드라이버는 numeric을
      // 문자열로, SQLite는 숫자로 반환) — 값 자체(2, 롤 2개)만 확인한다.
      expect(Number(line.qty)).toBe(2);
      expect(line.unit).toBe('ROLL');
      expect(Number(line.netWeight)).toBeCloseTo(82 + 84);
      expect(Number(line.grossWeight)).toBeCloseTo(83 + 85);
      expect(line.unitPrice).toBeNull();
      expect(line.amount).toBeNull();

      return { purchaseOrderId, shipmentId: res.body.data.id, lineId: line.id };
    });

    it('TRIM 발주로 생성하면 카톤 qty 합계가 정확해야 한다', async () => {
      const styleNo = `EXPORT-E2E-TRIM-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Trim Material ${Date.now()}`,
        englishName: 'MAIN LABEL',
        styleNo,
        spec: '',
        composition: 'POLYESTER 100%',
        hsCode: '5807.10',
        category: 'TRIM',
      });

      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      const line = res.body.data.lines[0];
      expect(line.unit).toBe('EA');
      expect(Number(line.qty)).toBe(250 + 100);
      // spec을 빈 문자열로 보내면 mapping-commit.service.ts의 기존 로직(PR-073 이전부터
      // 존재)이 'N/A'로 대체해 저장한다 — description 조합도 그 값을 그대로 반영한다.
      expect(line.description).toBe('N/A MAIN LABEL POLYESTER 100%');
    });

    it('여러 발주(서로 다른 스타일)를 한 번에 생성하면 styleNos에 둘 다 포함되어야 한다(한 선적건에 여러 스타일)', async () => {
      const styleNoA = `EXPORT-E2E-MULTI-A-${Date.now()}`;
      const poA = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Multi A ${Date.now()}`,
        englishName: 'LINING',
        styleNo: styleNoA,
        spec: '44"',
        composition: 'POLYESTER 100%',
        hsCode: '5407.61',
        category: 'FABRIC',
      });
      const styleNoB = `EXPORT-E2E-MULTI-B-${Date.now()}`;
      const poB = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Multi B ${Date.now()}`,
        englishName: 'ZIPPER',
        styleNo: styleNoB,
        spec: '9"',
        composition: 'NYLON 100%',
        hsCode: '9607.11',
        category: 'TRIM',
      });

      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: `${poA},${poB}` })
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      expect(res.body.data.styleNos.sort()).toEqual([styleNoA, styleNoB].sort());
      expect(res.body.data.lines).toHaveLength(2);
    });

    it('BOM에 연결되지 않은 발주로 생성을 시도하면 조용히 넘어가지 않고 400으로 안내해야 한다', async () => {
      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: `SUP-NOBOM-${Date.now()}`, name: 'No BOM Supplier' })
        .expect(201);
      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: `MAT-NOBOM-${Date.now()}`, name: `No BOM Material ${Date.now()}`, type: 'RAW_MATERIAL' })
        .expect(201);
      const poRes = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 100, unitPrice: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(poRes.body.data.id) })
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('BOM');
    });

    it('purchaseOrderIds 쿼리 파라미터가 없으면 400이어야 한다', async () => {
      await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('상태 전이 및 라인 수정', () => {
    let shipmentId: number;
    let lineId: number;

    beforeAll(async () => {
      const styleNo = `EXPORT-E2E-STATUS-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Status Material ${Date.now()}`,
        englishName: 'FOR THE FACE',
        styleNo,
        spec: '53"',
        composition: 'COTTON 100%',
        hsCode: '5208.11',
        category: 'FABRIC',
      });
      const res = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);
      shipmentId = res.body.data.id;
      lineId = res.body.data.lines[0].id;
    });

    it('unitPrice를 입력하면 amount가 unitPrice*qty로 자동 계산되어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/lines/${lineId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ unitPrice: 1.5 })
        .expect(200);
      expect(Number(res.body.data.unitPrice)).toBe(1.5);
      expect(Number(res.body.data.amount)).toBeCloseTo(1.5 * 2); // qty=2(롤 2개)
    });

    it('DRAFT -> REVIEWED는 일반 사용자도 가능해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'REVIEWED' })
        .expect(200);
      expect(res.body.data.status).toBe('REVIEWED');
    });

    it('REVIEWED -> FINALIZED는 일반 사용자가 시도하면 403이어야 한다', async () => {
      await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'FINALIZED' })
        .expect(403);
    });

    it('DRAFT로 역행하려 하면(REVIEWED에서) 400이어야 한다', async () => {
      await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'DRAFT' })
        .expect(400);
    });

    it('REVIEWED -> FINALIZED는 MANAGER가 하면 200이어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'FINALIZED' })
        .expect(200);
      expect(res.body.data.status).toBe('FINALIZED');
    });

    it('FINALIZED 이후에는 라인 unitPrice를 수정할 수 없어야 한다(스냅샷 유지)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/lines/${lineId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ unitPrice: 9.99 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('FINALIZED');

      // 실제로 값이 바뀌지 않았는지 재조회로 확인한다.
      const getRes = await request(app.getHttpServer())
        .get(`/export-shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      const line = getRes.body.data.lines.find((l: any) => l.id === lineId);
      expect(Number(line.unitPrice)).toBe(1.5);
    });

    it('FINALIZED 이후에는 다른 상태로도 전이할 수 없어야 한다', async () => {
      await request(app.getHttpServer())
        .patch(`/export-shipments/${shipmentId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'REVIEWED' })
        .expect(400);
    });
  });

  describe('목록/상세 조회', () => {
    it('GET /export-shipments/:id로 라인 포함 상세를 조회할 수 있어야 한다', async () => {
      const styleNo = `EXPORT-E2E-GET-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBomAndPackingReceipt({
        itemName: `E2E Get Material ${Date.now()}`,
        englishName: 'FOR THE FACE',
        styleNo,
        spec: '53"',
        composition: 'COTTON 100%',
        hsCode: '5208.11',
        category: 'FABRIC',
      });
      const genRes = await request(app.getHttpServer())
        .post('/export-shipments/generate')
        .query({ purchaseOrderIds: String(purchaseOrderId) })
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/export-shipments/${genRes.body.data.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(genRes.body.data.id);
      expect(res.body.data.lines).toHaveLength(1);
    });

    it('존재하지 않는 ID를 조회하면 404여야 한다', async () => {
      await request(app.getHttpServer())
        .get('/export-shipments/999999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });
});
