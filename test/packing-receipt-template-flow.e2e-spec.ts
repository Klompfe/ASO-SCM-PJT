import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-packing-receipt-template-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-169: 공급업체 포장내역 표준양식 — 다운로드(발주 컨텍스트 자동 채움) → 공급업체가
// 채워서 재업로드 → 미리보기(저장 안 함) → 확인 후 기존 직접입력 엔드포인트(POST /)로
// 커밋. 발주번호/스타일번호 불일치는 안전모드로 막혀야 한다.
describe('포장내역 표준양식 다운로드/업로드 회귀 테스트 (PR-169)', () => {
  let app: INestApplication;
  let userToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const userEmail = `packing-template-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123!', name: 'Packing Template E2E' });
    userToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 발주+BOM(스타일/브랜드/바이어/생산처/혼용율/HS코드 포함)을 준비한다 —
  // export-shipments-flow.e2e-spec.ts의 setupPurchaseOrderWithBomAndPackingReceipt와
  // 동일한 패턴(POST /mapping/commit이 MasterStyle+StyleOverview+Bom+BomItem을 한 번에 만든다).
  const setupPurchaseOrderWithBom = async (opts: {
    itemName: string;
    englishName: string;
    styleNo: string;
    composition: string;
    hsCode: string;
    category: 'FABRIC' | 'TRIM';
    unitPrice?: number | null;
  }) => {
    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Packing Template E2E Supplier' })
      .expect(201);

    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        code: `MAT-TEMPLATE-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: opts.itemName,
        englishName: opts.englishName,
        type: 'RAW_MATERIAL',
      })
      .expect(201);

    const poRes = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        supplierId: supplierRes.body.data.id,
        itemId: itemRes.body.data.id,
        quantity: 500,
        ...(opts.unitPrice === null ? {} : { unitPrice: opts.unitPrice ?? 12000 }),
      })
      .expect(201);
    const purchaseOrderId = poRes.body.data.id;

    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        styleNo: opts.styleNo,
        overviewData: {
          styleNo: opts.styleNo,
          factory: '베트남',
          totalQty: 500,
          buyer: '크롬컴퍼니',
          brand: '뮤트',
          targetRdd: '2026-12-15',
          shipDate: '',
        },
        bomItems: [
          {
            category: opts.category,
            itemName: opts.itemName,
            spec: '150cm',
            composition: opts.composition,
            hsCode: opts.hsCode,
            consumption: 1,
            requiredQty: 500,
          },
        ],
      })
      .expect(201);

    return purchaseOrderId;
  };

  // 다운로드 받은 base64 xlsx를 파싱해 헤더 다음 빈 행에 실측 데이터를, CBM 요약행에
  // CBM/포장수/포장형태를 채워 넣고 다시 buffer로 돌려준다(공급업체가 손으로 하는 일을
  // 그대로 흉내낸다).
  const fillFabricTemplate = (base64: string, rolls: any[][], summary: [number, number, string]): Buffer => {
    const wb = xlsx.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Roll No.');
    rolls.forEach((roll, i) => {
      rows[headerIdx + 2 + i] = roll;
    });
    const summaryIdx = rows.findIndex((r) => r[0] === 'CBM');
    rows[summaryIdx] = ['CBM', summary[0], '포장수', summary[1], '포장형태', summary[2]];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    return xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });
  };

  const fillTrimTemplate = (base64: string, cartons: any[][], summary: [number, number, string]): Buffer => {
    const wb = xlsx.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Carton No.');
    cartons.forEach((carton, i) => {
      rows[headerIdx + 2 + i] = carton;
    });
    const summaryIdx = rows.findIndex((r) => r[0] === 'CBM');
    rows[summaryIdx] = ['CBM', summary[0], '포장수', summary[1], '포장형태', summary[2]];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    return xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });
  };

  describe('다운로드 — 발주 컨텍스트 자동 채움', () => {
    it('FABRIC 양식을 다운로드하면 스타일/브랜드/바이어/생산처/혼용율/HS코드가 발주 정보 그대로 채워진다', async () => {
      const styleNo = `TEMPLATE-E2E-FABRIC-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Fabric ${Date.now()}`,
        englishName: 'OUTER FABRIC',
        styleNo,
        composition: 'WOOL 98%, POLYURETHANE 2%',
        hsCode: '5111.11',
        category: 'FABRIC',
      });

      const res = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts/template`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.filename).toContain(styleNo);
      const wb = xlsx.read(Buffer.from(res.body.data.base64, 'base64'), { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      expect(rows[0][0]).toBe('ASO-SCM 포장내역 표준양식 v1');
      const asMap = (label: string) => rows.find((r) => r[0] === label)?.[1];
      expect(asMap('PO No.')).toBe(`#${purchaseOrderId}`);
      expect(asMap('스타일번호')).toBe(styleNo);
      expect(asMap('브랜드')).toBe('뮤트');
      expect(asMap('바이어')).toBe('크롬컴퍼니');
      expect(asMap('생산처')).toBe('베트남');
      expect(asMap('혼용률')).toBe('WOOL 98%, POLYURETHANE 2%');
      expect(asMap('HS코드')).toBe('5111.11');
      // PR-169 버그 수정 회귀: createdAt은 TypeORM이 Date 인스턴스로 돌려주므로
      // "Sat Oct 03" 같은 toString() 형식이 아니라 ISO 날짜(YYYY-MM-DD)여야 한다.
      expect(asMap('발주일자')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('materialCategory 쿼리가 없으면 400이어야 한다', async () => {
      const styleNo = `TEMPLATE-E2E-NOCAT-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template NoCat ${Date.now()}`,
        englishName: 'X',
        styleNo,
        composition: 'X',
        hsCode: '0000.00',
        category: 'FABRIC',
      });
      await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts/template`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('BOM에 연결되지 않은 발주는 400으로 안내한다', async () => {
      const supplierRes = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'No BOM Supplier' })
        .expect(201);
      const itemRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: `MAT-NOBOM-${Date.now()}`, name: 'No BOM Material', type: 'RAW_MATERIAL' })
        .expect(201);
      const poRes = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ supplierId: supplierRes.body.data.id, itemId: itemRes.body.data.id, quantity: 100, unitPrice: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/purchase-orders/${poRes.body.data.id}/packing-receipts/template`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });
  });

  describe('업로드 미리보기 → 커밋(2단계, 안전모드)', () => {
    it('FABRIC 양식에 롤 데이터를 채워 올리면 미리보기로 파싱되고(저장 안 됨), 확인 후 커밋하면 실제 PackingReceipt가 생성된다', async () => {
      const styleNo = `TEMPLATE-E2E-COMMIT-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Commit ${Date.now()}`,
        englishName: 'OUTER FABRIC',
        styleNo,
        composition: 'WOOL 98%',
        hsCode: '5111.11',
        category: 'FABRIC',
      });

      const downloadRes = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts/template`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const filled = fillFabricTemplate(
        downloadRes.body.data.base64,
        [
          ['2', 'R-002', 'BLACK', 150, 59.06, 50, 48, 20, 80, ''],
          ['3', 'R-003', 'BLACK', 150, 59.06, 52, 50, 20, 82, ''],
        ],
        [3.2, 2, '원단롤'],
      );

      const beforeList = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(beforeList.body.data).toHaveLength(0);

      const previewRes = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/template/preview`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', filled, 'filled.xlsx')
        .expect(201);

      expect(previewRes.body.data.rolls).toHaveLength(2);
      expect(previewRes.body.data.cbm).toBe(3.2);
      expect(previewRes.body.data.remark).toBe('원단롤');
      expect(previewRes.body.data.warnings).toEqual([]);

      // 미리보기 단계에서는 아직 저장되지 않아야 한다(안전모드 — 확인 전 자동저장 금지).
      const afterPreviewList = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(afterPreviewList.body.data).toHaveLength(0);

      // 확인 후에만 기존 직접입력 엔드포인트로 실제 커밋.
      const commitRes = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          materialCategory: previewRes.body.data.materialCategory,
          cbm: previewRes.body.data.cbm,
          remark: previewRes.body.data.remark,
          rolls: previewRes.body.data.rolls,
        })
        .expect(201);

      expect(commitRes.body.data.rolls).toHaveLength(2);
      expect(commitRes.body.data.cbm).toBe(3.2);

      const afterCommitList = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(afterCommitList.body.data).toHaveLength(1);
    });

    it('TRIM 양식에 카톤 데이터를 채우면 미리보기/커밋 모두 정상 동작한다', async () => {
      const styleNo = `TEMPLATE-E2E-TRIM-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Trim ${Date.now()}`,
        englishName: 'MAIN LABEL',
        styleNo,
        composition: 'POLYESTER 100%',
        hsCode: '5807.10',
        category: 'TRIM',
      });

      const downloadRes = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts/template`)
        .query({ materialCategory: 'TRIM' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const filled = fillTrimTemplate(
        downloadRes.body.data.base64,
        [['2', 'T.I-2', 'BLACK', 'FREE', 'LOT-002', 200, '메인라벨', 15.5, '']],
        [1.1, 1, '카톤'],
      );

      const previewRes = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/template/preview`)
        .query({ materialCategory: 'TRIM' })
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', filled, 'filled.xlsx')
        .expect(201);

      expect(previewRes.body.data.cartons).toEqual([
        { cartonNo: 'T.I-2', color: 'BLACK', size: 'FREE', lotNo: 'LOT-002', qty: 200, itemName: '메인라벨', weightKg: 15.5 },
      ]);

      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          materialCategory: previewRes.body.data.materialCategory,
          cbm: previewRes.body.data.cbm,
          remark: previewRes.body.data.remark,
          cartons: previewRes.body.data.cartons,
        })
        .expect(201);

      const afterCommitList = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(afterCommitList.body.data).toHaveLength(1);
    });

    it('다른 발주의 양식을 올리면 안전모드로 막히고 저장되지 않아야 한다', async () => {
      const styleNoA = `TEMPLATE-E2E-SAFE-A-${Date.now()}`;
      const purchaseOrderIdA = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Safe A ${Date.now()}`,
        englishName: 'FABRIC A',
        styleNo: styleNoA,
        composition: 'WOOL 98%',
        hsCode: '5111.11',
        category: 'FABRIC',
      });
      const styleNoB = `TEMPLATE-E2E-SAFE-B-${Date.now()}`;
      const purchaseOrderIdB = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Safe B ${Date.now()}`,
        englishName: 'FABRIC B',
        styleNo: styleNoB,
        composition: 'COTTON 100%',
        hsCode: '5208.11',
        category: 'FABRIC',
      });

      const downloadResA = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderIdA}/packing-receipts/template`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const filled = fillFabricTemplate(
        downloadResA.body.data.base64,
        [['2', 'R-002', 'BLACK', 150, 59.06, 50, 48, 20, 80, '']],
        [1, 1, '원단롤'],
      );

      // A 발주용 양식을 B 발주에 올린다 — PO No.가 경로의 purchaseOrderIdB와 달라 막혀야 한다.
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderIdB}/packing-receipts/template/preview`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', filled, 'filled.xlsx')
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('PO No');

      const listB = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderIdB}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(listB.body.data).toHaveLength(0);
    });

    it('표준양식이 아닌 임의의 엑셀 파일을 올리면 400으로 거부한다', async () => {
      const styleNo = `TEMPLATE-E2E-BADFILE-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template BadFile ${Date.now()}`,
        englishName: 'X',
        styleNo,
        composition: 'X',
        hsCode: '0000.00',
        category: 'FABRIC',
      });

      const sheet = xlsx.utils.aoa_to_sheet([['아무 파일']]);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, sheet, 'Sheet1');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/template/preview`)
        .query({ materialCategory: 'FABRIC' })
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', buffer, 'bad.xlsx')
        .expect(400);
    });
  });

  describe('회귀 — 기존 직접입력/엑셀업로드 경로는 영향받지 않아야 한다', () => {
    it('기존 직접입력(POST /)은 그대로 동작한다', async () => {
      const styleNo = `TEMPLATE-E2E-REGRESSION-${Date.now()}`;
      const purchaseOrderId = await setupPurchaseOrderWithBom({
        itemName: `E2E Template Regression ${Date.now()}`,
        englishName: 'OUTER FABRIC',
        styleNo,
        composition: 'WOOL 98%',
        hsCode: '5111.11',
        category: 'FABRIC',
      });

      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          materialCategory: 'FABRIC',
          rolls: [{ rollNo: '1', color: '4', widthCm: 133, grossWeight: 83, netWeight: 82, thickness: 22.7 }],
        })
        .expect(201);
      expect(res.body.data.rolls).toHaveLength(1);
    });
  });
});
