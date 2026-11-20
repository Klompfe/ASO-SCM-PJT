import type { SalesOrderBomCompareResponse, SalesOrderBomCompareRow } from '../api/salesOrders.service';
import { orderOverviewLabel } from './orderOverviewReview';

// PR-250: 작지 업로드 모달 "일괄 저장" 사전 점검 — 스타일마다 읽기 전용 compare 결과로 분류한다(순수 로직).
// 분류: 신규(바로 저장 가능) / 변경 없음(저장 안 함) / 변경 있음(개별 비교 화면에서 확인해야 저장) / 확인 필요(제외).
// 일괄 저장 대상은 "신규"뿐이다 — 변경 있음·변경 없음·확인 필요는 절대 포함되지 않는다(selectNewTargets).
export type PrecheckKind = 'new' | 'unchanged' | 'changed' | 'needsCheck';

export interface PrecheckCounts {
  newRows: number; // 신규 자재 행(기존 BOM 에 없는 조합)
  changedRows: number; // 값이 다른 기존 행(요척·작지 수량·혼용률) + 비슷한 이름 후보
  removeCandidates: number; // 새 인식에 없는 기존 행(삭제 후보)
  overviewItems: number; // 오더개요 항목 중 새 값으로 채워지거나(fillEmpty) 다른 값(differs)
  // PR-250 보강: 응답에 예상하지 못한 값(미지의 행 유형·상태 값, 누락)이 있으면 "변경"으로 센다(fail-closed).
  unknownItems?: number;
}

export interface PrecheckInput {
  index: number;
  styleNo: string | null;
  // 저장 전 이미 걸리는 조건(번호 없음·끝 글자 숫자·원본 대조 안 함·자재명 빈 행 등) — 있으면 점검 호출 없이 확인 필요.
  blockedReason?: string | null;
  // 읽기 전용 compare 응답. 호출 실패면 null + compareFailed.
  compare?: SalesOrderBomCompareResponse | null;
  compareFailed?: boolean;
}

export interface PrecheckEntry {
  index: number;
  styleNo: string | null;
  kind: PrecheckKind;
  // 확인 필요 사유(다른 분류에서는 undefined).
  reason?: string;
  counts: PrecheckCounts;
  summary: string;
}

const EMPTY_COUNTS: PrecheckCounts = { newRows: 0, changedRows: 0, removeCandidates: 0, overviewItems: 0, unknownItems: 0 };
const EPS = 1e-9;

const numDiffers = (a: number | null | undefined, b: number | null | undefined): boolean =>
  a != null && b != null && Math.abs(Number(a) - Number(b)) > EPS;

// 알려진 상태 값. 이 밖의 값(미지의 문자열·비문자열·누락)은 "모르는 값"이라 변경으로 센다(fail-closed) —
// 모르는 것을 "변경 없음(저장 안 함)"이나 "신규"로 분류해 변경을 놓치지 않기 위해서다.
const NO_CHANGE_STATUSES = new Set(['same', 'incomingEmpty']);
const CHANGE_STATUSES = new Set(['fillEmpty', 'differs']);

type Judgement = 'change' | 'noChange' | 'unknown';
function judgeStatus(status: unknown): Judgement {
  if (typeof status === 'string' && CHANGE_STATUSES.has(status)) return 'change';
  if (typeof status === 'string' && NO_CHANGE_STATUSES.has(status)) return 'noChange';
  return 'unknown';
}

// 같은 키(same) 행에서 저장하면 실제로 바뀌는 것이 있는지 — 요척 차이, 작지 수량(sheetQty) 차이, 혼용률 상태.
// 기존/들어온 행이 빠져 있거나 혼용률 상태가 알 수 없는 값(누락 포함)이면 판단할 수 없어 "unknown"(변경으로 센다).
function judgeSameRow(row: SalesOrderBomCompareRow): Judgement {
  if (!row.existing || !row.incoming) return 'unknown';
  if (numDiffers(row.existing.consumption, row.incoming.consumption)) return 'change';
  const incomingQty = row.incoming.requiredQty;
  if (incomingQty != null && Number(incomingQty) > 0 && numDiffers(row.existing.sheetQty ?? 0, incomingQty)) return 'change';
  return judgeStatus(row.compositionStatus);
}

export function countPrecheckChanges(compare: SalesOrderBomCompareResponse): PrecheckCounts {
  const counts: PrecheckCounts = { ...EMPTY_COUNTS };
  for (const row of Array.isArray(compare.rows) ? compare.rows : []) {
    const type: unknown = row?.type;
    if (type === 'new') counts.newRows++;
    else if (type === 'existingOnly') counts.removeCandidates++;
    else if (type === 'similar') counts.changedRows++;
    else if (type === 'same') {
      const j = judgeSameRow(row);
      if (j === 'change') counts.changedRows++;
      else if (j === 'unknown') counts.unknownItems = (counts.unknownItems ?? 0) + 1;
    } else {
      counts.unknownItems = (counts.unknownItems ?? 0) + 1; // 미지의 행 유형·누락
    }
  }
  for (const r of Array.isArray(compare.overview) ? compare.overview : []) {
    const j = judgeStatus(r?.status);
    if (j === 'change') counts.overviewItems++;
    else if (j === 'unknown') counts.unknownItems = (counts.unknownItems ?? 0) + 1;
  }
  return counts;
}

// 응답이 해석 가능한 구조인지(객체, rows 배열, overview 는 없거나 배열, hasExistingBom 불리언).
export function isWellFormedCompare(compare: unknown): compare is SalesOrderBomCompareResponse {
  if (typeof compare !== 'object' || compare === null) return false;
  const c = compare as { rows?: unknown; overview?: unknown; hasExistingBom?: unknown };
  return Array.isArray(c.rows) && typeof c.hasExistingBom === 'boolean' && (c.overview === undefined || Array.isArray(c.overview));
}

// "신규 자재 2행, 요척·수량·혼용률 변경 1행, 삭제 후보 1행, 오더개요 2항목 상이" 같은 한 줄 요약.
export function formatPrecheckSummary(counts: PrecheckCounts): string {
  const parts: string[] = [];
  if (counts.newRows > 0) parts.push(`신규 자재 ${counts.newRows}행`);
  if (counts.changedRows > 0) parts.push(`값 변경 ${counts.changedRows}행`);
  if (counts.removeCandidates > 0) parts.push(`삭제 후보 ${counts.removeCandidates}행`);
  if (counts.overviewItems > 0) parts.push(`오더개요 ${counts.overviewItems}항목 상이/채움`);
  if ((counts.unknownItems ?? 0) > 0) parts.push(`해석할 수 없는 값 ${counts.unknownItems}건(변경으로 처리)`);
  return parts.join(', ');
}

export function findDuplicateStyleNos(inputs: { styleNo: string | null }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const i of inputs) {
    if (!i.styleNo) continue;
    seen.set(i.styleNo, (seen.get(i.styleNo) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s));
}

export function classifyBulkPrecheck(inputs: PrecheckInput[]): PrecheckEntry[] {
  const duplicates = findDuplicateStyleNos(inputs);
  return inputs.map((input) => {
    const base = { index: input.index, styleNo: input.styleNo };
    const needsCheck = (reason: string): PrecheckEntry => ({ ...base, kind: 'needsCheck', reason, counts: { ...EMPTY_COUNTS }, summary: reason });
    if (input.blockedReason) return needsCheck(input.blockedReason);
    if (!input.styleNo) return needsCheck('스타일번호를 읽지 못했습니다');
    if (duplicates.has(input.styleNo)) return needsCheck('같은 스타일번호가 이 배치에 2건 이상 있습니다 — 어느 것을 저장할지 개별로 확인해 주세요');
    if (input.compareFailed || !input.compare) return needsCheck('점검에 실패했습니다 — 개별 저장으로 확인해 주세요');

    // 응답 구조가 비정상이면 "변경 없음"이 아니라 확인 필요(개별 저장으로 확인).
    if (!isWellFormedCompare(input.compare)) return needsCheck('점검 응답을 해석할 수 없습니다 — 개별 저장으로 확인해 주세요');
    const compare = input.compare;
    // 기존 스타일 판정: 자재 행이 있거나(hasExistingBom) 오더개요 비교 결과가 있으면(서버가 기존 오더개요를 찾음) 기존 스타일.
    const existingStyle = compare.hasExistingBom || (compare.overview?.length ?? 0) > 0;
    // 신규는 "기존 자재 행도 기존 오더개요도 없음"이 명확할 때만(자재 행 목록도 비어 있어야 함) — 아니면 변경 있음으로 떨어진다.
    if (!existingStyle && compare.rows.length === 0) {
      return { ...base, kind: 'new', counts: { ...EMPTY_COUNTS }, summary: '신규 스타일 — 바로 저장할 수 있습니다' };
    }

    const counts = countPrecheckChanges(compare);
    // 기존 BOM·오더개요가 없다는데 자재 행 목록이 비어 있지 않은 것은 앞뒤가 맞지 않는 응답 — 모르는 값으로 보고 변경으로 센다.
    if (!existingStyle) counts.unknownItems = (counts.unknownItems ?? 0) + 1;
    const total = counts.newRows + counts.changedRows + counts.removeCandidates + counts.overviewItems + (counts.unknownItems ?? 0);
    if (total === 0) return { ...base, kind: 'unchanged', counts, summary: '기존과 동일 — 저장하지 않습니다' };
    return { ...base, kind: 'changed', counts, summary: formatPrecheckSummary(counts) };
  });
}

export interface PrecheckSummary {
  new: number;
  changed: number;
  unchanged: number;
  needsCheck: number;
}

export function summarizePrecheck(entries: PrecheckEntry[]): PrecheckSummary {
  const s: PrecheckSummary = { new: 0, changed: 0, unchanged: 0, needsCheck: 0 };
  for (const e of entries) s[e.kind]++;
  return s;
}

export const formatPrecheckHeadline = (s: PrecheckSummary): string =>
  `신규 ${s.new}건 / 변경 있음 ${s.changed}건 / 변경 없음 ${s.unchanged}건 / 확인 필요 ${s.needsCheck}건`;

// 일괄 저장 대상 = 신규뿐. 이미 저장된 스타일은 제외(중복 저장 방지).
export function selectNewTargets(entries: PrecheckEntry[], savedIndexes: ReadonlySet<number> = new Set()): number[] {
  return entries.filter((e) => e.kind === 'new' && !savedIndexes.has(e.index)).map((e) => e.index);
}

export function selectChangedIndexes(entries: PrecheckEntry[], savedIndexes: ReadonlySet<number> = new Set()): number[] {
  return entries.filter((e) => e.kind === 'changed' && !savedIndexes.has(e.index)).map((e) => e.index);
}

// "다음 변경 건 열기" — 표 순서상 현재 이후(없으면 처음부터)의 아직 저장 안 된 변경 건.
export function nextChangedIndex(entries: PrecheckEntry[], savedIndexes: ReadonlySet<number>, afterIndex?: number): number | null {
  const pending = selectChangedIndexes(entries, savedIndexes);
  if (pending.length === 0) return null;
  if (afterIndex == null) return pending[0];
  return pending.find((i) => i > afterIndex) ?? pending[0];
}

// 저장 직전 재확인 — 점검 이후 상태가 바뀌어(다른 곳에서 등록됨 등) 더는 신규가 아니면 저장하지 않는다.
export function isStillNew(fresh: unknown): boolean {
  // 응답이 해석 불가이거나 기존 자재 행·오더개요가 하나라도 있으면(또는 모순된 자재 행이 있으면) 신규가 아니다(fail-closed).
  if (!isWellFormedCompare(fresh)) return false;
  return fresh.hasExistingBom === false && fresh.rows.length === 0 && (fresh.overview?.length ?? 0) === 0;
}

// 동시 호출 수를 제한해 비동기 작업을 돌린다 — 한 항목의 실패가 전체를 막지 않는다(결과에 error 로 담김).
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, position: number) => Promise<R>,
): Promise<({ ok: true; value: R } | { ok: false; error: unknown })[]> {
  const results: ({ ok: true; value: R } | { ok: false; error: unknown })[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (true) {
      const position = next++;
      if (position >= items.length) return;
      try {
        results[position] = { ok: true, value: await worker(items[position], position) };
      } catch (error) {
        results[position] = { ok: false, error };
      }
    }
  });
  await Promise.all(lanes);
  return results;
}

export const KIND_LABEL: Record<PrecheckKind, string> = {
  new: '신규',
  unchanged: '변경 없음',
  changed: '변경 있음',
  needsCheck: '확인 필요',
};

// 오더개요 상세(표 펼침용) — 상태가 바뀔 항목의 이름만(값은 화면에서 비교 화면이 보여 준다).
export function listOverviewChangeLabels(compare: SalesOrderBomCompareResponse | null | undefined): string[] {
  return (compare?.overview ?? []).filter((r) => r.status === 'fillEmpty' || r.status === 'differs').map((r) => orderOverviewLabel(r.field));
}
