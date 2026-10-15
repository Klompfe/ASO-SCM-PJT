import type { BomDiffRow, BomSimilarPair, BomDiffExistingRow, BomDiffIncomingRow, BomReconcileAction } from '../api/mapping.service';

// PR-198: 자재명세 엑셀 업로드 저장 전 "기존 BOM과 비교" 화면의 순수 로직 — 백엔드
// bom-diff 응답(rows + similarPairs)을 화면 표 1개로 합치고, 행 유형별 기본 동작을
// 정하고, "엑셀 기준으로 모두 맞추기"가 체크만 채우고, 사람이 고른 것만 실제 적용
// 액션(bom-reconcile 요청)으로 바꾼다. 어떤 자동 확정도 하지 않는다(buildReconcileActions는
// decisions에 명시적으로 담긴 것만 변환한다).
export type BomDiffRowDecision = 'SKIP' | 'OVERWRITE' | 'ADD' | 'KEEP' | 'REMOVE' | 'REPLACE';

export interface BomDiffDraftRow {
  key: string;
  type: BomDiffRow['type'] | 'SIMILAR';
  existing?: BomDiffExistingRow;
  incoming?: BomDiffIncomingRow;
}

// rows(SAME/VALUE_DIFF/ONLY_NEW/ONLY_EXISTING)와 similarPairs(제안)를 표 1개로 합친다
// — SIMILAR 짝은 한 줄로 보여준다. 순서는 rows 먼저, similarPairs 다음(둘 다 원래 순서 유지).
export function buildBomDiffDraftRows(rows: BomDiffRow[], similarPairs: BomSimilarPair[]): BomDiffDraftRow[] {
  const fromRows: BomDiffDraftRow[] = rows.map((r, i) => ({
    key: `row-${i}`,
    type: r.type,
    existing: r.existing,
    incoming: r.incoming,
  }));
  const fromSimilar: BomDiffDraftRow[] = similarPairs.map((p, i) => ({
    key: `similar-${i}`,
    type: 'SIMILAR',
    existing: p.existing,
    incoming: p.incoming,
  }));
  return [...fromRows, ...fromSimilar];
}

// 행 유형별 기본 동작. VALUE_DIFF는 건너뜀(사람이 "엑셀 값으로 덮어쓰기"를 직접 골라야
// 함), ONLY_NEW는 추가, ONLY_EXISTING은 그대로 두기(제거는 사람이 직접 고름), SIMILAR은
// 기본 선택 없음, SAME은 할 일이 없다 — 전부 SKIP(아무 액션도 만들지 않음)으로 표현한다.
export function defaultDecisionFor(row: BomDiffDraftRow): BomDiffRowDecision {
  switch (row.type) {
    case 'ONLY_NEW':
      return 'ADD';
    case 'ONLY_EXISTING':
      return 'KEEP';
    default:
      return 'SKIP';
  }
}

export function buildDefaultDecisions(rows: BomDiffDraftRow[]): Map<string, BomDiffRowDecision> {
  return new Map(rows.map((r) => [r.key, defaultDecisionFor(r)]));
}

// "엑셀 기준으로 모두 맞추기" — 체크만 채워 줄 뿐이고, 사람이 [적용]을 눌러야 저장된다.
// VALUE_DIFF→덮어쓰기, ONLY_NEW→추가, SIMILAR→교체, ONLY_EXISTING→제거.
export function applyExcelBasedDefaults(rows: BomDiffDraftRow[]): Map<string, BomDiffRowDecision> {
  const map = new Map<string, BomDiffRowDecision>();
  for (const row of rows) {
    switch (row.type) {
      case 'VALUE_DIFF':
        map.set(row.key, 'OVERWRITE');
        break;
      case 'ONLY_NEW':
        map.set(row.key, 'ADD');
        break;
      case 'ONLY_EXISTING':
        map.set(row.key, 'REMOVE');
        break;
      case 'SIMILAR':
        map.set(row.key, 'REPLACE');
        break;
      default:
        map.set(row.key, 'SKIP');
    }
  }
  return map;
}

export interface BomDiffSummary {
  same: number;
  valueDiff: number;
  onlyNew: number;
  onlyExisting: number;
  similar: number;
}

export function summarizeBomDiff(rows: BomDiffDraftRow[]): BomDiffSummary {
  const summary: BomDiffSummary = { same: 0, valueDiff: 0, onlyNew: 0, onlyExisting: 0, similar: 0 };
  for (const row of rows) {
    if (row.type === 'SAME') summary.same++;
    else if (row.type === 'VALUE_DIFF') summary.valueDiff++;
    else if (row.type === 'ONLY_NEW') summary.onlyNew++;
    else if (row.type === 'ONLY_EXISTING') summary.onlyExisting++;
    else if (row.type === 'SIMILAR') summary.similar++;
  }
  return summary;
}

function incomingToNewItem(incoming: BomDiffIncomingRow): Record<string, unknown> {
  return {
    itemName: incoming.itemName,
    category: incoming.category ?? undefined,
    colorCode: incoming.colorCode ?? undefined,
    spec: incoming.spec ?? undefined,
    consumption: incoming.consumption ?? undefined,
  };
}

// 사람이 고른 동작만 bom-reconcile 요청 액션으로 바꾼다 — SKIP/KEEP(동작 없음)인 행은
// 건너뛴다("동작이 없는 행은 그대로 둔다"). [적용]을 누르기 전까지는 호출되지 않는다.
export function buildReconcileActions(
  rows: BomDiffDraftRow[],
  decisions: Map<string, BomDiffRowDecision>,
): BomReconcileAction[] {
  const actions: BomReconcileAction[] = [];
  for (const row of rows) {
    const decision = decisions.get(row.key) ?? 'SKIP';
    if (decision === 'SKIP' || decision === 'KEEP') continue;
    if (decision === 'OVERWRITE' && row.existing && row.incoming) {
      actions.push({ type: 'OVERWRITE', bomItemId: row.existing.bomItemId, newItem: incomingToNewItem(row.incoming) });
    } else if (decision === 'ADD' && row.incoming) {
      actions.push({ type: 'ADD', newItem: incomingToNewItem(row.incoming) });
    } else if (decision === 'REMOVE' && row.existing) {
      actions.push({ type: 'REMOVE', bomItemId: row.existing.bomItemId });
    } else if (decision === 'REPLACE' && row.existing && row.incoming) {
      actions.push({ type: 'REPLACE', bomItemId: row.existing.bomItemId, newItem: incomingToNewItem(row.incoming) });
    }
  }
  return actions;
}
