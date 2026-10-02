import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-166: "26FW_통합_SALES_CONTRACT.xlsx" 같은 통합 SALES CONTRACT 파일을 읽는다.
// 실제 파일 구조(2026-10 확인, 110행): 시트 1개("통합"), 헤더
// `No. | Style No. | Description | Quantity | Unit | Unit Price | Amount | Source File`.
// 헤더 문구/시트명이 달라질 수 있어 hs-code-classification-import-parser.util.ts와
// 동일하게 normalize() 유연 매칭 + 헤더 행 탐색을 쓴다. 하드코딩 행 번호에 의존하지 않는다.

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

export interface ParsedSalesContractPriceRow {
  rowNumber: number; // 1-based, 헤더 다음 첫 데이터 행이 1
  styleNo: string;
  category: string | null;
  quantity: number | null;
  unit: string;
  unitPrice: number;
  amount: number | null;
  sourceFile: string | null;
}

export interface ParsedSalesContractPriceImport {
  rows: ParsedSalesContractPriceRow[];
  skippedCount: number; // Style No 또는 Unit Price가 빈칸이라 건너뛴 행 수
}

function toStringOrEmpty(v: unknown): string {
  return String(v ?? '').trim();
}

function toStringOrNull(v: unknown): string | null {
  const s = toStringOrEmpty(v);
  return s === '' ? null : s;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export class SalesContractPriceImportParser {
  static parse(buffer: Buffer): ParsedSalesContractPriceImport {
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    const HEADER_SIGNATURE = ['STYLENO', 'UNITPRICE'];

    let headerIdx = -1;
    let rows: RawRow[] | null = null;

    for (const sheetName of workbook.SheetNames) {
      const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
      }) as RawRow[];
      const idx = findHeaderRow(sheetRows, HEADER_SIGNATURE);
      if (idx !== -1) {
        headerIdx = idx;
        rows = sheetRows;
        break;
      }
    }

    if (!rows || headerIdx === -1) {
      throw new BadRequestException(
        "인식 가능한 SALES CONTRACT 양식을 찾지 못했습니다. 'Style No. / Unit Price' 헤더가 있는 시트가 필요합니다.",
      );
    }

    const header = rows[headerIdx];
    const cols = {
      styleNo: colIndex(header, 'STYLENO'),
      category: colIndex(header, 'DESCRIPTION'),
      quantity: colIndex(header, 'QUANTITY'),
      unit: colIndex(header, 'UNIT'),
      unitPrice: colIndex(header, 'UNITPRICE'),
      amount: colIndex(header, 'AMOUNT'),
      sourceFile: colIndex(header, 'SOURCEFILE'),
    };

    const parsedRows: ParsedSalesContractPriceRow[] = [];
    let skippedCount = 0;
    let rowNumber = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const styleNo = toStringOrEmpty(row[cols.styleNo]);
      const unitPrice = toNumberOrNull(row[cols.unitPrice]);
      // 완전히 빈 여백 행이나, Style No/Unit Price 둘 중 하나라도 비면(판단 기준이
      // 없는 행) 집계에 넣지 않고 건너뛴다 — 평균/범위 계산을 오염시키지 않기 위함.
      if (styleNo === '' && unitPrice == null) continue;
      if (styleNo === '' || unitPrice == null) {
        skippedCount++;
        continue;
      }

      rowNumber++;
      parsedRows.push({
        rowNumber,
        styleNo,
        category: toStringOrNull(row[cols.category]),
        quantity: toNumberOrNull(row[cols.quantity]),
        unit: toStringOrEmpty(row[cols.unit]) || 'PCS',
        unitPrice,
        amount: toNumberOrNull(row[cols.amount]),
        sourceFile: toStringOrNull(row[cols.sourceFile]),
      });
    }

    return { rows: parsedRows, skippedCount };
  }
}
