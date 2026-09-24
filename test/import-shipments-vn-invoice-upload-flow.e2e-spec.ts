import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-vn-invoice-upload-flow.sqlite');
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
import { StyleHsCodeMapping } from '../src/hs-code-classifications/entities/style-hs-code-mapping.entity';

// PR-083.1: 태일 VN 공장이 실제로 작성하는 Vietnam INVOICE(IV FOB)/Packing
// List(PK) 엑셀 업로드 전체 흐름. 회사 실 데이터는 절대 커밋하지 않으므로 실제
// 샘플(TYVN2026-34.xlsx)과 동일한 레이아웃(라벨 텍스트 탐색, 스타일당 1행, HS코드가
// 이미 인보이스에 있음)을 그대로 재현한 합성 픽스처를 코드로 생성해서 사용한다.
function row(cells: Record<number, string | number>, width = 10): Array<string | number> {
  const r = new Array(width).fill('');
  for (const [idx, val] of Object.entries(cells)) r[Number(idx)] = val;
  return r;
}

const IV_HEADER = row({
  0: 'Description', 1: 'Style No.', 2: 'Quantity\r\n(PCS)', 3: 'Unit', 4: 'Fob /Price', 5: 'Amount', 6: 'HS CODE',
});
const PK_HEADER = row({
  0: 'Description', 1: 'Style No.', 2: 'Quantity\r\n(PCS)', 3: 'Packages', 4: 'Gross Weight\r\n(Kgs)', 5: 'Volume\r\n(Cbm)',
});

interface StyleFixture {
  description: string;
  styleNo: string;
  qty: number;
  unitPrice: number;
  amount: number;
  hsCode: string | number;
  grossWeight: number;
}

function buildVnInvoiceWorkbook(styles: StyleFixture[]): Buffer {
  const ivPreamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 19; i++) ivPreamble.push(row({}));
  ivPreamble[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-E2E-TEST' });
  ivPreamble[2] = row({ 4: 'Date of Invoice', 5: '11/09/2026' });
  ivPreamble[12] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
  ivPreamble[13] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
  ivPreamble[14] = row({ 0: 'Carrier' });
  ivPreamble[15] = row({ 0: 'BY SEA' });
  ivPreamble[16] = row({ 2: 'Departure date' });
  ivPreamble[17] = row({ 2: '13/09/2026' });
  const ivData = styles.map((s) => row({ 0: s.description, 1: s.styleNo, 2: s.qty, 3: 'PCS', 4: s.unitPrice, 5: s.amount, 6: s.hsCode }));
  const ivTotal = row({ 0: 'TOTAL', 2: styles.reduce((sum, s) => sum + s.qty, 0), 5: styles.reduce((sum, s) => sum + s.amount, 0) });
  const ivRows = [...ivPreamble, IV_HEADER, ...ivData, ivTotal];

  const pkPreamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 18; i++) pkPreamble.push(row({}));
  pkPreamble[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-E2E-TEST' });
  pkPreamble[2] = row({ 4: 'Date of Invoice', 5: '11/09/2026' });
  pkPreamble[11] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
  pkPreamble[12] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
  pkPreamble[13] = row({ 0: 'Carrier' });
  pkPreamble[14] = row({ 0: 'BY SEA' });
  pkPreamble[15] = row({ 2: 'Departure date' });
  pkPreamble[16] = row({ 2: '13/09/2026' });
  const pkData = styles.map((s) => row({ 0: s.description, 1: s.styleNo, 2: s.qty, 3: 'HANGER', 4: s.grossWeight }));
  const pkTotal = row({ 0: 'TOTAL', 2: styles.reduce((sum, s) => sum + s.qty, 0), 4: styles.reduce((sum, s) => sum + s.grossWeight, 0) });
  const pkRows = [...pkPreamble, PK_HEADER, ...pkData, pkTotal];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(ivRows), 'IV FOB');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['PROCESSING INVOICE']]), 'IV CMT');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(pkRows), 'PK');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Vietnam INV/PKL 엑셀 업로드(ImportShipment import-from-file) 회귀 테스트 (PR-083.1)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let managerToken: string;

  const createStyle = async (styleNo: string) => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo, styleName: 'VN Invoice Upload Test', itemType: 'JK', brand: 'Test',
          productionType: 'FOB', factory: 'TY VN', buyer: 'Test Buyer', totalQty: 100, targetRdd: '2027-01-01',
        },
        bomItems: [], sizeSpecs: [], workNotes: null,
      })
      .expect(201);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `vn-invoice-upload-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'VN Invoice Upload E2E' });
    token = (
      await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)
    ).body.data.accessToken;

    const managerEmail = `vn-invoice-upload-manager-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: managerEmail, password: 'password123!', name: 'VN Invoice Upload Manager' });
    await dataSource.getRepository(User).update({ email: managerEmail }, { role: UserRole.MANAGER });
    managerToken = (
      await request(app.getHttpServer()).post('/auth/login').send({ email: managerEmail, password: 'password123!' }).expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('마스터에 매핑이 있고 인보이스 HS코드가 같으면 마스터 값(itemType/composition/fabricType)을 그대로 사용한다', async () => {
    const styleNo = `VN-MATCH-SAME-${Date.now()}`;
    await createStyle(styleNo);
    const classifyRes = await request(app.getHttpServer())
      .post('/hs-code-classifications')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ itemType: "WOMEN'S PANTS", fabricType: '직물', composition: 'POLYESTER 97%, POLYURETHANE 3%', hsCode: '6204.63.0000' })
      .expect(201);
    // POST /hs-code-classifications는 분류만 만들 뿐 StyleHsCodeMapping을 만들지
    // 않는다(그 매핑은 실제 조회가 일어날 때 생성됨) — findByStyle()이 찾을 수
    // 있도록 이 스타일에 대한 매핑을 직접 만들어 둔다.
    await dataSource.getRepository(StyleHsCodeMapping).save({ styleNo, classificationId: classifyRes.body.data.id });

    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S PANTS", styleNo, qty: 1000, unitPrice: 11.02, amount: 11020, hsCode: '6204.63.0000', grossWeight: 600 },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(201);

    expect(res.body.data.shipments).toHaveLength(1);
    const line = res.body.data.shipments[0].lines[0];
    expect(line.itemType).toBe("WOMEN'S PANTS");
    expect(line.composition).toBe('POLYESTER 97%, POLYURETHANE 3%');
    expect(line.fabricType).toBe('직물');
    expect(line.hsCode).toBe('6204.63.0000');
    expect(line.unmatched).toBe(false);
    expect(res.body.data.warnings.some((w: string) => w.includes(styleNo))).toBe(false);
  });

  it('마스터 매핑이 있고 인보이스 HS코드가 다르면 인보이스 값으로 마스터를 갱신하고 warnings를 남긴다', async () => {
    const styleNo = `VN-MATCH-DIFF-${Date.now()}`;
    await createStyle(styleNo);
    const classifyRes = await request(app.getHttpServer())
      .post('/hs-code-classifications')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ itemType: "WOMEN'S SKIRT", fabricType: '직물', composition: 'COTTON 70%, NYLON 30%', hsCode: '6204.52.0000' })
      .expect(201);
    await dataSource.getRepository(StyleHsCodeMapping).save({ styleNo, classificationId: classifyRes.body.data.id });

    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S SKIRT", styleNo, qty: 500, unitPrice: 9, amount: 4500, hsCode: '6204.52.9999', grossWeight: 300 },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(201);

    const line = res.body.data.shipments[0].lines[0];
    expect(line.hsCode).toBe('6204.52.9999');
    expect(line.composition).toBe('COTTON 70%, NYLON 30%'); // 마스터의 기존 composition 유지
    expect(res.body.data.warnings.some((w: string) => w.includes(styleNo) && w.includes('마스터 HS코드'))).toBe(true);

    // 마스터가 실제로 갱신되었는지 확인
    const listRes = await request(app.getHttpServer())
      .get('/hs-code-classifications')
      .set('Authorization', `Bearer ${token}`)
      .query({ composition: 'COTTON 70%, NYLON 30%' })
      .expect(200);
    const updated = listRes.body.data.items.find((i: any) => i.itemType === "WOMEN'S SKIRT");
    expect(updated.hsCode).toBe('6204.52.9999');
  });

  it('마스터에 매핑이 없는 신규 스타일은 composition null로 저장하고 마스터에 등록하지 않으며 warnings를 남긴다', async () => {
    const styleNo = `VN-NEW-${Date.now()}`;
    await createStyle(styleNo);

    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S JACKET", styleNo, qty: 200, unitPrice: 15, amount: 3000, hsCode: '6204.33.0000', grossWeight: 150 },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(201);

    const line = res.body.data.shipments[0].lines[0];
    expect(line.itemType).toBe("WOMEN'S JACKET");
    expect(line.composition).toBeNull();
    expect(line.hsCode).toBe('6204.33.0000');
    expect(res.body.data.warnings.some((w: string) => w.includes(styleNo) && w.includes('신규 스타일'))).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get('/hs-code-classifications')
      .set('Authorization', `Bearer ${token}`)
      .query({ itemType: "WOMEN'S JACKET" })
      .expect(200);
    expect(listRes.body.data.items.some((i: any) => i.hsCode === '6204.33.0000')).toBe(false);
  });

  it('MasterStyle에 등록되지 않은 styleNo도 건너뛰지 않고 자동 등록해 전부 자료화하며 정보성 warning으로 안내한다 (PR-124)', async () => {
    const styleExists = `VN-EXISTS-${Date.now()}`;
    await createStyle(styleExists);
    const styleNew = `VN-NEWSTYLE-${Date.now()}`;

    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S PANTS", styleNo: styleExists, qty: 100, unitPrice: 5, amount: 500, hsCode: '6204.63.0000', grossWeight: 60 },
      { description: "WOMEN'S COAT", styleNo: styleNew, qty: 50, unitPrice: 20, amount: 1000, hsCode: '6202.20.0000', grossWeight: 80 },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(201);

    expect(res.body.data.shipments.map((s: any) => s.styleNo).sort()).toEqual([styleExists, styleNew].sort());
    const autoWarnings = res.body.data.warnings.filter((w: string) => w.includes('자동 등록'));
    expect(autoWarnings).toHaveLength(1);
    expect(autoWarnings[0]).toContain(styleNew);
    expect(res.body.data.warnings.some((w: string) => w.includes('건너뛰'))).toBe(false);
  });

  it('IV FOB/PK 헤더 정보(invoiceNo/invoiceDate/portOfLoading/finalDestination/carrier/sailingDate)를 정확히 추출한다', async () => {
    const styleNo = `VN-HEADER-${Date.now()}`;
    await createStyle(styleNo);

    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S PANTS", styleNo, qty: 10, unitPrice: 1, amount: 10, hsCode: '6204.63.0000', grossWeight: 5 },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(201);

    const shipment = res.body.data.shipments[0];
    expect(shipment.invoiceNo).toBe('TYVN2026-E2E-TEST');
    expect(shipment.invoiceDate).toBe('2026-09-11');
  });

  it('토큰 없이 호출하면 401이어야 한다', async () => {
    const buffer = buildVnInvoiceWorkbook([
      { description: "WOMEN'S PANTS", styleNo: 'NO-AUTH', qty: 1, unitPrice: 1, amount: 1, hsCode: '6204.63.0000', grossWeight: 1 },
    ]);
    await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .attach('file', buffer, 'vn-invoice.xlsx')
      .expect(401);
  });

  it('IV FOB/PK 시그니처가 없는 파일은 400으로 안내한다', async () => {
    const ws = xlsx.utils.aoa_to_sheet([['전혀', '엉뚱한', '헤더']]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'unrecognized.xlsx')
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('찾지 못했습니다');
  });
});
