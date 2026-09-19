import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-083.1: 태일 VN 공장이 실제로 작성하는 Vietnam INVOICE(IV FOB)/Packing List(PK)
// 엑셀(실 샘플 TYVN2026-34.xlsx로 구조 검증됨)을 그대로 업로드해 ImportShipment
// (+lines)를 자동 생성한다. PR-083에서 처음 만들었던 파서는 실제로는 존재하지
// 않는 다른 파일 구조("같은 시트에 INVOICE+PACKING이 2행 1조로 섞인 구조")를
// 기준으로 만들어진 것이었고, 실제 파일은 완전히 다르다(시트 5개, 스타일당 1행,
// HS CODE가 이미 IV FOB에 적혀 있고 혼용률 컬럼 자체가 없음) — 이번 PR에서
// 파서를 통째로 다시 작성한다.
//
// 실제 파일 시트 5개: IV FOB(기준 인보이스, HS코드 포함) / IV CMT(임가공비 송장,
// 이번 범위 밖) / PK(포장명세서, 중량 보조정보) / DETAIL PACKING(사이즈별 세부내역,
// 이번 범위 밖) / Sheet1(작성자 개인 HS코드 참고표, 이번 발송건과 무관 — 대신
// HsCodeClassificationsService.findByStyle()로 기존 마스터를 조회하는 방식을 쓴다.
// 그 연동 로직은 파서가 아니라 서비스 레이어(import-shipments.service.ts)에 있다).

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

export interface ParsedInvoiceLine {
  styleNo: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  // IV FOB에 이미 적혀 있는 HS코드 원본값(가공/재포맷 없이 그대로) — 마스터와의
  // 비교/갱신 로직은 서비스 레이어에서 수행한다(사용자 확인: "인보이스의 HS코드는
  // 확인과정을 거쳐 작성된 확정값").
  invoiceHsCode: string | null;
  // PK 템플릿에는 Net Weight 컬럼이 없어 이 필드는 이 템플릿에서는 항상 null이다.
  netWeight: null;
  grossWeight: number | null;
  // PK의 Packages 컬럼 값은 숫자가 아니라 "HANGER" 같은 포장방식 텍스트라 억지로
  // 파싱하지 않는다 — 이 필드는 이 템플릿에서는 항상 null이다.
  packageCount: null;
}

export interface ImportedImportShipmentHeader {
  invoiceNo: string | null;
  invoiceDate: Date | null;
  portOfLoading: string | null;
  finalDestination: string | null;
  carrier: string | null;
  sailingDate: Date | null;
  // PR-124: 선명(예: "STARSHIP TAURUS 2613N"). ETA(도착예정일)는 이 문서에 없어 일부러 파싱하지 않는다.
  vessel: string | null;
}

export interface ParsedImportedImportShipment {
  header: ImportedImportShipmentHeader;
  lines: ParsedInvoiceLine[];
  warnings: string[];
}

function findHeaderRow(rows: RawRow[], requiredNormalizedHeaders: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i].map(normalize);
    if (requiredNormalizedHeaders.every((h) => normalized.includes(h))) {
      return i;
    }
  }
  return -1;
}

function colIndex(headerRow: RawRow, target: string): number {
  return headerRow.map(normalize).indexOf(target);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStringOrNull(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  return String(v);
}

function excelSerialToDate(v: unknown): Date | null {
  if (typeof v !== 'number') return null;
  const parsed = (xlsx as any).SSF.parse_date_code(v);
  if (!parsed || !parsed.y) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

// IV FOB/PK의 날짜 값은 Excel 날짜 시리얼이 아니라 "DD/MM/YYYY" 문자열이다(실제
// 파일 확인: "11/09/2026", "13/09/2026"). 혹시 다른 사본이 진짜 시리얼로 넘어오는
// 경우까지 대비해 숫자면 기존 excelSerialToDate()를 그대로 쓴다.
function parseInvoiceDate(v: unknown): Date | null {
  if (typeof v === 'number') return excelSerialToDate(v);
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, day, month, year] = m;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }
  return null;
}

// 라벨 텍스트를 정규화 일치로 찾은 뒤 direction에 따라 원본 셀 값을 그대로
// 반환한다(숫자/문자열 구분이 필요한 날짜 값은 이 원본 그대로를 써야 한다) —
// 시트마다 라벨 행 위치가 달라(IV FOB/PK가 서로 1행씩 어긋남) 고정 좌표를 쓸 수 없다.
function findLabelCellRaw(rows: RawRow[], labelText: string, direction: 'right' | 'below'): unknown {
  const target = normalize(labelText);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      if (normalize(row[j]) === target) {
        if (direction === 'right') return row[j + 1];
        return rows[i + 1]?.[j];
      }
    }
  }
  return null;
}

function findLabelValue(rows: RawRow[], labelText: string, direction: 'right' | 'below'): string | null {
  return toStringOrNull(findLabelCellRaw(rows, labelText, direction));
}

interface SheetData {
  sheetName: string;
  rows: RawRow[];
}

function readAllSheets(buffer: Buffer): SheetData[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
    }) as RawRow[],
  }));
}

// 스타일당 1행, 고정 반복 패턴 없이 연속된 데이터 행을 읽는다(PR-083의 "설명행+
// 데이터행 2줄 1조" 가정은 실제 파일과 달라 폐기함). 종료 조건은 Description
// 컬럼(스타일번호 컬럼이 아님 — A열)이 'TOTAL'인 행이다.
function extractDataRows(
  rows: RawRow[],
  headerIdx: number,
  descColIdx: number,
  styleColIdx: number,
): { row: RawRow; styleNo: string; description: string }[] {
  const result: { row: RawRow; styleNo: string; description: string }[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const descCell = row[descColIdx];
    if (typeof descCell === 'string' && descCell.trim().toUpperCase() === 'TOTAL') {
      break;
    }

    const styleCell = row[styleColIdx];
    const hasStyle = styleCell !== '' && styleCell !== null && styleCell !== undefined;
    if (hasStyle) {
      result.push({ row, styleNo: String(styleCell).trim(), description: String(descCell ?? '').trim() });
    }
  }

  return result;
}

export class ImportShipmentExcelParser {
  static parse(buffer: Buffer): ParsedImportedImportShipment {
    const sheets = readAllSheets(buffer);

    const IV_FOB_SIGNATURE = ['DESCRIPTION', 'STYLENO', 'QUANTITYPCS', 'UNIT', 'FOBPRICE', 'AMOUNT', 'HSCODE'];
    // PR-112: 항공/카톤 건(TYVN2026-22/27)은 PK 헤더가 "Packages\r\n(CTNS)"라 정규화하면
    // PACKAGESCTNS가 되어 기존 'PACKAGES' 정확 일치 조건에 걸려 업로드 자체가 400이었다.
    // Packages 컬럼은 이 파서가 쓰지 않으므로(packageCount는 항상 null) 서명에서 뺀다 —
    // GROSSWEIGHTKGS가 IV FOB와 PK를 구분해 준다.
    const PK_SIGNATURE = ['DESCRIPTION', 'STYLENO', 'QUANTITYPCS', 'GROSSWEIGHTKGS'];

    const ivFobSheet = sheets.find((s) => findHeaderRow(s.rows, IV_FOB_SIGNATURE) !== -1);
    const pkSheet = sheets.find((s) => findHeaderRow(s.rows, PK_SIGNATURE) !== -1);

    if (!ivFobSheet || !pkSheet) {
      const missing = [!ivFobSheet && 'IV FOB(인보이스)', !pkSheet && 'PK(포장명세서)'].filter(Boolean).join(', ');
      throw new BadRequestException(
        `${missing} 시트를 찾지 못했습니다. IV FOB는 Description/Style No./Quantity(PCS)/Unit/Fob Price/` +
          'Amount/HS CODE, PK는 Description/Style No./Quantity(PCS)/Packages/Gross Weight(Kgs) 헤더가 ' +
          '있는 시트가 필요합니다. 이 양식이 아니라면 직접입력을 이용해 주세요.',
      );
    }

    const ivHeaderIdx = findHeaderRow(ivFobSheet.rows, IV_FOB_SIGNATURE);
    const pkHeaderIdx = findHeaderRow(pkSheet.rows, PK_SIGNATURE);
    const ivHeader = ivFobSheet.rows[ivHeaderIdx];
    const pkHeader = pkSheet.rows[pkHeaderIdx];

    const ivCols = {
      description: colIndex(ivHeader, 'DESCRIPTION'),
      style: colIndex(ivHeader, 'STYLENO'),
      qty: colIndex(ivHeader, 'QUANTITYPCS'),
      unit: colIndex(ivHeader, 'UNIT'),
      unitPrice: colIndex(ivHeader, 'FOBPRICE'),
      amount: colIndex(ivHeader, 'AMOUNT'),
      hsCode: colIndex(ivHeader, 'HSCODE'),
    };
    const pkCols = {
      description: colIndex(pkHeader, 'DESCRIPTION'),
      style: colIndex(pkHeader, 'STYLENO'),
      qty: colIndex(pkHeader, 'QUANTITYPCS'),
      grossWeight: colIndex(pkHeader, 'GROSSWEIGHTKGS'),
    };

    const ivRows = extractDataRows(ivFobSheet.rows, ivHeaderIdx, ivCols.description, ivCols.style);
    const pkRows = extractDataRows(pkSheet.rows, pkHeaderIdx, pkCols.description, pkCols.style);

    // 실사용 파일은 행 순서가 흐트러질 수 있어(사람이 직접 편집) styleNo를 key로
    // 매칭한다 — export 파서처럼 행 순서/개수만 비교하는 방식은 이 파일엔 안전하지 않다.
    const ivByStyle = new Map(ivRows.map((r) => [r.styleNo, r]));
    const pkByStyle = new Map(pkRows.map((r) => [r.styleNo, r]));
    const orderedStyleNos = [
      ...ivRows.map((r) => r.styleNo),
      ...pkRows.map((r) => r.styleNo).filter((s) => !ivByStyle.has(s)),
    ];

    const warnings: string[] = [];
    const lines: ParsedInvoiceLine[] = [];

    for (const styleNo of orderedStyleNos) {
      const ivRow = ivByStyle.get(styleNo);
      const pkRow = pkByStyle.get(styleNo);

      if (!ivRow) {
        warnings.push(`${styleNo}: IV FOB(인보이스)에서 찾지 못해 단가/금액/HS코드를 확인할 수 없습니다 — PK 정보만으로 처리했습니다.`);
      }
      if (!pkRow) {
        warnings.push(`${styleNo}: PK(포장명세서)에서 찾지 못해 중량 정보를 채우지 못했습니다.`);
      }
      if (ivRow && pkRow && ivRow.description !== pkRow.description) {
        warnings.push(`${styleNo}: IV FOB와 PK의 Description이 서로 다릅니다 — IV FOB 값을 사용했습니다.`);
      }

      lines.push({
        styleNo,
        description: ivRow?.description ?? pkRow?.description ?? '',
        qty: toNumberOrNull(ivRow?.row[ivCols.qty]) ?? toNumberOrNull(pkRow?.row[pkCols.qty]) ?? 0,
        unit: (ivRow && toStringOrNull(ivRow.row[ivCols.unit])) ?? '',
        unitPrice: ivRow ? toNumberOrNull(ivRow.row[ivCols.unitPrice]) : null,
        amount: ivRow ? toNumberOrNull(ivRow.row[ivCols.amount]) : null,
        invoiceHsCode: ivRow ? toStringOrNull(ivRow.row[ivCols.hsCode]) : null,
        netWeight: null,
        grossWeight: pkRow ? toNumberOrNull(pkRow.row[pkCols.grossWeight]) : null,
        packageCount: null,
      });
    }

    // 헤더 정보 블록 — 라벨 텍스트 탐색(고정 좌표 아님, IV FOB 기준).
    const rows = ivFobSheet.rows;
    // 날짜 값은 findLabelValue(문자열화)가 아니라 findLabelCellRaw(원본 셀 값 그대로)로
    // 읽는다 — parseInvoiceDate가 숫자 시리얼/문자열 날짜를 구분해서 처리해야 한다.
    const header: ImportedImportShipmentHeader = {
      invoiceNo: findLabelValue(rows, 'Invoice No.', 'right'),
      invoiceDate: parseInvoiceDate(findLabelCellRaw(rows, 'Date of Invoice', 'right')),
      portOfLoading: findLabelValue(rows, 'Port of Loading', 'below'),
      finalDestination: findLabelValue(rows, 'Final Destination', 'below'),
      carrier: findLabelValue(rows, 'Carrier', 'below'),
      sailingDate: parseInvoiceDate(findLabelCellRaw(rows, 'Departure date', 'below')),
      vessel: findLabelValue(rows, 'Vessel', 'below'),
    };

    return { header, lines, warnings };
  }
}
