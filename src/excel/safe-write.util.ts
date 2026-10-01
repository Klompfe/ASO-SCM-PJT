import * as XLSX from 'xlsx';

// MLA-003: docs/material-list-rules.md 2장(기본 작업 절차) No.3/No.4를 코드로 보장하는
// 유틸. 도너 시트를 직접 수정할 때 "병합 셀을 해제했다가 다시 합치는" 방식이 테두리·
// 글자크기를 깨뜨렸던 사고(규칙 문서 6장 표 1번)와, 행 삽입 시 엑셀 자체 기능이 병합
// 범위를 잘못 늘렸던 사고(같은 표 2번)를 막는 것이 목적이다. 이 모듈은 병합 자체를
// 해제하지 않고 "대표(좌상단) 셀에만 쓰기"와 "병합/행높이/같은 행 수식을 좌표 계산으로
// 재정렬하기"만 제공한다 — 셀 스타일(.s)은 손대지 않고 그대로 보존한다.

export type MergeRange = XLSX.Range;

// 특정 셀(row, col)이 속한 병합 범위의 대표(좌상단) 셀 좌표를 찾는다. 병합에 속하지
// 않으면 입력 좌표를 그대로 돌려준다.
export function findWriteAnchor(
  merges: MergeRange[],
  row: number,
  col: number,
): XLSX.CellAddress {
  for (const m of merges) {
    if (row >= m.s.r && row <= m.e.r && col >= m.s.c && col <= m.e.c) {
      return { r: m.s.r, c: m.s.c };
    }
  }
  return { r: row, c: col };
}

// 병합 해제 없이 안전하게 값을 쓴다 — 대상 셀이 병합 범위 안에 있으면 대표(좌상단)
// 셀에만 쓰고, 병합이 아니면 해당 셀에 그대로 쓴다. 기존 셀의 스타일(.s)은 보존하고,
// 리터럴 값을 쓰는 것이므로 기존에 수식(.f)이 있었다면 더 이상 유효하지 않아 지운다.
export function writeCellSafe(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
  value: XLSX.CellObject['v'],
): XLSX.WorkSheet {
  const merges = (sheet['!merges'] as MergeRange[] | undefined) ?? [];
  const anchor = findWriteAnchor(merges, row, col);
  const address = XLSX.utils.encode_cell(anchor);

  const existing = sheet[address] as XLSX.CellObject | undefined;
  const cell: XLSX.CellObject = {
    ...existing,
    v: value,
    t: typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's',
  };
  delete cell.f;
  sheet[address] = cell;

  growRefToInclude(sheet, anchor);
  return sheet;
}

function growRefToInclude(sheet: XLSX.WorkSheet, addr: XLSX.CellAddress): void {
  const existingRef = sheet['!ref'] as string | undefined;
  if (!existingRef) {
    sheet['!ref'] = XLSX.utils.encode_range({ s: addr, e: addr });
    return;
  }
  const range = XLSX.utils.decode_range(existingRef);
  range.s.r = Math.min(range.s.r, addr.r);
  range.s.c = Math.min(range.s.c, addr.c);
  range.e.r = Math.max(range.e.r, addr.r);
  range.e.c = Math.max(range.e.c, addr.c);
  sheet['!ref'] = XLSX.utils.encode_range(range);
}

// 수식 안에서 "이 수식이 들어있는 셀과 같은 행"을 가리키는 열-행 참조(예: K14, $B14)만
// 골라 행 번호를 바꾼다. 규칙 문서 v2-1("같은 행 수식 =K*B, =R-M 을 함께 재정렬")이
// 다루는 범위가 정확히 이것이다 — 다른 행/다른 시트를 가리키는 참조는 건드리지 않는다
// (의도적으로 좁은 범위: 일반적인 수식 AST 파서가 아니다).
function shiftSameRowFormulaRefs(formula: string, oldRow0: number, newRow0: number): string {
  const oldRow1 = oldRow0 + 1; // 수식은 1-based 행 번호(A1 표기)를 쓴다.
  const newRow1 = newRow0 + 1;
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (match, colPart, rowAbsMark, rowDigits) => {
    if (Number(rowDigits) !== oldRow1) return match;
    return `${colPart}${rowAbsMark}${newRow1}`;
  });
}

function cellRowsFrom(sheet: XLSX.WorkSheet): Map<number, string[]> {
  const byRow = new Map<number, string[]>();
  for (const addr of Object.keys(sheet)) {
    if (addr[0] === '!') continue;
    const { r } = XLSX.utils.decode_cell(addr);
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(addr);
  }
  return byRow;
}

function shiftMergeForInsert(m: MergeRange, atRow: number, count: number): MergeRange {
  if (m.e.r < atRow) return m; // 삽입 지점보다 완전히 위 — 영향 없음
  if (m.s.r >= atRow) {
    // 삽입 지점 이후(또는 바로 그 지점) — 행 수만큼 그대로 이동
    return { s: { r: m.s.r + count, c: m.s.c }, e: { r: m.e.r + count, c: m.e.c } };
  }
  // 삽입 지점이 병합 범위 내부에 걸침 — 새로 들어온 행들을 포함하도록 늘어난다
  return { s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r + count, c: m.e.c } };
}

function shiftMergeForDelete(m: MergeRange, atRow: number, count: number): MergeRange | null {
  const delStart = atRow;
  const delEnd = atRow + count - 1;
  if (m.e.r < delStart) return m; // 삭제 구간보다 완전히 위 — 영향 없음
  if (m.s.r > delEnd) {
    // 삭제 구간보다 완전히 아래 — 행 수만큼 위로 당겨짐
    return { s: { r: m.s.r - count, c: m.s.c }, e: { r: m.e.r - count, c: m.e.c } };
  }
  if (m.s.r >= delStart && m.e.r <= delEnd) return null; // 삭제 구간에 완전히 포함 — 소멸

  // 부분적으로 겹침
  const newS = m.s.r < delStart ? m.s.r : delStart;
  const newE = m.e.r > delEnd ? m.e.r - count : delStart - 1;
  return { s: { r: newS, c: m.s.c }, e: { r: newE, c: m.e.c } };
}

// atRow(0-based) 앞에 count개의 빈 행을 삽입한다. atRow 이후의 셀 값은 아래로
// 밀려나고, 그 과정에서 병합 범위(걸쳐 있으면 늘어나고, 전부 이후면 함께 이동),
// 행 높이(!rows), 같은 행을 참조하는 수식을 모두 새 좌표에 맞게 재정렬한다.
export function insertRows(sheet: XLSX.WorkSheet, atRow: number, count = 1): XLSX.WorkSheet {
  if (count <= 0) return sheet;

  const byRow = cellRowsFrom(sheet);
  const rowsToMove = [...byRow.keys()].filter((r) => r >= atRow).sort((a, b) => b - a); // 큰 행부터 처리해야 충돌이 안 난다

  for (const r of rowsToMove) {
    for (const addr of byRow.get(r)!) {
      const { c } = XLSX.utils.decode_cell(addr);
      const cell = sheet[addr] as XLSX.CellObject;
      delete sheet[addr];
      if (cell?.f) cell.f = shiftSameRowFormulaRefs(cell.f, r, r + count);
      sheet[XLSX.utils.encode_cell({ r: r + count, c })] = cell;
    }
  }

  const merges = (sheet['!merges'] as MergeRange[] | undefined) ?? [];
  sheet['!merges'] = merges.map((m) => shiftMergeForInsert(m, atRow, count));

  const rowInfos = sheet['!rows'] as XLSX.RowInfo[] | undefined;
  if (rowInfos) {
    rowInfos.splice(atRow, 0, ...(new Array(count).fill(undefined) as XLSX.RowInfo[]));
  }

  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref'] as string);
    if (range.e.r >= atRow) range.e.r += count;
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  return sheet;
}

// atRow(0-based)부터 count개 행을 삭제한다. 그 아래 행들은 위로 당겨지고, 병합
// 범위(삭제 구간에 완전히 포함되면 소멸, 걸치면 축소, 완전히 아래면 함께 이동),
// 행 높이(!rows), 같은 행을 참조하는 수식을 모두 새 좌표에 맞게 재정렬한다.
export function deleteRows(sheet: XLSX.WorkSheet, atRow: number, count = 1): XLSX.WorkSheet {
  if (count <= 0) return sheet;

  const byRow = cellRowsFrom(sheet);

  // 삭제 구간 안의 셀은 그대로 제거
  for (let r = atRow; r < atRow + count; r++) {
    for (const addr of byRow.get(r) ?? []) {
      delete sheet[addr];
    }
  }

  // 삭제 구간 아래 셀은 위로 당긴다(작은 행부터 처리해야 충돌이 안 난다)
  const rowsToMove = [...byRow.keys()].filter((r) => r >= atRow + count).sort((a, b) => a - b);
  for (const r of rowsToMove) {
    for (const addr of byRow.get(r)!) {
      const { c } = XLSX.utils.decode_cell(addr);
      const cell = sheet[addr] as XLSX.CellObject;
      delete sheet[addr];
      if (cell?.f) cell.f = shiftSameRowFormulaRefs(cell.f, r, r - count);
      sheet[XLSX.utils.encode_cell({ r: r - count, c })] = cell;
    }
  }

  const merges = (sheet['!merges'] as MergeRange[] | undefined) ?? [];
  sheet['!merges'] = merges
    .map((m) => shiftMergeForDelete(m, atRow, count))
    .filter((m): m is MergeRange => m !== null);

  const rowInfos = sheet['!rows'] as XLSX.RowInfo[] | undefined;
  if (rowInfos) {
    rowInfos.splice(atRow, count);
  }

  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref'] as string);
    if (range.e.r >= atRow) range.e.r = Math.max(range.s.r, range.e.r - count);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  return sheet;
}
