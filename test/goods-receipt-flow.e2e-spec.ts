import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-goods-receipt-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-107: 완제품입고증 작성 흐름 — 수입통관 건에 색상/사이즈별 상세내역을 등록하고,
// 그중 일부를 골라 입고증을 작성한다(조정 없음/조정+사유/조정인데 사유없음(400)),
// 그리고 같은 shipment를 나눠서 두 번에 걸쳐 작성할 수 있는지까지 확인한다.
describe('완제품입고증(GoodsReceipt) 작성 흐름 (PR-107)', () => {
  let app: INestApplication;
  let token: string;

  const createStyle = async (styleNo: string) => {
    await request(app.getHttpServer())
      .post('/work-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo,
          styleName: 'Goods Receipt Test',
          itemType: 'JK',
          brand: 'Test',
          productionType: 'FOB',
          factory: 'TY VN',
          buyer: 'Test Buyer',
          totalQty: 100,
          targetRdd: '2027-01-01',
        },
        bomItems: [],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);
  };

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

    const email = `goods-receipt-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Goods Receipt E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  let importShipmentId: number;
  const detailIds: number[] = [];

  it('사전 준비: 수입통관 건 생성 후 색상 2개 × 사이즈 2개(4줄) 상세내역을 등록한다', async () => {
    const styleNo = `GR-E2E-${Date.now()}`;
    await createStyle(styleNo);

    const shipmentRes = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({ styleNo, lines: [{ itemType: 'JACKET', qty: 400, unit: 'EA' }] })
      .expect(201);
    importShipmentId = shipmentRes.body.data.id;

    const detailsRes = await request(app.getHttpServer())
      .post(`/import-shipments/${importShipmentId}/packing-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        details: [
          { color: 'BLACK', size: 'M', qty: 100 },
          { color: 'BLACK', size: 'L', qty: 100 },
          { color: 'NAVY', size: 'M', qty: 100 },
          { color: 'NAVY', size: 'L', qty: 100 },
        ],
      })
      .expect(201);
    expect(detailsRes.body.data).toHaveLength(4);
    detailsRes.body.data.forEach((d: any) => detailIds.push(d.id));

    const listRes = await request(app.getHttpServer())
      .get(`/import-shipments/${importShipmentId}/packing-details`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(4);
    expect(listRes.body.data.every((d: any) => d.hasReceipt === false)).toBe(true);
    expect(listRes.body.data.every((d: any) => d.source === 'MANUAL')).toBe(true);
  });

  let firstReceiptId: number;

  it('3줄 선택(1줄은 수량 조정+사유 포함)해 입고증을 작성하면 라인이 정확히 3건 생성된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/goods-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        importShipmentId,
        remark: '1차 부분 입고',
        lines: [
          { packingDetailId: detailIds[0] },
          { packingDetailId: detailIds[1], adjustedQty: 95, adjustmentReason: '샘플 출고 5장 차감' },
          { packingDetailId: detailIds[2] },
        ],
      })
      .expect(201);

    expect(res.body.data.receiptNo).toMatch(/^GR-\d{6}$/);
    expect(res.body.data.lines).toHaveLength(3);
    firstReceiptId = res.body.data.id;

    const adjustedLine = res.body.data.lines.find((l: any) => l.packingDetailId === detailIds[1]);
    expect(Number(adjustedLine.originalQty)).toBe(100);
    expect(Number(adjustedLine.adjustedQty)).toBe(95);
    expect(adjustedLine.adjustmentReason).toBe('샘플 출고 5장 차감');

    const unadjustedLine = res.body.data.lines.find((l: any) => l.packingDetailId === detailIds[0]);
    expect(Number(unadjustedLine.originalQty)).toBe(100);
    expect(Number(unadjustedLine.adjustedQty)).toBe(100);
    expect(unadjustedLine.adjustmentReason ?? null).toBeNull();
  });

  it('조정 수량을 원 수량과 다르게 주고 사유를 빼면 400이다', async () => {
    await request(app.getHttpServer())
      .post('/goods-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({ importShipmentId, lines: [{ packingDetailId: detailIds[3], adjustedQty: 50 }] })
      .expect(400);
  });

  it('입고증 작성 후 상세내역 목록에서 해당 3줄은 hasReceipt:true로 표시된다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/import-shipments/${importShipmentId}/packing-details`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const byId = new Map<number, any>(res.body.data.map((d: any) => [d.id, d]));
    expect(byId.get(detailIds[0]).hasReceipt).toBe(true);
    expect(byId.get(detailIds[1]).hasReceipt).toBe(true);
    expect(byId.get(detailIds[2]).hasReceipt).toBe(true);
    expect(byId.get(detailIds[3]).hasReceipt).toBe(false);
  });

  it('이미 입고증에 쓰인 상세내역은 삭제하면 400이다', async () => {
    await request(app.getHttpServer())
      .delete(`/import-shipments/${importShipmentId}/packing-details/${detailIds[0]}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('나머지 1줄로 별도 입고증을 작성할 수 있다(분할 작성)', async () => {
    const res = await request(app.getHttpServer())
      .post('/goods-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({ importShipmentId, remark: '2차(나머지) 입고', lines: [{ packingDetailId: detailIds[3] }] })
      .expect(201);

    expect(res.body.data.lines).toHaveLength(1);
    expect(res.body.data.id).not.toBe(firstReceiptId);
    expect(res.body.data.receiptNo).not.toBe(undefined);

    const listRes = await request(app.getHttpServer())
      .get('/goods-receipts')
      .query({ importShipmentId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(2);
  });

  it('존재하지 않는 packingDetailId로 작성을 시도하면 404다', async () => {
    await request(app.getHttpServer())
      .post('/goods-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({ importShipmentId, lines: [{ packingDetailId: 999999 }] })
      .expect(404);
  });

  // PR-108: 입고증 발급(인쇄) 화면이 스타일번호/INVOICE 번호를 보여줘야 해서
  // GET /goods-receipts/:id 상세 조회에 importShipment 관계가 포함되는지 확인한다.
  it('상세 조회 시 importShipment(styleNo 포함)가 함께 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/goods-receipts/${firstReceiptId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.importShipment).toBeDefined();
    expect(res.body.data.importShipment.id).toBe(importShipmentId);
    expect(res.body.data.importShipment.styleNo).toMatch(/^GR-E2E-/);
  });
});
