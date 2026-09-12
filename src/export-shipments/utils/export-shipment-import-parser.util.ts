import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-080: 기 작성된 INVOICE/Packing List 엑셀(예: docs/TY-260718K 수출 인천-하이퐁
// FCL(INVOICE, PACKING LIST)-TY (2).xlsx — 실제 저장소 샘플로 검증됨)을 그대로
// 가져온다. 이 두 요약 시트만 대상이고(공급사별 상세시트 11개는 무시), 시트 이름이
// 아니라 헤더 텍스트 시그니처로 판별한다(packing-receipt-excel-parser.util.ts와
// 동일한 방식 — 다른 상세 시트와 헤더가 겹치지 않는지 실제 파일로 확인 완료).

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

// DESCRIPTION에 섞여 있는 "(HS CODE: 6202.20.1000)" / "(HS CODE:6204.63.0000)" 형태를
// 분리한다 — 콜론 뒤 공백 유무가 실제 파일에서도 둘 다 나타나 유연하게 허용한다.
const HS_CODE_REGEX = /\(\s*HS\s*CODE\s*:?\s*([\d.]+)\s*\)/i;

export interface ImportedExportShipmentLine {
  styleNo: string;
  description: string;
  hsCode: string | null;
  qty: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  netWeight: number | null;
  grossWeight: number | null;
  packageCount: number | null;
  packageType: string | null;
}

export interface ImportedExportShipmentHeader {
  sheetNo: string | null;
  invoiceDate: Date | null;
  portOfLoading: string | null;
  finalDestination: string | null;
  carrier: string | null;
  sailingDate: Date | null;
}

export interface ParsedImportedExportShipment {
  header: ImportedExportShipmentHeader;
  lines: ImportedExportShipmentLine[];
  warnings: string[];
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

// Excel 날짜 시리얼(예: 46207)을 실제 날짜로 변환한다. xlsx.SSF.parse_date_code로
// 46207 -> 2026-07-04임을 실제 파일(SHEET NO: TY-260704K와 일치)로 확인했다.
function excelSerialToDate(v: unknown): Date | null {
  if (typeof v !== 'number') return null;
  const parsed = (xlsx as any).SSF.parse_date_code(v);
  if (!parsed || !parsed.y) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

// 데이터 행을 헤더 다음 행부터 읽어, 첫 컬럼이 "TOTAL"인 행에서 멈춘다. STYLE NO는
// 시트마다 빈 값의 표현이 다르다(INVOICE는 빈 문자열, Packing List는 숫자 0) —
// 두 경우 모두 "새 값 없음 -> 직전 값 유지"로 forward-fill한다. 여기서는 필터링
//없이(빈/0 채움 행 포함) 원본 그대로의 행 순서를 유지해 두 시트가 정확히 1:1로
// 대응하도록 한다 — 이후 행 수 비교로 어긋남을 검증한다.
function extractDataRows(
  rows: RawRow[],
  headerIdx: number,
  styleColIdx: number,
): { row: RawRow; styleNo: string }[] {
  const result: { row: RawRow; styleNo: string }[] = [];
  let lastStyle = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) break;

    const rawStyle = row[styleColIdx];
    if (typeof rawStyle === 'string' && rawStyle.trim().toUpperCase() === 'TOTAL') {
      break;
    }

    if (rawStyle !== '' && rawStyle !== null && rawStyle !== undefined) {
      lastStyle = String(rawStyle);
    }
    result.push({ row, styleNo: lastStyle });
  }

  return result;
}

export class ExportShipmentImportParser {
  static parse(buffer: Buffer): ParsedImportedExportShipment {
    const sheets = readAllSheets(buffer);

    const INVOICE_SIGNATURE = ['STYLENO', 'DESCRIPTION', 'UPRICEUSD', 'AMOUNTUSD'];
    const PACKING_LIST_SIGNATURE = ['STYLENO', 'DESCRIPTION', 'NWKG', 'GWKG'];

    const invoiceSheet = sheets.find((s) => findHeaderRow(s.rows, INVOICE_SIGNATURE) !== -1);
    const packingListSheet = sheets.find((s) => findHeaderRow(s.rows, PACKING_LIST_SIGNATURE) !== -1);

    if (!invoiceSheet || !packingListSheet) {
      const missing = [!invoiceSheet && 'INVOICE', !packingListSheet && 'Packing List'].filter(Boolean).join(', ');
      throw new BadRequestException(
        `${missing} 요약 시트를 찾지 못했습니다. INVOICE는 STYLE NO/DESCRIPTION/U-PRICE(USD)/AMOUNT(USD), ` +
          "Packing List는 STYLE NO/DESCRIPTION/N.W(KG)/G.W(KG) 헤더가 있는 행이 필요합니다. " +
          '이 양식이 아니라면 발주 기반 생성이나 직접입력을 이용해 주세요.',
      );
    }

    const invHeaderIdx = findHeaderRow(invoiceSheet.rows, INVOICE_SIGNATURE);
    const pklHeaderIdx = findHeaderRow(packingListSheet.rows, PACKING_LIST_SIGNATURE);
    const invHeader = invoiceSheet.rows[invHeaderIdx];
    const pklHeader = packingListSheet.rows[pklHeaderIdx];

    const invCols = {
      style: colIndex(invHeader, 'STYLENO'),
      description: colIndex(invHeader, 'DESCRIPTION'),
      qty: colIndex(invHeader, 'QTYYDS'),
      unitPrice: colIndex(invHeader, 'UPRICEUSD'),
      amount: colIndex(invHeader, 'AMOUNTUSD'),
    };
    // 단위 컬럼은 QTY 바로 다음 칸이고 헤더 텍스트가 비어 있다(실제 파일 확인).
    const invUnitIdx = invCols.qty + 1;

    const pklCols = {
      style: colIndex(pklHeader, 'STYLENO'),
      netWeight: colIndex(pklHeader, 'NWKG'),
      grossWeight: colIndex(pklHeader, 'GWKG'),
      packageCount: colIndex(pklHeader, 'NOKINDOFPACKAGES'),
    };
    const pklUnitIdx = colIndex(pklHeader, 'QTYYDS') + 1;
    const pklPackageTypeIdx = pklCols.packageCount + 1;

    const invData = extractDataRows(invoiceSheet.rows, invHeaderIdx, invCols.style);
    const pklData = extractDataRows(packingListSheet.rows, pklHeaderIdx, pklCols.style);

    if (invData.length !== pklData.length) {
      throw new BadRequestException(
        `INVOICE(${invData.length}행)와 Packing List(${pklData.length}행)의 데이터 행 수가 서로 달라 ` +
          '안전하게 합칠 수 없습니다. 원본 파일의 두 시트가 1:1로 대응하는지 확인해 주세요.',
      );
    }

    const warnings: string[] = [];
    const lines: ImportedExportShipmentLine[] = [];

    for (let i = 0; i < invData.length; i++) {
      const invRow = invData[i].row;
      const pklRow = pklData[i].row;
      const lineNo = i + 1;

      let description = String(invRow[invCols.description] ?? '');
      let hsCode: string | null = null;
      const hsMatch = description.match(HS_CODE_REGEX);
      if (hsMatch) {
        hsCode = hsMatch[1];
        description = description.replace(HS_CODE_REGEX, '').trim();
      }

      const invUnit = toStringOrNull(invRow[invUnitIdx]) ?? '';
      const pklUnit = toStringOrNull(pklRow[pklUnitIdx]) ?? '';
      // 실제 파일에서 82줄 중 4줄이 서로 다름(원본 파일 자체의 오기로 추정) — 조용히
      // 무시하지 않고 경고 목록에 남긴다. INVOICE쪽 단위를 최종값으로 채택한다.
      if (invUnit !== pklUnit) {
        warnings.push(
          `${lineNo}행: 단위 불일치 (INVOICE="${invUnit || '(공백)'}"  vs  Packing List="${pklUnit || '(공백)'}") — INVOICE 값을 사용했습니다.`,
        );
      }

      const invDescRaw = String(invRow[invCols.description] ?? '').trim();
      const pklDescRaw = String(pklRow[colIndex(pklHeader, 'DESCRIPTION')] ?? '').trim();
      if (invDescRaw !== pklDescRaw) {
        warnings.push(`${lineNo}행: DESCRIPTION이 두 시트에서 서로 다릅니다 — INVOICE 값을 사용했습니다.`);
      }

      lines.push({
        styleNo: invData[i].styleNo,
        description,
        hsCode,
        qty: toNumberOrNull(invRow[invCols.qty]) ?? 0,
        unit: invUnit,
        unitPrice: toNumberOrNull(invRow[invCols.unitPrice]),
        amount: toNumberOrNull(invRow[invCols.amount]),
        netWeight: toNumberOrNull(pklRow[pklCols.netWeight]),
        grossWeight: toNumberOrNull(pklRow[pklCols.grossWeight]),
        packageCount: toNumberOrNull(pklRow[pklCols.packageCount]),
        packageType: toStringOrNull(pklRow[pklPackageTypeIdx]),
      });
    }

    // 고정 위치(실제 파일로 검증됨) — STYLE NO/DESCRIPTION 표와 달리 이 헤더 정보
    // 블록은 이 회사의 INVOICE 템플릿에서 항상 같은 위치에 있어 하드코딩한다.
    const invRows = invoiceSheet.rows;
    const header: ImportedExportShipmentHeader = {
      sheetNo: toStringOrNull(invRows[0]?.[5]),
      invoiceDate: excelSerialToDate(invRows[3]?.[5]),
      portOfLoading: toStringOrNull(invRows[20]?.[0]),
      finalDestination: toStringOrNull(invRows[20]?.[1]),
      carrier: toStringOrNull(invRows[23]?.[0]),
      sailingDate: excelSerialToDate(invRows[23]?.[1]),
    };

    return { header, lines, warnings };
  }
}
