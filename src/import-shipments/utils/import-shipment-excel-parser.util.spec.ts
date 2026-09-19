import * as fs from 'fs';
import * as path from 'path';
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

type PreambleMutator = (preamble: Array<Array<string | number>>) => void;

function buildIvFobRows(styles: StyleFixture[], mutate?: PreambleMutator): Array<Array<string | number>> {
  const preamble: Array<Array<string | number>> = [];
  for (let i = 0; i < 19; i++) preamble.push(row({}));
  preamble[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-34-TEST' });
  preamble[2] = row({ 4: 'Date of Invoice', 5: '11/09/2026' });
  preamble[12] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
  preamble[13] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
  preamble[14] = row({ 0: 'Carrier' });
  preamble[15] = row({ 0: 'BY SEA' });
  preamble[16] = row({ 0: 'Vessel', 2: 'Departure date' });
  preamble[17] = row({ 0: 'STARSHIP TAURUS 2613N', 2: '13/09/2026' });
  mutate?.(preamble);

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
  mutateIvPreamble?: PreambleMutator,
): Buffer {
  const wb = xlsx.utils.book_new();
  if (ivStyles) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(buildIvFobRows(ivStyles, mutateIvPreamble)), 'IV FOB');
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
      vessel: 'STARSHIP TAURUS 2613N',
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

  // PR-124: 선적항(POL)/최종 도착항(POD)/출항일(ETD)/선명은 라벨 "바로 아래" 칸에 값이 있다.
  describe('선적 정보(POL/POD/ETD/선명) — 라벨 바로 아래 칸', () => {
    it('실제 파일 TYVN2026-21/22/27의 헤더 값과 정확히 일치한다', () => {
      const DOCS = path.resolve(__dirname, '../../../docs');
      const expected: Record<string, [string, string, string, string, string, string]> = {
        'TYVN2026-21(검토완료).xlsx': ['TYVN2026-21', 'HAIPHONG, VIETNAM', 'INCHEON , KOREA', '2026-07-19', 'STARSHIP TAURUS 2613N', 'BY SEA'],
        'TYVN2026-22 검토완료.xlsx': ['TYVN2026-22', 'HANOI, VIETNAM', 'INCHEON , KOREA', '2026-07-15', 'KJ374', 'BY AIR'],
        'TYVN2026-27(검토완료).xlsx': ['TYVN2026-27', 'HANOI, VIETNAM', 'INCHEON , KOREA', '2026-08-06', 'WE272', 'BY AIR'],
      };
      for (const [file, [invoiceNo, pol, pod, etd, vessel, carrier]] of Object.entries(expected)) {
        const { header } = ImportShipmentExcelParser.parse(fs.readFileSync(path.join(DOCS, file)));
        expect(header.invoiceNo).toBe(invoiceNo);
        expect(header.portOfLoading).toBe(pol);
        expect(header.finalDestination).toBe(pod);
        expect(header.sailingDate?.toISOString().slice(0, 10)).toBe(etd);
        expect(header.vessel).toBe(vessel);
        expect(header.carrier).toBe(carrier);
      }
    });

    it('ETA(도착예정일)는 어떤 경우에도 파싱 결과에 자동으로 들어오지 않는다(이 문서에는 ETA 라벨이 없다)', () => {
      const { header } = ImportShipmentExcelParser.parse(buildWorkbook([STYLE_A], [STYLE_A]));
      expect(header).not.toHaveProperty('eta');
      // 문서에 "ETA"/"Arrival" 라벨과 날짜가 있어도 파서는 읽지 않는다(자동 캡처 대상이 아님)
      const withEta = buildWorkbook([STYLE_A], [STYLE_A], (p) => {
        p[10] = row({ 6: 'ETA' });
        p[11] = row({ 6: '24/09/2026' });
      });
      const parsed = ImportShipmentExcelParser.parse(withEta).header;
      expect(parsed).not.toHaveProperty('eta');
      expect(Object.values(parsed).some((v) => v instanceof Date && v.toISOString().slice(0, 10) === '2026-09-24')).toBe(false);
    });

    it('라벨이 없으면 해당 값은 null이고 나머지 헤더/라인은 정상(에러 아님)', () => {
      const { header, lines } = ImportShipmentExcelParser.parse(
        buildWorkbook([STYLE_A], [STYLE_A], (p) => {
          p[12] = row({ 0: 'Port of Loading' }); // Final Destination 라벨 삭제
          p[13] = row({ 0: 'HAIPHONG, VIETNAM' });
          p[16] = row({}); // Vessel/Departure date 라벨 삭제
          p[17] = row({ 0: 'STARSHIP TAURUS 2613N', 2: '13/09/2026' }); // 값만 남고 라벨이 없다
        }),
      );
      expect(header.portOfLoading).toBe('HAIPHONG, VIETNAM');
      expect(header.finalDestination).toBeNull();
      expect(header.sailingDate).toBeNull();
      expect(header.vessel).toBeNull();
      expect(lines).toHaveLength(1);
    });

    it('라벨 바로 아래 칸이 비어 있으면 null(오른쪽 칸 등 다른 곳을 억지로 읽지 않는다)', () => {
      const { header } = ImportShipmentExcelParser.parse(
        buildWorkbook([STYLE_A], [STYLE_A], (p) => {
          p[12] = row({ 0: 'Port of Loading', 1: 'WRONG-RIGHT-CELL', 2: 'Final Destination' });
          p[13] = row({}); // 아래 칸이 비어 있다
        }),
      );
      expect(header.portOfLoading).toBeNull();
      expect(header.finalDestination).toBeNull();
    });

    it('레이아웃이 달라도(라벨 행/열 위치가 다름) 고정 좌표가 아니라 라벨 텍스트로 찾는다', () => {
      const { header } = ImportShipmentExcelParser.parse(
        buildWorkbook([STYLE_A], [STYLE_A], (p) => {
          for (const r of [12, 13, 14, 15, 16, 17]) p[r] = row({}); // 기존 위치 비우기
          p[5] = row({ 7: 'PORT OF LOADING', 8: 'Final  Destination' }); // 대소문자/공백이 달라도 정규화 일치
          p[6] = row({ 7: 'BUSAN, KOREA', 8: 'HAIPHONG , VIETNAM' });
          p[8] = row({ 3: 'Vessel', 8: 'DEPARTURE DATE' });
          p[9] = row({ 3: 'KJ999', 8: '01/10/2026' });
        }),
      );
      expect(header.portOfLoading).toBe('BUSAN, KOREA');
      expect(header.finalDestination).toBe('HAIPHONG , VIETNAM');
      expect(header.vessel).toBe('KJ999');
      expect(header.sailingDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
    });

    it('출항일이 엑셀 날짜 시리얼 숫자여도 읽는다', () => {
      const serial = Math.round(Date.UTC(2026, 9, 5) / 86400000 + 25569); // 2026-10-05
      const { header } = ImportShipmentExcelParser.parse(
        buildWorkbook([STYLE_A], [STYLE_A], (p) => {
          p[17] = row({ 0: 'STARSHIP TAURUS 2613N', 2: serial });
        }),
      );
      expect(header.sailingDate?.toISOString().slice(0, 10)).toBe('2026-10-05');
    });
  });
});
