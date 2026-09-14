import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { ImportShipmentExcelParser } from './import-shipment-excel-parser.util';

// 실제 파일(TYVN2026-34.xlsx)의 IV FOB/PK 시트 레이아웃을 그대로 재현한다.
// 라벨(Invoice No. 등)은 시트마다 행 위치가 1행씩 어긋나 있는 실제 특성까지
// 재현해 findLabelValue()가 고정 좌표가 아니라 라벨 탐색으로 동작함을 검증한다.
function row(cells: Record<number, string | number>, width = 10): Array<string | number> {
  const r = new Array(width).fill('');
  for (const [idx, val] of Object.entries(cells)) r[Number(idx)] = val;
  return r;
}

interface StyleFixture {
  description: string;
  styleNo: string;
  qty: number;
  unitPrice: number;
  amount: number;
  hsCode: string | number;
  grossWeight: number;
}

const IV_HEADER = row({
  0: 'Description',
  1: 'Style No.',
  2: 'Quantity\r\n(PCS)',
  3: 'Unit',
  4: 'Fob /Price',
  5: 'Amount',
  6: 'HS CODE',
});
const PK_HEADER = row({
  0: 'Description',
  1: 'Style No.',
  2: 'Quantity\r\n(PCS)',
  3: 'Packages',
  4: 'Gross Weight\r\n(Kgs)',
  5: 'Volume\r\n(Cbm)',
});

function buildIvFobRows(styles: StyleFixture[]): Array<Array<string | number>> {
  const preamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 19; i++) preamble.push(row({}));
  preamble[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-34-TEST' });
  preamble[2] = row({ 4: 'Date of Invoice', 5: '11/09/2026' });
  preamble[12] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
  preamble[13] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
  preamble[14] = row({ 0: 'Carrier' });
  preamble[15] = row({ 0: 'BY SEA' });
  preamble[16] = row({ 2: 'Departure date' });
  preamble[17] = row({ 2: '13/09/2026' });

  const dataRows = styles.map((s) =>
    row({ 0: s.description, 1: s.styleNo, 2: s.qty, 3: 'PCS', 4: s.unitPrice, 5: s.amount, 6: s.hsCode }),
  );
  const totalRow = row({ 0: 'TOTAL', 2: styles.reduce((sum, s) => sum + s.qty, 0), 5: styles.reduce((sum, s) => sum + s.amount, 0) });

  return [...preamble, IV_HEADER, ...dataRows, totalRow];
}

function buildPkRows(styles: StyleFixture[]): Array<Array<string | number>> {
  // PK는 실제 파일에서 라벨 행이 IV FOB보다 1행씩 위로 당겨져 있다.
  const preamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 18; i++) preamble.push(row({}));
  preamble[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-34-TEST' });
  preamble[2] = row({ 4: 'Date of Invoice', 5: '11/09/2026' });
  preamble[11] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
  preamble[12] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
  preamble[13] = row({ 0: 'Carrier' });
  preamble[14] = row({ 0: 'BY SEA' });
  preamble[15] = row({ 2: 'Departure date' });
  preamble[16] = row({ 2: '13/09/2026' });

  const dataRows = styles.map((s) =>
    row({ 0: s.description, 1: s.styleNo, 2: s.qty, 3: 'HANGER', 4: s.grossWeight }),
  );
  const totalRow = row({ 0: 'TOTAL', 2: styles.reduce((sum, s) => sum + s.qty, 0), 4: styles.reduce((sum, s) => sum + s.grossWeight, 0) });

  return [...preamble, PK_HEADER, ...dataRows, totalRow];
}

function buildWorkbook(
  ivStyles: StyleFixture[] | null,
  pkStyles: StyleFixture[] | null,
): Buffer {
  const wb = xlsx.utils.book_new();
  if (ivStyles) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(buildIvFobRows(ivStyles)), 'IV FOB');
  }
  if (pkStyles) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(buildPkRows(pkStyles)), 'PK');
  }
  if (!ivStyles && !pkStyles) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['dummy']]), 'Sheet1');
  }
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const STYLE_A: StyleFixture = {
  description: "WOMEN'S PANTS",
  styleNo: 'BF6X21C52',
  qty: 1000,
  unitPrice: 11.02,
  amount: 11020,
  hsCode: 62046300,
  grossWeight: 600,
};

const STYLE_B: StyleFixture = {
  description: "WOMEN'S SKIRT",
  styleNo: 'BF6X27C51',
  qty: 1000,
  unitPrice: 11.18,
  amount: 11180,
  hsCode: 62045100,
  grossWeight: 800,
};

describe('ImportShipmentExcelParser', () => {
  it('정상 케이스: 스타일별 styleNo/description/qty/unit/unitPrice/amount/invoiceHsCode/grossWeight를 정확히 추출한다', () => {
    const buffer = buildWorkbook([STYLE_A, STYLE_B], [STYLE_A, STYLE_B]);

    const { header, lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      styleNo: 'BF6X21C52',
      description: "WOMEN'S PANTS",
      qty: 1000,
      unit: 'PCS',
      unitPrice: 11.02,
      amount: 11020,
      invoiceHsCode: '62046300',
      netWeight: null,
      grossWeight: 600,
      packageCount: null,
    });
    expect(lines[1].invoiceHsCode).toBe('62045100');

    expect(header).toEqual({
      invoiceNo: 'TYVN2026-34-TEST',
      invoiceDate: new Date(Date.UTC(2026, 8, 11)),
      portOfLoading: 'HAIPHONG, VIETNAM',
      finalDestination: 'INCHEON , KOREA',
      carrier: 'BY SEA',
      sailingDate: new Date(Date.UTC(2026, 8, 13)),
    });
  });

  it('IV FOB에는 있지만 PK에는 없는 styleNo는 warnings로 남기고 전체 실패는 아니다', () => {
    const buffer = buildWorkbook([STYLE_A, STYLE_B], [STYLE_A]);

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(lines).toHaveLength(2);
    const missingLine = lines.find((l) => l.styleNo === 'BF6X27C51')!;
    expect(missingLine.grossWeight).toBeNull();
    expect(warnings.some((w) => w.includes('BF6X27C51') && w.includes('PK'))).toBe(true);
  });

  it('PK에는 있지만 IV FOB에는 없는 styleNo는 warnings로 남기고 있는 정보만으로 처리한다', () => {
    const buffer = buildWorkbook([STYLE_A], [STYLE_A, STYLE_B]);

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(lines).toHaveLength(2);
    const pkOnlyLine = lines.find((l) => l.styleNo === 'BF6X27C51')!;
    expect(pkOnlyLine.invoiceHsCode).toBeNull();
    expect(pkOnlyLine.unitPrice).toBeNull();
    expect(pkOnlyLine.amount).toBeNull();
    expect(pkOnlyLine.grossWeight).toBe(800);
    expect(warnings.some((w) => w.includes('BF6X27C51') && w.includes('IV FOB'))).toBe(true);
  });

  it('같은 styleNo의 Description이 IV FOB와 PK에서 다르면 경고를 남기고 IV FOB 값을 사용한다', () => {
    const pkMismatch: StyleFixture = { ...STYLE_A, description: 'DIFFERENT DESCRIPTION' };
    const buffer = buildWorkbook([STYLE_A], [pkMismatch]);

    const { lines, warnings } = ImportShipmentExcelParser.parse(buffer);

    expect(lines[0].description).toBe("WOMEN'S PANTS");
    expect(warnings.some((w) => w.includes('Description'))).toBe(true);
  });

  it('"DD/MM/YYYY" 형식의 날짜 문자열을 정확히 파싱한다', () => {
    const buffer = buildWorkbook([STYLE_A], [STYLE_A]);
    const { header } = ImportShipmentExcelParser.parse(buffer);

    expect(header.invoiceDate?.toISOString().slice(0, 10)).toBe('2026-09-11');
    expect(header.sailingDate?.toISOString().slice(0, 10)).toBe('2026-09-13');
  });

  it('IV FOB 시그니처를 찾지 못하면 400 에러를 던진다', () => {
    const buffer = buildWorkbook(null, [STYLE_A]);
    expect(() => ImportShipmentExcelParser.parse(buffer)).toThrow(BadRequestException);
  });

  it('PK 시그니처를 찾지 못하면 400 에러를 던진다', () => {
    const buffer = buildWorkbook([STYLE_A], null);
    expect(() => ImportShipmentExcelParser.parse(buffer)).toThrow(BadRequestException);
  });

  it('둘 다 없으면 400 에러를 던진다', () => {
    const buffer = buildWorkbook(null, null);
    expect(() => ImportShipmentExcelParser.parse(buffer)).toThrow(BadRequestException);
  });
});
