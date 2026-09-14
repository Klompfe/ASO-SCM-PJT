import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { ImportShipmentExcelParser } from './import-shipment-excel-parser.util';

// 엑셀 날짜 시리얼 변환(Excel epoch 1899-12-30 기준) — export-shipment-import-parser
// 테스트와 동일한 계산식.
const toSerial = (y: number, m: number, d: number): number =>
  Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

// 실제 샘플 파일(단일 시트 안에 INVOICE 섹션 위/PACKING LIST 섹션 아래)의 레이아웃을
// 재현한다. rows[i][j] 좌표는 PR-083 스펙에 명시된 절대 위치와 정확히 일치시킨다.
function buildRow(cells: Record<number, string | number>, width = 11): Array<string | number> {
  const row = new Array(width).fill('');
  for (const [idx, val] of Object.entries(cells)) row[Number(idx)] = val;
  return row;
}

interface StyleFixture {
  description: string;
  styleNo: string;
  qty: number;
  unitPrice: number;
  amount: number;
  netWeight: number;
  grossWeight: number;
  packageCount: number;
  blankRowsBeforeData?: number; // 설명행과 데이터행 사이 빈 줄 개수
  pklQtyOverride?: number; // PKL쪽 qty를 의도적으로 다르게 해 불일치 경고를 테스트
}

const INV_HEADER = buildRow({ 3: 'STYLE NO.', 5: 'QUANTITY', 7: 'UNIT PRICE', 9: '         AMOUNT' });
const PKL_HEADER = buildRow({ 3: 'STYLE NO.', 5: 'QUANTITY', 7: 'N/WEIGHT', 8: 'G/WEIGHT', 9: 'CTNS' });

function buildInvoiceSection(styles: StyleFixture[], blankPaddingBeforeTotal: number): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [INV_HEADER];
  for (const s of styles) {
    rows.push(buildRow({ 3: s.description }));
    for (let i = 0; i < (s.blankRowsBeforeData ?? 0); i++) rows.push(buildRow({}));
    rows.push(buildRow({ 3: s.styleNo, 5: s.qty, 7: s.unitPrice, 9: s.amount }));
  }
  for (let i = 0; i < blankPaddingBeforeTotal; i++) rows.push(buildRow({}));
  const totalQty = styles.reduce((sum, s) => sum + s.qty, 0);
  const totalAmount = styles.reduce((sum, s) => sum + s.amount, 0);
  rows.push(buildRow({ 3: 'TOTAL', 5: totalQty, 9: totalAmount }));
  return rows;
}

function buildPackingListSection(
  styles: StyleFixture[],
  blankPaddingBeforeTotal: number,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [PKL_HEADER];
  for (const s of styles) {
    rows.push(buildRow({ 3: s.description }));
    for (let i = 0; i < (s.blankRowsBeforeData ?? 0); i++) rows.push(buildRow({}));
    rows.push(
      buildRow({
        3: s.styleNo,
        5: s.pklQtyOverride ?? s.qty,
        7: s.netWeight,
        8: s.grossWeight,
        9: s.packageCount,
      }),
    );
  }
  for (let i = 0; i < blankPaddingBeforeTotal; i++) rows.push(buildRow({}));
  const totalQty = styles.reduce((sum, s) => sum + (s.pklQtyOverride ?? s.qty), 0);
  rows.push(buildRow({ 3: 'TOTAL', 5: totalQty }));
  return rows;
}

function buildWorkbook(
  styles: StyleFixture[],
  options: {
    blankPaddingBeforeTotal?: number;
    header?: { invoiceNo?: string; invoiceDate?: number; port?: string; dest?: string; carrier?: string; sailingDate?: number };
    skipPacking?: boolean;
    pklStyles?: StyleFixture[];
  } = {},
): Buffer {
  const blankPadding = options.blankPaddingBeforeTotal ?? 3;
  const h = options.header ?? {};

  // 헤더 정보 블록(rows[2],[17],[19])을 채우기 위해 앞쪽에 20행을 미리 깔아둔다.
  const preamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 21; i++) preamble.push(buildRow({}));
  if (h.invoiceNo !== undefined) preamble[2] = buildRow({ 6: h.invoiceNo, 9: h.invoiceDate ?? '' });
  if (h.port !== undefined) preamble[17] = buildRow({ 0: h.port, 4: h.dest ?? '' });
  if (h.carrier !== undefined) preamble[19] = buildRow({ 0: h.carrier, 4: h.sailingDate ?? '' });

  const invoiceRows = buildInvoiceSection(styles, blankPadding);
  const packingRows = options.skipPacking
    ? []
    : buildPackingListSection(options.pklStyles ?? styles, blankPadding);

  const allRows = [...preamble, ...invoiceRows, ...packingRows];

  const ws = xlsx.utils.aoa_to_sheet(allRows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'INV,P.List');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const STYLE_1: StyleFixture = {
  description: "POLYESTER 54% WOOL 44% POLYURETHANE 2% WOMEN'S PANTS",
  styleNo: 'BF6821C544',
  qty: 145,
  unitPrice: 32.17,
  amount: 4664.65,
  netWeight: 120.5,
  grossWeight: 130.2,
  packageCount: 12,
};

const STYLE_2: StyleFixture = {
  description: "COTTON 97%  POLYURETHANE 3% WOMEN'S PANTS", // 중간에 공백 2개(실제 데이터 재현)
  styleNo: 'BF6821C999',
  qty: 50,
  unitPrice: 10,
  amount: 500,
  netWeight: 40,
  grossWeight: 45,
  packageCount: 5,
};

describe('ImportShipmentExcelParser', () => {
  it('정상 케이스: styleNo/itemType/composition/qty/unitPrice/amount/netWeight/grossWeight/packageCount를 정확히 추출하고 unit은 항상 PCS다', () => {
    const buffer = buildWorkbook([STYLE_1, STYLE_2], {
      header: {
        invoiceNo: 'TYVN-SF-08-2026',
        invoiceDate: toSerial(2026, 9, 15),
        port: 'HANOI, VIETNAM',
        dest: 'SHANGHAI, CHINA',
        carrier: 'VJ7238',
        sailingDate: toSerial(2026, 9, 20),
      },
    });

    const { header, lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(2);

    expect(lines[0]).toEqual({
      styleNo: 'BF6821C544',
      itemType: "WOMEN'S PANTS",
      composition: 'POLYESTER 54% WOOL 44% POLYURETHANE 2%',
      qty: 145,
      unit: 'PCS',
      unitPrice: 32.17,
      amount: 4664.65,
      netWeight: 120.5,
      grossWeight: 130.2,
      packageCount: 12,
    });
    expect(lines[1].composition).toBe('COTTON 97%  POLYURETHANE 3%');
    expect(lines[1].itemType).toBe("WOMEN'S PANTS");

    expect(header).toEqual({
      invoiceNo: 'TYVN-SF-08-2026',
      invoiceDate: new Date(Date.UTC(2026, 8, 15)),
      portOfLoading: 'HANOI, VIETNAM',
      finalDestination: 'SHANGHAI, CHINA',
      carrier: 'VJ7238',
      sailingDate: new Date(Date.UTC(2026, 8, 20)),
    });
  });

  it('설명행과 데이터행 사이에 빈 줄이 여러 개 있어도 올바른 설명을 찾는다', () => {
    const withGap: StyleFixture = { ...STYLE_1, blankRowsBeforeData: 3 };
    const buffer = buildWorkbook([withGap]);

    const { lines } = ImportShipmentExcelParser.parse(buffer);

    expect(lines).toHaveLength(1);
    expect(lines[0].itemType).toBe("WOMEN'S PANTS");
    expect(lines[0].composition).toBe('POLYESTER 54% WOOL 44% POLYURETHANE 2%');
    expect(lines[0].styleNo).toBe('BF6821C544');
  });

  it('TOTAL 행 앞에 빈 패딩 행이 여러 개 있어도 TOTAL 행에서 정확히 멈추고 데이터로 포함하지 않는다', () => {
    const buffer = buildWorkbook([STYLE_1, STYLE_2], { blankPaddingBeforeTotal: 34 });

    const { lines } = ImportShipmentExcelParser.parse(buffer);

    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.styleNo === 'TOTAL')).toBe(false);
  });

  it('INVOICE와 Packing List의 데이터 행 수가 다르면 400 에러를 던진다', () => {
    const buffer = buildWorkbook([STYLE_1, STYLE_2], { pklStyles: [STYLE_1] });

    expect(() => ImportShipmentExcelParser.parse(buffer)).toThrow(BadRequestException);
  });

  it('INVOICE와 Packing List의 설명(description)이 다르면 경고를 남기고 INVOICE 값을 사용한다', () => {
    const pklMismatch: StyleFixture = { ...STYLE_1, description: 'DIFFERENT DESCRIPTION TEXT' };
    const buffer = buildWorkbook([STYLE_1], { pklStyles: [pklMismatch] });

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(warnings.some((w) => w.includes('설명'))).toBe(true);
    expect(lines[0].itemType).toBe("WOMEN'S PANTS");
    expect(lines[0].composition).toBe('POLYESTER 54% WOOL 44% POLYURETHANE 2%');
  });

  it('INVOICE와 Packing List의 수량(qty)이 다르면 경고를 남기고 INVOICE 값을 사용한다', () => {
    const withQtyMismatch: StyleFixture = { ...STYLE_1, pklQtyOverride: 999 };
    const buffer = buildWorkbook([withQtyMismatch]);

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(warnings.some((w) => w.includes('수량'))).toBe(true);
    expect(lines[0].qty).toBe(145);
  });

  it("설명에 '%'가 없으면 혼용률을 억지로 나누지 않고 경고를 남긴다", () => {
    const noPercent: StyleFixture = { ...STYLE_1, description: 'NO PERCENT SIGN HERE' };
    const buffer = buildWorkbook([noPercent]);

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(lines[0].composition).toBe('');
    expect(lines[0].itemType).toBe('NO PERCENT SIGN HERE');
    expect(warnings.some((w) => w.includes("'%'"))).toBe(true);
  });

  it('INVOICE/Packing List 시그니처가 없는 파일은 400으로 안내한다', () => {
    const ws = xlsx.utils.aoa_to_sheet([['전혀', '엉뚱한', '헤더']]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(() => ImportShipmentExcelParser.parse(buffer)).toThrow(BadRequestException);
  });
});
