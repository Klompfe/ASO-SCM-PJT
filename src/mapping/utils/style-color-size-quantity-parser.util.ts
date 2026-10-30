// PR-212: MATERIAL LIST의 "CLOOR/SIZE"(오타 그대로) 색상×사이즈 수량 블록을 읽는다.
// 118개 시트 전수조사 결과(모두 CLOOR/SIZE 헤더가 절대행 index 3이었지만, 특정 행을
// 하드코딩하지 않는다 — 다른 레이아웃의 시트가 들어올 수 있다): 헤더 행(예: ["CLOOR/SIZE",
// null,"55","66","77",null,null,null,"TOTAL"])의 오른쪽에 사이즈가 나열되고, 그 아래로
// H열(index 7)에 "국내" 라벨이 붙은 3행(색상 1~3개, 빈 행 가능), 이어서 "중국" 라벨이
// 붙은 3행(전수조사 결과 항상 비어 있음)이 온다. 집계 셀(EACH SIZE TOTAL/TOTAL 열)은
// 캐시값이 없어(전부 빈 칸) 절대 읽지 않고, 색상×사이즈 원본 셀만 읽어 직접 더한다.
//
// 사용자 결정: 중국 수량은 이번 PR에서 저장하지 않는다(국내만). 중국 블록에 0이 아닌
// 값이 있으면 저장하지 않고 경고 1회만 낸다.

export interface StyleColorSizeQtyRow {
  color: string;
  size: string;
  qty: number;
}

export interface ParseStyleColorSizeQuantitiesResult {
  rows: StyleColorSizeQtyRow[];
  warnings: string[];
  // 블록을 찾지 못했을 때만 채워진다 — 실패가 아니라 "수량표가 없는 시트"라는 정보성 안내.
  info?: string;
  quantitySum: number;
}

const CLOOR_SIZE_RE = /^CLOOR\s*\/\s*SIZE$/i;
const TOTAL_RE = /^TOTAL$/i;
const MARKET_COL = 7; // H열(0-indexed: A=0 ... H=7)
const DOMESTIC_LABEL = '국내';
const CHINA_LABEL = '중국';
const BLOCK_ROWS = 3;
const HEADER_SEARCH_ROW_LIMIT = 20;
const BLOCK_SEARCH_ROW_LIMIT = 12;

const trimCell = (v: unknown): string => (v ?? '').toString().trim();

type QtyCellResult = { kind: 'blank' } | { kind: 'invalid' } | { kind: 'value'; value: number };

// 정수 ≥0만 "값"으로 본다. 0과 빈 칸은 저장하지 않지만(정책), 둘 다 경고를 내지 않는다
// (유효한 "값 없음"으로 취급). 소수·음수·문자는 저장하지 않고 경고 대상(invalid).
function parseQtyCell(raw: unknown): QtyCellResult {
  const s = trimCell(raw).replace(/,/g, '');
  if (s === '') return { kind: 'blank' };
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { kind: 'invalid' };
  if (n === 0) return { kind: 'blank' };
  return { kind: 'value', value: n };
}

function findHeader(rawData: string[][]): { rowIndex: number; labelCol: number } | null {
  const limit = Math.min(rawData.length, HEADER_SEARCH_ROW_LIMIT);
  for (let r = 0; r < limit; r++) {
    const row = rawData[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (CLOOR_SIZE_RE.test(trimCell(row[c]))) return { rowIndex: r, labelCol: c };
    }
  }
  return null;
}

// CLOOR/SIZE 오른쪽 칸부터 TOTAL 앞까지, 비어 있지 않은 칸을 순서대로 사이즈로 본다
// (중간에 빈 칸이 있어도 건너뛸 뿐 멈추지 않는다 — TOTAL을 만나야만 멈춘다).
function findSizeColumns(headerRow: string[], labelCol: number): { index: number; size: string }[] {
  const sizes: { index: number; size: string }[] = [];
  for (let c = labelCol + 1; c < headerRow.length; c++) {
    const v = trimCell(headerRow[c]);
    if (!v) continue;
    if (TOTAL_RE.test(v)) break;
    sizes.push({ index: c, size: v });
  }
  return sizes;
}

function findBlockStart(rawData: string[][], fromRow: number, label: string): number | null {
  const limit = Math.min(rawData.length, fromRow + BLOCK_SEARCH_ROW_LIMIT);
  for (let r = fromRow; r < limit; r++) {
    const row = rawData[r] || [];
    if (trimCell(row[MARKET_COL]) === label) return r;
  }
  return null;
}

export function parseStyleColorSizeQuantities(rawData: string[][]): ParseStyleColorSizeQuantitiesResult {
  const header = findHeader(rawData);
  if (!header) {
    return { rows: [], warnings: [], info: 'CLOOR/SIZE 수량 블록을 찾지 못했습니다 — 수량표 없이 업로드를 계속합니다.', quantitySum: 0 };
  }

  const headerRow = rawData[header.rowIndex] || [];
  const sizeColumns = findSizeColumns(headerRow, header.labelCol);
  const warnings: string[] = [];
  const rows: StyleColorSizeQtyRow[] = [];
  const seenColors = new Set<string>();

  const domesticStart = findBlockStart(rawData, header.rowIndex + 1, DOMESTIC_LABEL);
  if (domesticStart != null) {
    for (let i = 0; i < BLOCK_ROWS; i++) {
      const r = domesticStart + i;
      const row = rawData[r] || [];

      const cellResults = sizeColumns.map((sc) => ({ size: sc.size, col: sc.index, result: parseQtyCell(row[sc.index]) }));
      for (const cell of cellResults) {
        if (cell.result.kind === 'invalid') {
          warnings.push(
            `[QTY_CELL_INVALID] ${r + 1}행 ${cell.size} 칸의 값(${JSON.stringify(row[cell.col] ?? null)})을 정수로 읽을 수 없어 저장하지 않았습니다.`,
          );
        }
      }

      const validCells = cellResults.filter((c): c is typeof c & { result: { kind: 'value'; value: number } } => c.result.kind === 'value');
      if (validCells.length === 0) continue;

      let color = trimCell(row[0]);
      if (!color) {
        color = 'NA';
        warnings.push(`[QTY_COLOR_BLANK] ${r + 1}행 색상 칸이 비어 있어 'NA'로 저장했습니다.`);
      }

      if (seenColors.has(color)) {
        warnings.push(`[QTY_COLOR_DUPLICATE] 색상 '${color}'이(가) 국내 블록에서 두 번 나와 처음 나온 행만 저장했습니다.`);
        continue;
      }
      seenColors.add(color);

      for (const cell of validCells) {
        rows.push({ color, size: cell.size, qty: cell.result.value });
      }
    }
  }

  const chinaStart = findBlockStart(rawData, header.rowIndex + 1, CHINA_LABEL);
  if (chinaStart != null) {
    let chinaHasNonZero = false;
    for (let i = 0; i < BLOCK_ROWS && !chinaHasNonZero; i++) {
      const row = rawData[chinaStart + i] || [];
      for (const sc of sizeColumns) {
        const result = parseQtyCell(row[sc.index]);
        if (result.kind === 'value' && result.value > 0) { chinaHasNonZero = true; break; }
      }
    }
    if (chinaHasNonZero) {
      warnings.push('[QTY_CHINA_IGNORED] 중국 수량은 아직 지원하지 않아 무시했습니다.');
    }
  }

  const quantitySum = rows.reduce((sum, r) => sum + r.qty, 0);
  return { rows, warnings, quantitySum };
}
