import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-packing-receipts-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const SAMPLE_XLSX_PATH = path.resolve(
  __dirname,
  '../docs/TY-260718K 수출 인천-하이퐁 FCL(INVOICE, PACKING LIST)-TY (2).xlsx',
);
// 인식 불가 양식 검증용 — 자재명세(BOM) 엑셀은 포장내역 헤더 시그니처가 전혀 없다.
const UNRECOGNIZED_XLSX_PATH = path.resolve(__dirname, '../docs/26-SS 미센스 Material List Update 12. 08.xlsx');

describe('포장내역(PackingReceipt) 등록 회귀 테스트 (PR-074)', () => {
  let app: INestApplication;
  let jwtToken: string;
  let purchaseOrderId: number;

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

    const email = `packing-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Packing E2E' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123!' })
      .expect(201);
    jwtToken = loginRes.body.data.accessToken;

    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: '포장내역 테스트 공급사' })
      .expect(201);

    const itemRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ code: `MAT-PACKING-${Date.now()}`, name: '포장내역 테스트 원자재', type: 'RAW_MATERIAL' })
      .expect(201);

    const poRes = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        supplierId: supplierRes.body.data.id,
        itemId: itemRes.body.data.id,
        quantity: 1000,
        unitPrice: 1.5,
      })
      .expect(201);
    purchaseOrderId = poRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('직접입력', () => {
    it('FABRIC(원단) 직접입력 시 rolls가 저장되고 합계(개수/총중량)가 정확해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          materialCategory: 'FABRIC',
          receivedDate: '2026-09-15',
          remark: '직접입력 테스트',
          rolls: [
            { rollNo: '1', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 83, netWeight: 82, thickness: 22.7 },
            { rollNo: '2', color: '4', widthCm: 133, widthInch: 52.36, grossWeight: 85, netWeight: 84, thickness: 23.2 },
            { rollNo: '3', color: 'D', widthCm: 130, widthInch: 51.2, grossWeight: 90, netWeight: 89, thickness: 24.0 },
          ],
        })
        .expect(201);

      expect(res.body.data.materialCategory).toBe('FABRIC');
      expect(res.body.data.rolls).toHaveLength(3);
      expect(res.body.data.totals.rollCount).toBe(3);
      expect(res.body.data.totals.totalGrossWeight).toBeCloseTo(83 + 85 + 90);
      expect(res.body.data.totals.totalNetWeight).toBeCloseTo(82 + 84 + 89);
    });

    it('TRIM(부자재) 직접입력 시 cartons가 저장되고 합계(카톤수/수량)가 정확해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          materialCategory: 'TRIM',
          rolls: undefined,
          cartons: [
            { cartonNo: 'CT-001', color: '4', qty: 250, itemName: '메인라벨' },
            { cartonNo: 'CT-001', color: '5', qty: 100, itemName: '케어라벨' },
            { cartonNo: 'CT-002', color: '0', qty: 300, itemName: '메인라벨', weightKg: 3.2 },
          ],
        })
        .expect(201);

      expect(res.body.data.materialCategory).toBe('TRIM');
      expect(res.body.data.cartons).toHaveLength(3);
      expect(res.body.data.totals.cartonCount).toBe(2); // CT-001, CT-002 (unique)
      expect(res.body.data.totals.lineCount).toBe(3);
      expect(res.body.data.totals.totalQty).toBe(250 + 100 + 300);
      expect(res.body.data.totals.totalWeightKg).toBeCloseTo(3.2);
    });

    it('FABRIC인데 rolls를 안 보내면 400이어야 한다', async () => {
      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ materialCategory: 'FABRIC' })
        .expect(400);
    });

    it('존재하지 않는 발주 ID로 등록하면 404여야 한다', async () => {
      await request(app.getHttpServer())
        .post('/purchase-orders/999999/packing-receipts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ materialCategory: 'FABRIC', rolls: [{ rollNo: '1', grossWeight: 1, netWeight: 1 }] })
        .expect(404);
    });
  });

  describe('엑셀 업로드 — 실제 원본 파일(BEANPOLE_TTL/MATERIAL PACKING LIST 양식)', () => {
    it('FABRIC 업로드 시 BEANPOLE_TTL 시트를 인식해 롤 데이터를 그대로 저장해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/upload`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .field('materialCategory', 'FABRIC')
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);

      expect(res.body.data.materialCategory).toBe('FABRIC');
      // 실제 파일을 직접 파싱해 확인한 값(226개 롤, 총 gross/net weight)과 정확히 일치해야 한다.
      expect(res.body.data.totals.rollCount).toBe(226);
      expect(res.body.data.totals.totalGrossWeight).toBeCloseTo(13490.92, 1);
      expect(res.body.data.totals.totalNetWeight).toBeCloseTo(13342.17, 1);
      // 첫 번째 롤의 세부값도 확인한다.
      const firstRoll = res.body.data.rolls.find((r: any) => r.rollNo === '1');
      expect(firstRoll).toBeDefined();
      expect(Number(firstRoll.grossWeight)).toBe(83);
      expect(Number(firstRoll.widthCm)).toBe(133);
    });

    it('TRIM 업로드 시 MATERIAL PACKING LIST 시트를 인식해 카톤 데이터를 그대로 저장해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/upload`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .field('materialCategory', 'TRIM')
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);

      expect(res.body.data.materialCategory).toBe('TRIM');
      // 실제 파일을 직접 파싱해 확인한 값(53개 라인, 33개 고유 카톤, 총수량 28240)과 일치해야 한다.
      expect(res.body.data.totals.lineCount).toBe(53);
      expect(res.body.data.totals.cartonCount).toBe(33);
      expect(res.body.data.totals.totalQty).toBe(28240);
      const firstCarton = res.body.data.cartons[0];
      expect(firstCarton.cartonNo).toBe('T.I-274');
      expect(firstCarton.itemName).toBe('중국분 메인라벨');
    });

    it('인식할 수 없는 양식을 업로드하면 명확한 400 에러로 직접입력을 안내해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/upload`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .field('materialCategory', 'FABRIC')
        .attach('file', UNRECOGNIZED_XLSX_PATH)
        .expect(400);

      const message = JSON.stringify(res.body.message);
      expect(message).toContain('직접입력');
    });

    it('인식 실패 시 이미 생성했던 PackingReceipt 헤더 행도 함께 정리되어(고아 레코드 없이) 목록에 남지 않아야 한다', async () => {
      const before = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const beforeCount = before.body.data.length;

      await request(app.getHttpServer())
        .post(`/purchase-orders/${purchaseOrderId}/packing-receipts/upload`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .field('materialCategory', 'TRIM')
        .attach('file', UNRECOGNIZED_XLSX_PATH)
        .expect(400);

      const after = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(after.body.data.length).toBe(beforeCount);
    });
  });

  describe('목록 조회', () => {
    it('GET으로 조회하면 지금까지 등록한 포장내역이 최신순으로 모두 나와야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchase-orders/${purchaseOrderId}/packing-receipts`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // 직접입력 2건(FABRIC/TRIM) + 엑셀업로드 2건(FABRIC/TRIM) = 4건.
      expect(res.body.data.length).toBe(4);
      expect(res.body.data.every((r: any) => r.totals)).toBe(true);
    });
  });
});
