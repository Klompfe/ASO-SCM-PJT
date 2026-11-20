import type { OrderOverviewCompareRow, OrderOverviewConflict } from '../api/salesOrders.service';

// PR-249: 기존 스타일의 오더개요 항목별 비교 선택(순수 로직) — 값은 가공하지 않는다.
// 기본은 항목마다 "기존 값 유지". 사용자가 differs 항목에서 "새 값 사용"을 누른 필드만 저장 요청의
// overwriteOrderFields 로 보낸다(서버가 그 필드만 교체, 나머지는 유지/채움 규칙).
export const ORDER_OVERVIEW_LABELS: Record<string, string> = {
  totalQty: '총수량',
  buyer: '바이어',
  styleName: '스타일명',
  brand: '브랜드',
  itemType: '품목',
  productionType: '임가공 구분',
  targetRdd: '납기',
};

export const orderOverviewLabel = (field: string): string => ORDER_OVERVIEW_LABELS[field] ?? field;

export type OverviewChoiceSet = ReadonlySet<string>;

// "새 값 사용"을 고른 필드 집합. 같은 버튼을 다시 누르면(되돌리기) 해제된다.
export function toggleOverviewUseNew(chosen: OverviewChoiceSet, field: string): Set<string> {
  const next = new Set(chosen);
  if (next.has(field)) next.delete(field);
  else next.add(field);
  return next;
}

// 서버로 보낼 필드 — differs 인 항목 중 새 값 사용을 고른 것만(다른 상태의 선택은 무시).
export function buildOverwriteOrderFields(rows: OrderOverviewCompareRow[] | undefined, chosen: OverviewChoiceSet): string[] {
  return (rows ?? []).filter((r) => r.status === 'differs' && chosen.has(r.field)).map((r) => r.field);
}

export function countOverviewOverwrites(rows: OrderOverviewCompareRow[] | undefined, chosen: OverviewChoiceSet): number {
  return buildOverwriteOrderFields(rows, chosen).length;
}

// 사용자가 결정해야 하는 항목(기존 값과 달라서 유지/새 값 선택이 필요)이 있는지.
export const hasOverviewDecision = (rows: OrderOverviewCompareRow[] | undefined): boolean =>
  (rows ?? []).some((r) => r.status === 'differs');

// 저장 결과 안내 — 기존 값과 달라 유지한 오더개요 항목 수(개별 저장·일괄 저장 공통). 없으면 null.
export function formatOverviewConflictsNotice(conflicts: OrderOverviewConflict[] | null | undefined): string | null {
  const n = conflicts?.length ?? 0;
  if (n === 0) return null;
  return `오더개요 ${n}개 항목이 기존과 달라 유지했습니다(개별 저장에서 비교 후 바꿀 수 있습니다)`;
}

// 최종 확인창에 덧붙이는 문구 — 교체가 없으면 null(기존 문구 그대로).
export function formatOverviewOverwriteConfirm(count: number): string | null {
  return count > 0 ? `오더개요 ${count}개 항목을 새 값으로 바꿉니다.` : null;
}

// 비교 화면 최종 확인창 문구 — 확인할 것이 없으면 null(확인창 없음). 삭제만 있으면 기존 문구와 완전히 같다.
// 혼용률·오더개요 교체가 있으면 해당 줄을 앞에 덧붙인다.
export function buildCompareConfirmMessage(args: {
  deleteNames: string[];
  compositionOverwriteCount: number;
  overviewOverwriteCount: number;
}): string | null {
  const { deleteNames, compositionOverwriteCount, overviewOverwriteCount } = args;
  const lines: string[] = [];
  const overviewLine = formatOverviewOverwriteConfirm(overviewOverwriteCount);
  if (overviewLine) lines.push(overviewLine);
  if (compositionOverwriteCount > 0) lines.push(`혼용률 ${compositionOverwriteCount}행을 새 값으로 바꿉니다.`);
  const deleteMessage =
    deleteNames.length > 0 ? `기존 자재 ${deleteNames.length}건이 삭제됩니다. 계속할까요?\n- ${deleteNames.join('\n- ')}` : null;
  if (lines.length === 0) return deleteMessage;
  return deleteMessage ? `${lines.join('\n')}\n${deleteMessage}` : `${lines.join(' ')} 계속할까요?`;
}
