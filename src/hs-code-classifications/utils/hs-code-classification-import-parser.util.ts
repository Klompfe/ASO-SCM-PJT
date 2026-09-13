import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-081: "26 SS FW 베트남 수입 완제품 HS CODE" 같은 시즌별 HS코드 엑셀을 가져온다.
// 시트 1개, 헤더는 `No. | Style No. | Item | 재직 | 혼용률 | HS. CODE | 관,부가세 유무`
// (공백/줄바꿈 표기 차이가 있을 수 있어 normalize()로 유연하게 매칭한다 —
// export-shipment-import-parser.util.ts / packing-receipt-excel-parser.util.ts와
// 동일한 패턴). 절대 하드코딩 행 번호에 의존하지 않는다.

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

export interface ParsedHsCodeRow {
  rowNumber: number; // 1-based, 헤더 다음 첫 데이터 행이 1 (에러/충돌 메시지 표시용)
  styleNo: string;
  itemType: string;
  fabricType: string;
  composition: string;
  hsCode: string;
  note: string | null;
}

export interface ParsedHsCodeImport {
  rows: ParsedHsCodeRow[];
  skippedCount: number; // Style No가 빈칸/"0"이라 건너뛴 행 수
}

function toStringOrEmpty(v: unknown): string {
  return String(v ?? '').trim();
}

function toStringOrNull(v: unknown): string | null {
  const s = toStringOrEmpty(v);
  return s === '' ? null : s;
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

export class HsCodeClassificationImportParser {
  static parse(buffer: Buffer): ParsedHsCodeImport {
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    const HEADER_SIGNATURE = ['STYLENO', 'ITEM', '재직', '혼용률', 'HSCODE'];

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
        "인식 가능한 HS코드 양식을 찾지 못했습니다. 'Style No. / Item / 재직 / 혼용률 / HS. CODE' " +
          '헤더가 있는 시트가 필요합니다. 직접 등록(POST /hs-code-classifications)을 이용해 주세요.',
      );
    }

    const header = rows[headerIdx];
    const cols = {
      styleNo: colIndex(header, 'STYLENO'),
      itemType: colIndex(header, 'ITEM'),
      fabricType: colIndex(header, '재직'),
      composition: colIndex(header, '혼용률'),
      hsCode: colIndex(header, 'HSCODE'),
      note: colIndex(header, '관부가세유무'),
    };

    const parsedRows: ParsedHsCodeRow[] = [];
    let skippedCount = 0;
    let rowNumber = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const itemType = toStringOrEmpty(row[cols.itemType]);
      const hsCode = toStringOrEmpty(row[cols.hsCode]);
      // 표 끝의 완전히 빈 여백 행은 데이터가 아니므로 조용히 무시한다(서식상의
      // 빈 줄 — Style No 규칙과는 별개로, 애초에 아무 내용도 없는 행).
      if (itemType === '' && hsCode === '') continue;

      rowNumber++;

      const rawStyleNo = toStringOrEmpty(row[cols.styleNo]);
      // Style No가 빈칸이거나 "0"인 행은 건너뛴다(요청 사양) — 분류(품종+재직+
      // 혼용률)만 있고 스타일 매핑이 없는 상태로 절반만 반영하지 않는다.
      if (rawStyleNo === '' || rawStyleNo === '0') {
        skippedCount++;
        continue;
      }

      // 재직 컬럼은 선행 공백 등 표기 차이만 있고 실질 값은 동일하므로 trim해
      // 정규화한다(요청 사양 — "직물"과 " 직물"을 같은 값으로 합친다).
      const fabricType = toStringOrEmpty(row[cols.fabricType]);

      parsedRows.push({
        rowNumber,
        styleNo: rawStyleNo,
        itemType,
        fabricType,
        composition: toStringOrEmpty(row[cols.composition]),
        hsCode,
        note: toStringOrNull(row[cols.note]),
      });
    }

    return { rows: parsedRows, skippedCount };
  }
}
