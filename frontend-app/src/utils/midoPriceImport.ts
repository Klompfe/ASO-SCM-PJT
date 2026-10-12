import type { MidoPriceImportPreviewRow } from '../api/midoPriceTable.service';

// PR-188: CSV 일괄 등록 미리보기 후 기본 체크 상태 — 오류 없는 신규(NEW)만 기본 체크,
// 변경(CHANGED)은 기존 값을 실수로 덮어쓰지 않도록 기본 해제, SAME/ERROR는 애초에
// 선택 대상이 아니다(호출자가 checkable 여부를 별도로 판단).
export function defaultSelectedLines(rows: MidoPriceImportPreviewRow[]): Record<number, boolean> {
  const next: Record<number, boolean> = {};
  for (const row of rows) next[row.line] = row.status === 'NEW';
  return next;
}

// 체크 가능한 행(NEW/CHANGED)만 추린다 — SAME/ERROR는 체크박스 자체를 보여주지 않는다.
export function selectableRows(rows: MidoPriceImportPreviewRow[]): MidoPriceImportPreviewRow[] {
  return rows.filter((r) => r.status === 'NEW' || r.status === 'CHANGED');
}
