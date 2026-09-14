import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-083: 태일 VN 공장이 실제로 작성하는 Vietnam INVOICE/Packing List 엑셀
// ("副本副本TYVN-SF-08-2026.xlsx" 형태 — 실 샘플 1장으로 구조 검증됨, 시트명은
// "INV,P.List"처럼 신뢰할 수 없어 사용하지 않는다)을 그대로 업로드해 ImportShipment
// (+lines)를 자동 생성한다. export-shipment-import-parser.util.ts와 동일한 헬퍼
// 패턴(normalize/findHeaderRow/colIndex/toNumberOrNull/toStringOrNull/
// excelSerialToDate)을 따른다.
//
// export 쪽 파일과의 핵심 차이: INVOICE/PACKING LIST 섹션이 별도 시트가 아니라
// "같은 시트" 안에 위아래로 이어져 있다. 하지만 findHeaderRow를 그 시트의 rows
// 배열에 서로 다른 시그니처로 두 번 호출하면 자연히 PACKING LIST 헤더가 INVOICE
// 헤더보다 뒤에서 발견되므로 별도의 오프셋 계산 없이 그대로 동작한다.

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

const DEFAULT_UNIT = 'PCS';

export interface ImportedImportShipmentLine {
  styleNo: string;
  itemType: string;
  composition: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  netWeight: number | null;
  grossWeight: number | null;
  packageCount: number | null;
}

export interface ImportedImportShipmentHeader {
  invoiceNo: string | null;
  invoiceDate: Date | null;
  portOfLoading: string | null;
  finalDestination: string | null;
  carrier: string | null;
  sailingDate: Date | null;
}

export interface ParsedImportedImportShipment {
  header: ImportedImportShipmentHeader;
  lines: ImportedImportShipmentLine[];
  warnings: string[];
}

function findHeaderRow(rows: RawRow[], requiredNormalizedHeaders: string[], fromIndex = 0): number {
  for (let i = fromIndex; i < rows.length; i++) {
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

function isNumericCell(v: unknown): boolean {
  return v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
}

function toStringOrNull(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  return String(v);
}

// Excel 날짜 시리얼(예: 46207)을 실제 날짜로 변환한다 — export-shipment-import-parser
// 의 excelSerialToDate와 동일.
function excelSerialToDate(v: unknown): Date | null {
  if (typeof v !== 'number') return null;
  const parsed = (xlsx as any).SSF.parse_date_code(v);
  if (!parsed || !parsed.y) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

// 문자열의 "마지막 %" 문자를 기준으로 혼용률(composition)/품종(itemType)을 분리한다.
// 예: "POLYESTER 54% WOOL 44% POLYURETHANE 2% WOMEN'S PANTS"
//     -> composition="POLYESTER 54% WOOL 44% POLYURETHANE 2%", itemType="WOMEN'S PANTS"
// '%'가 전혀 없으면(예상 밖 형식) 억지로 나누지 않고 전체를 itemType으로 두고
// composition은 빈 문자열로 남긴 뒤 경고를 남긴다 — 조용히 잘못 나누는 것보다 낫다.
function splitCompositionAndItemType(description: string): { composition: string; itemType: string } {
  const lastPercentIdx = description.lastIndexOf('%');
  if (lastPercentIdx === -1) {
    return { composition: '', itemType: description.trim() };
  }
  return {
    composition: description.slice(0, lastPercentIdx + 1).trim(),
    itemType: description.slice(lastPercentIdx + 1).trim(),
  };
}

interface DataRowResult {
  rowIndex: number;
  styleNo: string;
  description: string;
  row: RawRow;
}

// 헤더 다음 행부터 끝까지 순회하며 "styleNo 컬럼이 비어있지 않고 qty 컬럼이 숫자인
// 행"을 데이터 행으로 판정한다(고정 오프셋 반복이 아님 — 양식상의 빈 패딩 행이
// 섞여 있기 때문). 데이터 행의 description은 그 위쪽으로 가장 가까운, styleNo
// 컬럼이 비어있지 않은 행에서 가져온다(설명행과 데이터행 사이에 빈 줄이 여러 개
// 끼어 있어도 정상 동작하도록 "바로 위 행"을 일반화함 — 실제 검증된 샘플에서는
// 항상 바로 위 행이라 결과는 동일하다). styleNo 컬럼 값이 'TOTAL'이면(대소문자
// 무시) 그 행에서 루프를 종료한다(총계 행 자체는 데이터로 넣지 않음).
function extractDataRows(rows: RawRow[], headerIdx: number, styleColIdx: number, qtyColIdx: number): DataRowResult[] {
  const result: DataRowResult[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawStyle = row[styleColIdx];
    if (typeof rawStyle === 'string' && rawStyle.trim().toUpperCase() === 'TOTAL') {
      break;
    }

    const hasStyle = rawStyle !== '' && rawStyle !== null && rawStyle !== undefined;
    if (hasStyle && isNumericCell(row[qtyColIdx])) {
      let descriptionRowIdx = i - 1;
      while (descriptionRowIdx > headerIdx) {
        const candidate = rows[descriptionRowIdx]?.[styleColIdx];
        if (candidate !== '' && candidate !== null && candidate !== undefined) break;
        descriptionRowIdx--;
      }
      const description = String(rows[descriptionRowIdx]?.[styleColIdx] ?? '').trim();

      result.push({ rowIndex: i, styleNo: String(rawStyle).trim(), description, row });
    }
  }

  return result;
}

export class ImportShipmentExcelParser {
  static parse(buffer: Buffer): ParsedImportedImportShipment {
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    const INVOICE_SIGNATURE = ['STYLENO', 'QUANTITY', 'UNITPRICE', 'AMOUNT'];
    const PACKING_LIST_SIGNATURE = ['STYLENO', 'QUANTITY', 'NWEIGHT', 'GWEIGHT'];

    let rows: RawRow[] | null = null;
    let invHeaderIdx = -1;
    let pklHeaderIdx = -1;

    for (const sheetName of workbook.SheetNames) {
      const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
      }) as RawRow[];

      const invIdx = findHeaderRow(sheetRows, INVOICE_SIGNATURE);
      if (invIdx === -1) continue;
      // PACKING LIST 헤더는 INVOICE 헤더보다 반드시 아래(같은 시트)에 있다 —
      // 앞쪽부터 다시 찾으면 혹시라도 INVOICE 헤더 행 자체가 우연히 매칭되는
      // 사고를 막을 수 있어 invIdx+1부터 찾는다.
      const pklIdx = findHeaderRow(sheetRows, PACKING_LIST_SIGNATURE, invIdx + 1);
      if (pklIdx === -1) continue;

      rows = sheetRows;
      invHeaderIdx = invIdx;
      pklHeaderIdx = pklIdx;
      break;
    }

    if (!rows) {
      throw new BadRequestException(
        'INVOICE/Packing List 양식을 찾지 못했습니다. 같은 시트 안에 STYLE NO/QUANTITY/UNIT PRICE/AMOUNT' +
          ' 헤더를 가진 INVOICE 섹션과 STYLE NO/QUANTITY/N.WEIGHT/G.WEIGHT 헤더를 가진 PACKING LIST 섹션이' +
          ' 모두 있어야 합니다. 이 양식이 아니라면 직접입력을 이용해 주세요.',
      );
    }

    const invHeader = rows[invHeaderIdx];
    const pklHeader = rows[pklHeaderIdx];

    const invCols = {
      style: colIndex(invHeader, 'STYLENO'),
      qty: colIndex(invHeader, 'QUANTITY'),
      unitPrice: colIndex(invHeader, 'UNITPRICE'),
      amount: colIndex(invHeader, 'AMOUNT'),
    };
    const pklCols = {
      style: colIndex(pklHeader, 'STYLENO'),
      qty: colIndex(pklHeader, 'QUANTITY'),
      netWeight: colIndex(pklHeader, 'NWEIGHT'),
      grossWeight: colIndex(pklHeader, 'GWEIGHT'),
      packageCount: colIndex(pklHeader, 'CTNS'),
    };

    const invData = extractDataRows(rows, invHeaderIdx, invCols.style, invCols.qty);
    // PACKING LIST 섹션은 INVOICE 헤더 이후, 즉 pklHeaderIdx 다음부터 읽어야
    // INVOICE 섹션의 데이터 행을 잘못 끌어오지 않는다.
    const pklData = extractDataRows(rows, pklHeaderIdx, pklCols.style, pklCols.qty);

    if (invData.length !== pklData.length) {
      throw new BadRequestException(
        `INVOICE(${invData.length}행)와 Packing List(${pklData.length}행)의 데이터 행 수가 서로 달라 ` +
          '안전하게 합칠 수 없습니다. 원본 파일의 두 섹션이 1:1로 대응하는지 확인해 주세요.',
      );
    }

    const warnings: string[] = [];
    const lines: ImportedImportShipmentLine[] = [];

    for (let i = 0; i < invData.length; i++) {
      const invRow = invData[i];
      const pklRow = pklData[i];
      const lineNo = i + 1;

      if (invRow.description !== pklRow.description) {
        warnings.push(
          `${lineNo}행: INVOICE와 Packing List의 설명(description)이 서로 다릅니다 — INVOICE 값을 사용했습니다.`,
        );
      }

      const invQty = toNumberOrNull(invRow.row[invCols.qty]) ?? 0;
      const pklQty = toNumberOrNull(pklRow.row[pklCols.qty]) ?? 0;
      if (invQty !== pklQty) {
        warnings.push(
          `${lineNo}행(${invRow.styleNo}): INVOICE 수량(${invQty})과 Packing List 수량(${pklQty})이 서로 다릅니다 — INVOICE 값을 사용했습니다.`,
        );
      }

      const { composition, itemType } = splitCompositionAndItemType(invRow.description);
      if (!composition) {
        warnings.push(
          `${lineNo}행(${invRow.styleNo}): 설명 텍스트에서 '%'를 찾지 못해 혼용률/품종을 분리하지 못했습니다 — "${invRow.description}" 전체를 품종으로 저장했습니다.`,
        );
      }

      lines.push({
        styleNo: invRow.styleNo,
        itemType,
        composition,
        qty: invQty,
        unit: DEFAULT_UNIT,
        unitPrice: toNumberOrNull(invRow.row[invCols.unitPrice]),
        amount: toNumberOrNull(invRow.row[invCols.amount]),
        netWeight: toNumberOrNull(pklRow.row[pklCols.netWeight]),
        grossWeight: toNumberOrNull(pklRow.row[pklCols.grossWeight]),
        packageCount: toNumberOrNull(pklRow.row[pklCols.packageCount]),
      });
    }

    // 헤더 정보 블록 — 실 샘플 1장으로 검증된 고정 위치(이 회사 INVOICE 템플릿 전용).
    const header: ImportedImportShipmentHeader = {
      invoiceNo: toStringOrNull(rows[2]?.[6]),
      invoiceDate: excelSerialToDate(rows[2]?.[9]),
      portOfLoading: toStringOrNull(rows[17]?.[0]),
      finalDestination: toStringOrNull(rows[17]?.[4]),
      carrier: toStringOrNull(rows[19]?.[0]),
      sailingDate: excelSerialToDate(rows[19]?.[4]),
    };

    return { header, lines, warnings };
  }
}
