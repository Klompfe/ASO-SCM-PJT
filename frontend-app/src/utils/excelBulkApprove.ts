import type { ApprovalFailureReason } from './uploadReviewStatus';

// PR-251: 엑셀 업로드 목록 "일괄 승인" 보강(순수 로직) — 불확실하면 승인하지 않는다(fail-closed, PR-250 원칙).
// ① 같은 배치의 같은 스타일 번호는 어느 시트가 맞는지 판단할 수 없어 모두 일괄에서 제외(개별로 하나를 골라 승인)
// ② 승인 직전에 등록 여부를 다시 확인하고, 이미 등록됐으면 승인하지 않는다
// ③ 확인이 실패하거나 응답이 예상한 형태가 아니면 승인하지 않는다(등록됨/미등록으로 단정하지 않음)

export type ExistsCheck = 'registered' | 'unregistered' | 'unknown';

// 등록 확인 API 응답({ exists: boolean })을 엄격하게 해석 — 그 밖의 모양은 모두 unknown.
export function parseExistsResponse(res: unknown): ExistsCheck {
  if (typeof res !== 'object' || res === null) return 'unknown';
  const exists = (res as { exists?: unknown }).exists;
  if (exists === true) return 'registered';
  if (exists === false) return 'unregistered';
  return 'unknown';
}

// 스타일 번호 비교 키 — 기존 스타일번호 비교(styleNoSimilarity.ts)와 같은 방식(앞뒤 공백 제거 + 대문자). 새 규칙을 만들지 않는다.
export const normalizeStyleKey = (styleNo: string): string => styleNo.trim().toUpperCase();

interface StyleLike {
  sheetName: string;
  styleNo?: string | null;
  parseError?: string | null;
}

const isEligible = <T extends StyleLike>(s: T): s is T & { styleNo: string } => !!s.styleNo && s.styleNo.trim() !== '' && !s.parseError;

// 일괄 승인 대상 후보(번호 있음 + 파싱 성공) 중 같은 정규화 번호가 둘 이상인 키 — 같은 파일 안·다른 파일 사이 모두 포함.
export function findDuplicateStyleKeys(styles: StyleLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of styles) {
    if (!isEligible(s)) continue;
    const key = normalizeStyleKey(s.styleNo);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map([...counts.entries()].filter(([, n]) => n > 1));
}

export interface BulkSplit<T> {
  approve: (T & { styleNo: string })[]; // 승인 시도 대상(승인 직전에 한 번 더 확인한다)
  registered: (T & { styleNo: string })[]; // 이미 등록됨(알고 있는 상태) — 승인하지 않음
  duplicates: { style: T & { styleNo: string }; count: number }[]; // 같은 배치 중복 — 모두 제외
  ineligible: T[]; // 번호 없음·파싱 실패 — 일괄 승인 대상 아님
}

// 네트워크 없이 현재 알고 있는 정보로 분류(요약·확인창용). 중복은 등록 여부보다 먼저 본다.
export function splitBulkTargets<T extends StyleLike>(styles: T[], existsMap: Record<string, boolean>): BulkSplit<T> {
  const dups = findDuplicateStyleKeys(styles);
  const out: BulkSplit<T> = { approve: [], registered: [], duplicates: [], ineligible: [] };
  for (const s of styles) {
    if (!isEligible(s)) {
      out.ineligible.push(s);
      continue;
    }
    const dupCount = dups.get(normalizeStyleKey(s.styleNo));
    if (dupCount) out.duplicates.push({ style: s, count: dupCount });
    else if (existsMap[s.styleNo] === true) out.registered.push(s);
    else out.approve.push(s);
  }
  return out;
}

// "실패한 스타일만 다시 일괄 승인" — 실패 기록이 있는 스타일만 같은 규칙으로 분류한다.
export function splitFailedOnlyTargets<T extends StyleLike>(
  styles: T[],
  existsMap: Record<string, boolean>,
  failuresBySheet: Record<string, unknown>,
): BulkSplit<T> {
  const all = splitBulkTargets(styles, existsMap); // 중복 판정은 배치 전체 기준
  const failed = (s: StyleLike) => !!failuresBySheet[s.sheetName];
  return {
    approve: all.approve.filter(failed),
    registered: all.registered.filter(failed),
    duplicates: all.duplicates.filter((d) => failed(d.style)),
    ineligible: all.ineligible.filter(failed),
  };
}

export const UNVERIFIED_REASON: ApprovalFailureReason = {
  kind: 'network',
  message: '등록 여부를 확인하지 못해 승인하지 않았습니다 — 다시 시도하세요',
};

export const duplicateReason = (count: number): ApprovalFailureReason => ({
  kind: 'validation',
  message: `같은 스타일 번호의 시트가 ${count}건 있어 일괄 승인에서 제외했습니다 — 하나를 선택해 개별 승인하세요`,
});

export type GuardedOutcome<R> =
  | { kind: 'approved'; result: R }
  | { kind: 'registered' } // 승인 직전 확인에서 이미 등록됨
  | { kind: 'unverified' } // 확인 실패·비정상 응답 — 승인하지 않음
  | { kind: 'failed'; error: unknown }; // 승인 호출 자체의 실패

// 승인 직전에 등록 여부를 다시 확인하고, "미등록"이 확인됐을 때만 승인(commit)을 호출한다.
// 확인 호출이 던지거나 응답이 이상하면 commit 을 호출하지 않는다.
export async function approveGuarded<R>(
  styleNo: string,
  checkExists: (styleNo: string) => Promise<unknown>,
  commit: () => Promise<R>,
): Promise<GuardedOutcome<R>> {
  let check: ExistsCheck;
  try {
    check = parseExistsResponse(await checkExists(styleNo));
  } catch {
    check = 'unknown';
  }
  if (check === 'registered') return { kind: 'registered' };
  if (check !== 'unregistered') return { kind: 'unverified' };
  try {
    return { kind: 'approved', result: await commit() };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

export interface GuardedBatchEntry<T, R> {
  style: T;
  outcome: GuardedOutcome<R>;
}

// 순차 실행(자재 신규 생성 경합 방지) — 각 스타일은 자기 승인 직전에 확인한다. 한 스타일의 확인 실패·승인 실패가 다른 스타일을 막지 않는다.
export async function runGuardedBatch<T extends { styleNo: string }, R>(
  targets: T[],
  checkExists: (styleNo: string) => Promise<unknown>,
  commit: (style: T) => Promise<R>,
  onProgress?: (done: number) => void,
): Promise<GuardedBatchEntry<T, R>[]> {
  const entries: GuardedBatchEntry<T, R>[] = [];
  for (const style of targets) {
    entries.push({ style, outcome: await approveGuarded(style.styleNo, checkExists, () => commit(style)) });
    onProgress?.(entries.length);
  }
  return entries;
}

export interface GuardedBatchCounts {
  approved: number;
  registered: number;
  unverified: number;
  failed: number;
}

export function countGuardedOutcomes<T, R>(entries: GuardedBatchEntry<T, R>[]): GuardedBatchCounts {
  const c: GuardedBatchCounts = { approved: 0, registered: 0, unverified: 0, failed: 0 };
  for (const e of entries) {
    if (e.outcome.kind === 'approved') c.approved++;
    else c[e.outcome.kind]++;
  }
  return c;
}

// 일괄 승인 직전 확인창/요약 — "승인 대상 N건 / 이미 등록됨 M건 / 확인 필요(중복) K건".
export function formatBulkApproveSummary(split: Pick<BulkSplit<unknown>, 'approve' | 'registered' | 'duplicates' | 'ineligible'>): string {
  const parts = [`승인 대상 ${split.approve.length}건`, `이미 등록됨 ${split.registered.length}건`, `확인 필요(같은 스타일 중복) ${split.duplicates.length}건`];
  if (split.ineligible.length > 0) parts.push(`제외(파싱 실패·번호 없음) ${split.ineligible.length}건`);
  return parts.join(' / ');
}

// 승인 후 안내 — 승인 직전 확인에서 제외된 건수까지(아무것도 조용히 사라지지 않게).
export function formatGuardedResultNote(c: GuardedBatchCounts): string | null {
  const notes: string[] = [];
  if (c.registered > 0) notes.push(`승인 직전 확인에서 이미 등록된 ${c.registered}건은 승인하지 않았습니다`);
  if (c.unverified > 0) notes.push(`등록 여부를 확인하지 못한 ${c.unverified}건은 승인하지 않았습니다(목록에서 다시 승인할 수 있습니다)`);
  return notes.length > 0 ? notes.join(' / ') : null;
}

// 상태 반영용 패치 — 이미 등록됨은 existsMap 갱신 + 실패 기록 제거(목록에는 남음, "이미 등록됨" 표시), 확인 실패는 실패 기록.
export function buildGuardedStatePatches<T extends { sheetName: string; styleNo: string }, R>(
  entries: GuardedBatchEntry<T, R>[],
): {
  existsPatch: Record<string, boolean>;
  clearFailureSheets: string[];
  unverifiedSheets: string[];
} {
  const existsPatch: Record<string, boolean> = {};
  const clearFailureSheets: string[] = [];
  const unverifiedSheets: string[] = [];
  for (const e of entries) {
    if (e.outcome.kind === 'registered') {
      existsPatch[e.style.styleNo] = true;
      clearFailureSheets.push(e.style.sheetName);
    } else if (e.outcome.kind === 'unverified') {
      unverifiedSheets.push(e.style.sheetName);
    }
  }
  return { existsPatch, clearFailureSheets, unverifiedSheets };
}
