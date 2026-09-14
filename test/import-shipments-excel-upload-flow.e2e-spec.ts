import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-excel-upload-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-083: Vietnam INVOICE/Packing List 엑셀 업로드 → 스타일별 ImportShipment 자동
// 생성 전체 흐름. 회사 실 데이터는 절대 커밋하지 않으므로 실제 샘플과 동일한
// 레이아웃(같은 시트에 INVOICE 섹션 위/PACKING LIST 섹션 아래, 빈 패딩 행, TOTAL
// 행)을 그대로 재현한 합성 픽스처를 코드로 생성해서 사용한다.
function buildRow(cells: Record<number, string | number>, width = 11): Array<string | number> {
  const row = new Array(width).fill('');
  for (const [idx, val] of Object.entries(cells)) row[Number(idx)] = val;
  return row;
}

const INV_HEADER = buildRow({ 3: 'STYLE NO.', 5: 'QUANTITY', 7: 'UNIT PRICE', 9: '         AMOUNT' });
const PKL_HEADER = buildRow({ 3: 'STYLE NO.', 5: 'QUANTITY', 7: 'N/WEIGHT', 8: 'G/WEIGHT', 9: 'CTNS' });

interface StyleFixture {
  description: string;
  styleNo: string;
  qty: number;
  unitPrice: number;
  amount: number;
  netWeight: number;
  grossWeight: number;
  packageCount: number;
}

function buildVietnamInvoiceWorkbook(styles: StyleFixture[]): Buffer {
  const preamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 21; i++) preamble.push(buildRow({}));
  preamble[2] = buildRow({ 6: 'TYVN-SF-08-2026-E2E', 9: 46280 }); // 2026-09-15
  preamble[17] = buildRow({ 0: 'HANOI, VIETNAM', 4: 'SHANGHAI, CHINA' });
  preamble[19] = buildRow({ 0: 'VJ7238', 4: 46285 }); // 2026-09-20

  const invRows: Array<Array<string | number>> = [INV_HEADER];
  for (const s of styles) {
    invRows.push(buildRow({ 3: s.description }));
    invRows.push(buildRow({ 3: s.styleNo, 5: s.qty, 7: s.unitPrice, 9: s.amount }));
  }
  for (let i = 0; i < 5; i++) invRows.push(buildRow({}));
  invRows.push(buildRow({ 3: 'TOTAL', 5: styles.reduce((s, x) => s + x.qty, 0) }));

  const pklRows: Array<Array<string | number>> = [PKL_HEADER];
  for (const s of styles) {
    pklRows.push(buildRow({ 3: s.description }));
    pklRows.push(buildRow({ 3: s.styleNo, 5: s.qty, 7: s.netWeight, 8: s.grossWeight, 9: s.packageCount }));
  }
  for (let i = 0; i < 5; i++) pklRows.push(buildRow({}));
  pklRows.push(buildRow({ 3: 'TOTAL', 5: styles.reduce((s, x) => s + x.qty, 0) }));

  const allRows = [...preamble, ...invRows, ...pklRows];
  const ws = xlsx.utils.aoa_to_sheet(allRows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'INV,P.List');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('수입통관 엑셀 업로드(ImportShipment import-from-file) 회귀 테스트 (PR-083)', () => {
  let app: INestApplication;
  let token: string;

  const createStyle = async (styleNo: string) => {
    await request(app.getHttpServer())
      .post('/work-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo,
          styleName: 'Excel Upload Flow Test',
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

    const email = `import-excel-upload-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Import Excel Upload E2E' });
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

  it('여러 스타일이 섞인 파일을 업로드하면 styleNo별로 각각 ImportShipment이 생성된다', async () => {
    const styleA = `EXCEL-UP-A-${Date.now()}`;
    const styleB = `EXCEL-UP-B-${Date.now()}`;
    await createStyle(styleA);
    await createStyle(styleB);

    const buffer = buildVietnamInvoiceWorkbook([
      {
        description: "POLYESTER 54% WOOL 44% POLYURETHANE 2% WOMEN'S PANTS",
        styleNo: styleA,
        qty: 145,
        unitPrice: 32.17,
        amount: 4664.65,
        netWeight: 120.5,
        grossWeight: 130.2,
        packageCount: 12,
      },
      {
        description: "COTTON 100% WOMEN'S BLOUSE",
        styleNo: styleB,
        qty: 50,
        unitPrice: 5,
        amount: 250,
        netWeight: 40,
        grossWeight: 45,
        packageCount: 5,
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vietnam-invoice.xlsx')
      .expect(201);

    expect(res.body.data.shipments).toHaveLength(2);
    expect(res.body.data.warnings).toEqual([]);

    const shipmentA = res.body.data.shipments.find((s: any) => s.styleNo === styleA);
    expect(shipmentA.invoiceNo).toBe('TYVN-SF-08-2026-E2E');
    expect(shipmentA.invoiceDate).toBe('2026-09-15');
    expect(shipmentA.lines).toHaveLength(1);
    expect(shipmentA.lines[0]).toMatchObject({
      itemType: "WOMEN'S PANTS",
      composition: 'POLYESTER 54% WOOL 44% POLYURETHANE 2%',
      unit: 'PCS',
      packageCount: 12,
    });
    expect(Number(shipmentA.lines[0].qty)).toBe(145);
    expect(Number(shipmentA.lines[0].unitPrice)).toBe(32.17);
    expect(Number(shipmentA.lines[0].amount)).toBe(4664.65);
    expect(Number(shipmentA.lines[0].netWeight)).toBe(120.5);
    expect(Number(shipmentA.lines[0].grossWeight)).toBe(130.2);

    const shipmentB = res.body.data.shipments.find((s: any) => s.styleNo === styleB);
    expect(shipmentB.lines[0].itemType).toBe("WOMEN'S BLOUSE");
    expect(shipmentB.lines[0].composition).toBe('COTTON 100%');
  });

  it('MasterStyle에 등록되지 않은 styleNo는 건너뛰고 warnings로 안내하며 나머지는 정상 생성된다', async () => {
    const styleExists = `EXCEL-UP-EXISTS-${Date.now()}`;
    await createStyle(styleExists);
    const styleTypo = `EXCEL-UP-TYPO-${Date.now()}`;

    const buffer = buildVietnamInvoiceWorkbook([
      {
        description: "COTTON 100% WOMEN'S SKIRT",
        styleNo: styleExists,
        qty: 20,
        unitPrice: 3,
        amount: 60,
        netWeight: 10,
        grossWeight: 12,
        packageCount: 2,
      },
      {
        description: "WOOL 100% WOMEN'S COAT",
        styleNo: styleTypo,
        qty: 10,
        unitPrice: 8,
        amount: 80,
        netWeight: 15,
        grossWeight: 18,
        packageCount: 1,
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'vietnam-invoice-typo.xlsx')
      .expect(201);

    expect(res.body.data.shipments).toHaveLength(1);
    expect(res.body.data.shipments[0].styleNo).toBe(styleExists);
    expect(res.body.data.warnings.some((w: string) => w.includes(styleTypo))).toBe(true);
  });

  it('토큰 없이 호출하면 401이어야 한다', async () => {
    const buffer = buildVietnamInvoiceWorkbook([
      {
        description: "COTTON 100% WOMEN'S SKIRT",
        styleNo: 'NO-AUTH',
        qty: 1,
        unitPrice: 1,
        amount: 1,
        netWeight: 1,
        grossWeight: 1,
        packageCount: 1,
      },
    ]);

    await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .attach('file', buffer, 'vietnam-invoice.xlsx')
      .expect(401);
  });

  it('파일 없이 호출하면 400이어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('인식할 수 없는 양식은 400으로 안내한다', async () => {
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
