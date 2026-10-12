// PR-188: 미도 단가표 일괄 등록 — CSV 텍스트(헤더 itemName,priceUsdMin,priceUsdMax,unit,note)를
// 파싱한다. 실제 등록 예정 데이터의 itemName에 쉼표(,)·큰따옴표(")가 들어가므로
// (예: `겉감(POLYESTER 95%, POLYURETHANE 5%)`) 표준 CSV 따옴표 규칙(RFC 4180)을 그대로
// 구현한다 — xlsx 라이브러리를 쓰는 다른 가져오기(hs-code-classification 등)와 달리 이건
// 사람이 직접 쓰거나 엑셀에서 "CSV로 저장"한 텍스트를 받으므로 자체 파서가 필요하다.

const REQUIRED_HEADERS = ['itemname', 'priceusdmin', 'priceusdmax', 'unit', 'note'];

// 따옴표(")로 감싼 필드 안의 쉼표/줄바꿈은 구분자로 보지 않고, ""는 리터럴 "로 푼다.
// BOM(﻿)과 CRLF를 먼저 정리한 뒤 문자 단위로 상태기계를 돌린다.
function parseCsvGrid(text: string): string[][] {
  const normalized = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < normalized.length) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 완전히 빈 줄(필드가 전부 공백)은 서식상의 여백이므로 무시한다.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const DECIMAL_6 = /^\d+(\.\d{1,6})?$/;

export interface ParsedMidoPriceCsvRow {
  line: number; // 1-based, 헤더 다음 첫 데이터 행이 1
  itemName: string;
  priceUsdMin: number | null;
  priceUsdMax: number | null;
  unit: string;
  note: string | null;
  errors: string[];
}

export interface ParsedMidoPriceCsv {
  rows: ParsedMidoPriceCsvRow[];
}

export class MidoPriceCsvParseError extends Error {}

export function parseMidoPriceCsv(csvText: string): ParsedMidoPriceCsv {
  const grid = parseCsvGrid(csvText);
  if (grid.length === 0) {
    throw new MidoPriceCsvParseError('CSV 내용이 비어 있습니다.');
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new MidoPriceCsvParseError(
      `CSV 헤더가 올바르지 않습니다. itemName,priceUsdMin,priceUsdMax,unit,note 열이 모두 있어야 합니다(누락: ${missing.join(', ')}).`,
    );
  }
  const col = {
    itemName: header.indexOf('itemname'),
    priceUsdMin: header.indexOf('priceusdmin'),
    priceUsdMax: header.indexOf('priceusdmax'),
    unit: header.indexOf('unit'),
    note: header.indexOf('note'),
  };

  const rows: ParsedMidoPriceCsvRow[] = [];
  const itemNameLines = new Map<string, number[]>(); // 파일 내 중복 itemName 탐지용(같은 itemName이 여러 줄이면 전부 ERROR)

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    const line = r; // 헤더 제외 1-based
    const errors: string[] = [];

    const itemName = (raw[col.itemName] ?? '').trim();
    const minRaw = (raw[col.priceUsdMin] ?? '').trim();
    const maxRaw = (raw[col.priceUsdMax] ?? '').trim();
    const unit = (raw[col.unit] ?? '').trim();
    const noteRaw = (raw[col.note] ?? '').trim();

    if (!itemName) errors.push('itemName은 비어 있을 수 없습니다.');
    if (!unit) errors.push('unit은 비어 있을 수 없습니다.');

    let priceUsdMin: number | null = null;
    if (!minRaw) {
      errors.push('priceUsdMin은 비어 있을 수 없습니다.');
    } else if (!DECIMAL_6.test(minRaw)) {
      errors.push('priceUsdMin은 0 이상, 소수 최대 6자리의 숫자여야 합니다.');
    } else {
      priceUsdMin = Number(minRaw);
    }

    let priceUsdMax: number | null = null;
    if (!maxRaw) {
      priceUsdMax = priceUsdMin; // 비어 있으면 min과 같게(요구사항).
    } else if (!DECIMAL_6.test(maxRaw)) {
      errors.push('priceUsdMax는 0 이상, 소수 최대 6자리의 숫자여야 합니다.');
    } else {
      priceUsdMax = Number(maxRaw);
    }

    if (priceUsdMin != null && priceUsdMax != null && priceUsdMin > priceUsdMax) {
      errors.push('priceUsdMin은 priceUsdMax보다 클 수 없습니다.');
    }

    if (itemName) {
      const lines = itemNameLines.get(itemName) ?? [];
      lines.push(line);
      itemNameLines.set(itemName, lines);
    }

    rows.push({ line, itemName, priceUsdMin, priceUsdMax, unit, note: noteRaw || null, errors });
  }

  // 같은 파일 안에서 itemName이 두 번 이상 나오면(어느 행을 써야 할지 모호) 전부 ERROR 처리한다.
  for (const [name, lines] of itemNameLines) {
    if (lines.length > 1) {
      for (const row of rows) {
        if (row.itemName === name) row.errors.push(`같은 파일에 itemName "${name}"이(가) ${lines.length}번 나옵니다(행 ${lines.join(', ')}).`);
      }
    }
  }

  return { rows };
}
