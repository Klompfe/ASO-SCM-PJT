import type {
  SalesOrderBomCompareRow,
  SalesOrderBomCompareDecisions,
} from '../api/salesOrders.service';
import { isOuterFabricCategory } from './compositionReview';

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 자재와 비교" 화면의 순수 로직 — PR-198의
// bomDiffReview.ts(엑셀 경로)와 같은 원칙이지만, 행 유형(same/similar/new/
// existingOnly)과 선택지(incoming: update/mergeInto/add, existing: keep/delete)가
// 다르다. 사용자 결정: 기본 선택은 "새 인식 우선" — ① 새 인식에 없는 기존 행은 기본
// 삭제(단, canDelete=false면 기본 유지로 고정) ② 비슷한 이름(후보) 행은 기본 새
// 자재로 추가(합치기는 사람이 선택) ③ 정규화 일치(same)는 기본 갱신.
export type IncomingDecision = 'update' | 'mergeInto' | 'add';
export type ExistingDecision = 'keep' | 'delete';

// PR-261 보강: keepByDefault 는 화면에서만 붙이는 표시(서버 응답·저장 요청에는 없다) — 이 행은 "새 인식 우선"의 기본 삭제에서 뺀다.
export type ReviewRow = SalesOrderBomCompareRow & { keepByDefault?: boolean };

export interface SalesOrderBomCompareDraftRow {
  key: string;
  row: ReviewRow;
}

export function buildDraftRows(rows: SalesOrderBomCompareRow[]): SalesOrderBomCompareDraftRow[] {
  const info = detectOuterDuplicate(rows);
  const keepExistingOuter = info.active || isOuterMissingInIncoming(info);
  return rows.map((row, i) => ({
    key: `${row.type}-${i}`,
    row: keepExistingOuter && row.type === 'existingOnly' && isOuterFabricCategory(row.existing?.category) ? { ...row, keepByDefault: true } : row,
  }));
}

// PR-263: 기존 겉감 계열이 1줄 이상인데 비교에 올라간 새 행에 겉감 계열이 하나도 없으면, 혼용률이 담긴 기존 겉감 행을 기본 삭제로 두지 않는다.
// 작지 인식이 겉감을 놓친 경우와 저장 화면에서 "제외"한 경우는 비교 요청에서 똑같이 "새 겉감 행 없음"이다 — "제외"는 이 보호를 풀지 않는다.
export const isOuterMissingInIncoming = (info: OuterDuplicateInfo): boolean =>
  info.existingOuterCount >= 1 && info.incomingOuterCount === 0;

// 기존 겉감 계열 2줄 이상이면 formatOuterDuplicateNotice(새 겉감 0줄 문구 포함)가 우선이고, 이 문구는 1줄일 때만 보인다(한 스타일에 안내 한 번).
export const OUTER_MISSING_NOTICE =
  '이번 인식에서 겉감이 확인되지 않았거나 제외되어 있습니다. 기존 겉감 행은 자동으로 삭제하지 않습니다. 저장 전에 원본 작지를 확인하세요.';

// PR-261 보강: 기존 겉감 계열 행이 2줄 이상이면 어느 행이 같은 원단인지 시스템이 판단할 수 없다(겉감 짝을 만들지 않는다 — PR-257).
// 판단이 모호할 때는 파괴적 동작(삭제)을 기본값으로 두지 않는다.
// PR-261 보강 2: 판정(active)은 **기존 행 수만** 본다 — 새 인식의 겉감 줄 수(0 포함)와 무관하다. 저장 화면의 "제외" 체크는 비교 요청의
// 새 행만 빼고, 비교 응답에는 기존 행이 항상 전부 들어오므로(same/similar/existingOnly) 화면 조작으로 보호가 풀리지 않는다.
export interface OuterDuplicateInfo {
  active: boolean;
  existingOuterCount: number;
  incomingOuterCount: number;
}

export function detectOuterDuplicate(rows: SalesOrderBomCompareRow[]): OuterDuplicateInfo {
  const existingIds = new Set<number>();
  const incomingIndexes = new Set<number>();
  for (const row of rows) {
    if (row.existing && isOuterFabricCategory(row.existing.category)) existingIds.add(row.existing.bomItemId);
    if (row.incoming && row.incomingIndex != null && isOuterFabricCategory(row.incoming.category)) incomingIndexes.add(row.incomingIndex);
  }
  return {
    active: existingIds.size >= 2,
    existingOuterCount: existingIds.size,
    incomingOuterCount: incomingIndexes.size,
  };
}

// 지금 선택대로 저장하면 겉감 계열 행이 어떻게 되는지 — 새로 추가되는 겉감 행 수와 저장 후 겉감 계열 줄 수.
export function countOuterAfterSave(
  draftRows: SalesOrderBomCompareDraftRow[],
  decisions: SalesOrderBomCompareDecisionMap,
): { added: number; total: number } {
  let added = 0;
  let deleted = 0;
  for (const { key, row } of draftRows) {
    if ((row.type === 'similar' || row.type === 'new') && isOuterFabricCategory(row.incoming?.category)) {
      if ((decisions.incoming.get(key) ?? defaultIncomingDecisionFor(row)) === 'add') added++;
    }
    if (row.type === 'existingOnly' && isOuterFabricCategory(row.existing?.category)) {
      if ((decisions.existing.get(key) ?? defaultExistingDecisionFor(row)) === 'delete') deleted++;
    }
  }
  return { added, total: detectOuterDuplicate(draftRows.map((d) => d.row)).existingOuterCount - deleted + added };
}

export const formatOuterDuplicateNotice = (info: OuterDuplicateInfo): string => {
  const head = `겉감 계열 행이 2줄 이상입니다(구분 소재·겉감 등, 기존 ${info.existingOuterCount}줄).`;
  return info.incomingOuterCount === 0
    ? `${head} 이번 인식에서 겉감이 확인되지 않았거나 제외되어 있습니다. 자동으로 삭제하지 않습니다. 저장 전에 원본 작지를 확인하세요.`
    : `${head} 같은 원단이 중복되었을 수 있어 자동으로 삭제하지 않습니다. 새 겉감 행과 어느 행이 같은지 직접 확인하세요.`;
};

export const formatOuterDuplicateAddNotice = (after: { added: number; total: number }): string =>
  `이대로 저장하면 새 겉감 행 ${after.added}개가 추가되어 겉감 계열이 ${after.total}줄이 됩니다. 원하지 않으면 '취소(저장 안 함)'를 누르세요.`;

// 겉감 중복 상태에서 새 겉감 행이 추가되면 저장 확인창을 반드시 띄운다(기존 확인 문구가 있으면 앞에 덧붙인다).
export function withOuterDuplicateConfirm(
  baseMessage: string | null,
  info: OuterDuplicateInfo,
  after: { added: number; total: number },
): string | null {
  if (!info.active || after.added === 0) return baseMessage;
  const line = `겉감 계열 행이 이미 ${info.existingOuterCount}줄입니다. 새 겉감 행 ${after.added}개를 추가하면 겉감 계열이 ${after.total}줄이 됩니다.`;
  return baseMessage ? `${line}\n${baseMessage}` : `${line} 계속할까요?`;
}

// "새 인식 우선" 기본값. existingOnly는 canDelete가 아니면 삭제를 고를 수조차 없으므로
// 기본값도 반드시 'keep'이어야 한다(안전장치 — 기본값이 비활성 선택이면 화면이 깨짐).
export function defaultIncomingDecisionFor(row: SalesOrderBomCompareRow): IncomingDecision {
  if (row.type === 'same') return 'update';
  // PR-257: 겉감 짝(제안)만 예외 — 새 행을 추가하면 겉감이 두 줄이 되므로 기본은 "기존 겉감 행에 합치기"(사람이 "새 자재로 추가"로 바꿀 수 있다).
  if (row.type === 'similar' && row.outerFabricPair === true) return 'mergeInto';
  return 'add'; // 그 밖의 similar/new 는 기본 "새 자재로 추가"(합치기는 사람이 선택).
}

export function defaultExistingDecisionFor(row: ReviewRow): ExistingDecision {
  if (row.keepByDefault === true) return 'keep'; // PR-261 보강·PR-263: 겉감 중복이 의심되거나 새 겉감이 없을 때의 기존 겉감 행은 기본 유지(사용자가 직접 삭제로 바꿀 수는 있다)
  if (row.type === 'existingOnly' && row.existing?.canDelete) return 'delete';
  return 'keep';
}

export interface SalesOrderBomCompareDecisionMap {
  incoming: Map<string, IncomingDecision>;
  existing: Map<string, ExistingDecision>;
}

export function buildDefaultDecisions(draftRows: SalesOrderBomCompareDraftRow[]): SalesOrderBomCompareDecisionMap {
  const incoming = new Map<string, IncomingDecision>();
  const existing = new Map<string, ExistingDecision>();
  for (const { key, row } of draftRows) {
    if (row.type === 'same' || row.type === 'similar' || row.type === 'new') {
      incoming.set(key, defaultIncomingDecisionFor(row));
    }
    if (row.type === 'existingOnly') {
      existing.set(key, defaultExistingDecisionFor(row));
    }
  }
  return { incoming, existing };
}

export interface SalesOrderBomCompareSummary {
  update: number;
  mergeInto: number;
  add: number;
  delete: number;
  keep: number;
}

export function summarizeDecisions(
  draftRows: SalesOrderBomCompareDraftRow[],
  decisions: SalesOrderBomCompareDecisionMap,
): SalesOrderBomCompareSummary {
  const summary: SalesOrderBomCompareSummary = { update: 0, mergeInto: 0, add: 0, delete: 0, keep: 0 };
  for (const { key, row } of draftRows) {
    if (row.type === 'same' || row.type === 'similar' || row.type === 'new') {
      const d = decisions.incoming.get(key) ?? defaultIncomingDecisionFor(row);
      summary[d]++;
    }
    if (row.type === 'existingOnly') {
      const d = decisions.existing.get(key) ?? defaultExistingDecisionFor(row);
      summary[d]++;
    }
  }
  return summary;
}

// 삭제가 선택된 기존 행 중 "위험"(수동 필요수량·확정 단가·종류 지정 중 하나라도
// 있음) 행 — 화면이 경고 배지+확인 체크를 요구해야 하는 대상.
export function riskyDeleteRows(
  draftRows: SalesOrderBomCompareDraftRow[],
  decisions: SalesOrderBomCompareDecisionMap,
): SalesOrderBomCompareDraftRow[] {
  return draftRows.filter(({ key, row }) => {
    if (row.type !== 'existingOnly' || !row.existing) return false;
    const d = decisions.existing.get(key) ?? defaultExistingDecisionFor(row);
    if (d !== 'delete') return false;
    return row.existing.hasManualOverride || row.existing.hasConfirmedUnitPrice || row.existing.hasSubtypeAssignment;
  });
}

// PR-246: 혼용률 선택 — 행 key별 'overwrite'(기존 값이 있고 달라서 "새 값으로 바꾸기"를 누름) 또는
// 'skip'(기존 값이 비어 있어 채우는 기본 동작을 해제). 없으면 기본(비어 있으면 채움 / 다르면 유지).
export type CompositionChoice = 'overwrite' | 'skip';
export type CompositionChoiceMap = Map<string, CompositionChoice>;

// 혼용률 비교가 의미 있는 행: 기존 행과 들어온 행이 실제로 합쳐지는 경우 — same(자동 갱신) 또는
// mergeInto로 합치기를 고른 similar. similar를 "새 자재로 추가"로 두면 기존 행을 건드리지 않는다.
export function compositionTargetsExisting(
  row: SalesOrderBomCompareRow,
  incomingDecision: IncomingDecision | undefined,
): boolean {
  if (!row.existing || !row.incoming || !row.compositionStatus) return false;
  if (row.type === 'same') return true;
  return row.type === 'similar' && (incomingDecision ?? defaultIncomingDecisionFor(row)) === 'mergeInto';
}

// 눌렀다 다시 누르면 해제(되돌리기). 이 행에 맞지 않는 선택은 걸지 않는다.
export function toggleCompositionChoice(
  choices: CompositionChoiceMap,
  key: string,
  choice: CompositionChoice,
): CompositionChoiceMap {
  const next = new Map(choices);
  if (next.get(key) === choice) next.delete(key);
  else next.set(key, choice);
  return next;
}

// 실제로 서버에 "교체"로 전달될 행 수(확인창 문구용) — differs 상태이고 overwrite를 고른 행만.
export function countCompositionOverwrites(
  draftRows: SalesOrderBomCompareDraftRow[],
  decisions: SalesOrderBomCompareDecisionMap,
  choices: CompositionChoiceMap,
): number {
  return draftRows.filter(
    ({ key, row }) =>
      choices.get(key) === 'overwrite' &&
      row.compositionStatus === 'differs' &&
      compositionTargetsExisting(row, decisions.incoming.get(key)),
  ).length;
}

// decisions map → 서버가 받는 페이로드 형태. "update"/"keep"은 commit()의 기본
// 동작과 완전히 같으므로(무동작) 보내지 않는다 — mergeInto/add/delete만 보낸다.
export function buildCommitDecisionsPayload(
  draftRows: SalesOrderBomCompareDraftRow[],
  decisions: SalesOrderBomCompareDecisionMap,
  compositionChoices: CompositionChoiceMap = new Map(),
): SalesOrderBomCompareDecisions | undefined {
  const incoming: SalesOrderBomCompareDecisions['incoming'] = [];
  const existing: SalesOrderBomCompareDecisions['existing'] = [];

  for (const { key, row } of draftRows) {
    if ((row.type === 'same' || row.type === 'similar' || row.type === 'new') && row.incomingIndex != null) {
      const d = decisions.incoming.get(key) ?? defaultIncomingDecisionFor(row);
      // PR-246: 혼용률 선택 플래그 — 기존 행과 실제로 합쳐지는 행에서, 상태에 맞는 선택만 보낸다
      // (differs일 때만 overwrite, fillEmpty일 때만 skip). 그 외에는 보내지 않아 서버 기본 규칙을 따른다.
      const choice = compositionChoices.get(key);
      const compositionFlags: { overwriteComposition?: boolean; skipComposition?: boolean } = {};
      if (compositionTargetsExisting(row, d)) {
        if (choice === 'overwrite' && row.compositionStatus === 'differs') compositionFlags.overwriteComposition = true;
        if (choice === 'skip' && row.compositionStatus === 'fillEmpty') compositionFlags.skipComposition = true;
      }
      const hasFlags = Object.keys(compositionFlags).length > 0;
      if (d === 'mergeInto' && row.existing) {
        incoming!.push({ index: row.incomingIndex, action: 'mergeInto', mergeIntoBomItemId: row.existing.bomItemId, ...compositionFlags });
      } else if (d === 'update' && hasFlags) {
        incoming!.push({ index: row.incomingIndex, action: 'update', ...compositionFlags });
      }
      // 그 외 'update'/'add'는 commit()의 기본 매칭이 이미 그렇게 하므로 보내지 않는다.
    }
    if (row.type === 'existingOnly' && row.existing) {
      const d = decisions.existing.get(key) ?? defaultExistingDecisionFor(row);
      if (d === 'delete') {
        existing!.push({ bomItemId: row.existing.bomItemId, action: 'delete' });
      }
    }
  }

  if (incoming!.length === 0 && existing!.length === 0) return undefined;
  const payload: SalesOrderBomCompareDecisions = {};
  if (incoming!.length > 0) payload.incoming = incoming;
  if (existing!.length > 0) payload.existing = existing;
  return payload;
}
