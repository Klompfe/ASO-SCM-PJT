import { findDuplicateStyleKeys, normalizeStyleKey } from './excelBulkApprove';

// PR-259: 겉감 행 일괄 보충(화면 편) 순수 로직 — 서버(PR-258) 응답만 신뢰하고, 알 수 없거나 이상한 응답은 모두 "확인 필요"(fail-closed)로 둔다.
// 점검 결과는 메모리에만 두며(sessionStorage 에 넣지 않음) 이 파일은 저장소·네트워크에 접근하지 않는다.

// 서버가 돌려주는 사유 코드(PR-258). 이 목록에 없는 코드는 모두 알 수 없는 응답으로 본다.
export const KNOWN_REASONS = [
  'INVALID_INPUT',
  'NOT_REGISTERED',
  'NO_BOM',
  'ALREADY_HAS_OUTER_FABRIC',
  'NO_OUTER_FABRIC_ROW',
  'MULTIPLE_OUTER_FABRIC_ROWS',
  'EMPTY_NAME',
  'OTHER_CHANGES',
] as const;
export type SupplementReason = (typeof KNOWN_REASONS)[number];

// 점검 결과 상태 5종 + 중복(확인 필요의 한 종류).
export type SupplementStatus = 'eligible' | 'alreadyHas' | 'otherChanges' | 'notPossible' | 'needsCheck';

export interface SupplementCheckState {
  status: SupplementStatus;
  reason?: SupplementReason | 'DUPLICATE' | 'CALL_FAILED' | 'BAD_RESPONSE';
  message?: string;
  // 보충 가능일 때 서버가 알려 준 "추가될 겉감 행"의 입력 행 인덱스(로컬 bomItems 기준).
  outerRowIndex?: number;
}

export const STATUS_LABEL: Record<SupplementStatus, string> = {
  eligible: '보충 가능',
  alreadyHas: '이미 겉감 있음',
  otherChanges: '다른 변경 있음',
  notPossible: '보충 불가',
  needsCheck: '확인 필요',
};

export const STATUS_BADGE_CLASS: Record<SupplementStatus, string> = {
  eligible: 'bg-green-100 text-green-800 border border-green-300',
  alreadyHas: 'bg-gray-100 text-gray-700 border border-gray-300',
  otherChanges: 'bg-orange-100 text-orange-800 border border-orange-300',
  notPossible: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  needsCheck: 'bg-red-100 text-red-700 border border-red-300',
};

export const REASON_TEXT: Record<string, string> = {
  ALREADY_HAS_OUTER_FABRIC: '이미 겉감 행이 있어 보충하지 않습니다.',
  OTHER_CHANGES: '겉감 외에 다른 변경이 있어 일괄 대상이 아닙니다 — 개별 비교로 확인하세요.',
  MULTIPLE_OUTER_FABRIC_ROWS: '이번 파일에 겉감 행이 2개 이상이라 일괄 대상이 아닙니다 — 개별 비교로 확인하세요.',
  NOT_REGISTERED: '등록되지 않은 스타일입니다.',
  NO_BOM: '자재명세가 없거나 비어 있어 보충할 수 없습니다.',
  NO_OUTER_FABRIC_ROW: '이번 파일에 겉감 행이 없습니다.',
  EMPTY_NAME: '겉감 행의 자재명이 비어 있습니다.',
  INVALID_INPUT: '입력을 해석할 수 없어 확인이 필요합니다.',
  DUPLICATE: '같은 스타일 번호가 업로드 목록에 둘 이상이라 어느 시트가 맞는지 판단할 수 없습니다 — 한 시트만 남기고 다시 점검하세요.',
  CALL_FAILED: '점검 호출에 실패했거나 시간이 초과되었습니다 — 다시 점검하세요.',
  BAD_RESPONSE: '서버 응답을 해석할 수 없어 보충 가능으로 보지 않습니다 — 다시 점검하세요.',
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKnownReason = (v: unknown): v is SupplementReason => typeof v === 'string' && (KNOWN_REASONS as readonly string[]).includes(v);
const msg = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

const REASON_TO_STATUS: Record<SupplementReason, SupplementStatus> = {
  ALREADY_HAS_OUTER_FABRIC: 'alreadyHas',
  OTHER_CHANGES: 'otherChanges',
  MULTIPLE_OUTER_FABRIC_ROWS: 'otherChanges',
  NOT_REGISTERED: 'notPossible',
  NO_BOM: 'notPossible',
  NO_OUTER_FABRIC_ROW: 'notPossible',
  EMPTY_NAME: 'notPossible',
  INVALID_INPUT: 'needsCheck',
};

// 사전 점검(check) 응답 → 화면 상태. 형식이 이상하거나 알 수 없는 코드면 "확인 필요".
export function interpretCheckResponse(res: unknown): SupplementCheckState {
  if (!isObject(res)) return { status: 'needsCheck', reason: 'BAD_RESPONSE' };
  const { eligible, applied, reason } = res as { eligible?: unknown; applied?: unknown; reason?: unknown };
  if (typeof eligible !== 'boolean') return { status: 'needsCheck', reason: 'BAD_RESPONSE' };
  if (applied === true) return { status: 'needsCheck', reason: 'BAD_RESPONSE' }; // 읽기 전용 점검이 "적용했다"고 답하면 이상
  const message = msg(res.message);
  if (eligible) {
    const idx = res.outerRowIndex;
    return { status: 'eligible', message, ...(Number.isInteger(idx) && (idx as number) >= 0 ? { outerRowIndex: idx as number } : {}) };
  }
  if (!isKnownReason(reason)) return { status: 'needsCheck', reason: 'BAD_RESPONSE', message };
  return { status: REASON_TO_STATUS[reason], reason, message };
}

export const failedCheck = (): SupplementCheckState => ({ status: 'needsCheck', reason: 'CALL_FAILED' });

// ── 실행 결과 ──────────────────────────────────────────────────────────
export type RunKind = 'added' | 'alreadyHas' | 'ineligible' | 'failed' | 'serverError' | 'notRun';

export interface RunResult {
  kind: RunKind;
  reason?: string;
  message?: string;
  at?: string; // 오류 기록용 시각(ISO)
}

// 실행 응답 → 결과. **applied:true 이고 eligible:true 로 명확히 답한 것만 성공**(added)이다.
export function interpretRunResponse(res: unknown): RunResult {
  if (!isObject(res)) return { kind: 'failed', reason: 'BAD_RESPONSE' };
  const { eligible, applied, reason } = res as { eligible?: unknown; applied?: unknown; reason?: unknown };
  if (applied === true && eligible === true) return { kind: 'added', message: msg(res.message) };
  if (applied !== false || typeof eligible !== 'boolean') return { kind: 'failed', reason: 'BAD_RESPONSE', message: msg(res.message) };
  if (reason === 'ALREADY_HAS_OUTER_FABRIC') return { kind: 'alreadyHas', reason, message: msg(res.message) };
  if (isKnownReason(reason) && reason !== 'INVALID_INPUT') return { kind: 'ineligible', reason, message: msg(res.message) };
  return { kind: 'failed', reason: isKnownReason(reason) ? reason : 'BAD_RESPONSE', message: msg(res.message) };
}

// 실행 결과가 "이 스타일은 더 이상 보충 대상이 아님"을 알려 주면(이미 겉감 있음·부적격) 행 상태를 그에 맞게 바꾼다 — 그 행은 선택할 수 없게 된다.
export function checkStateFromRunResult(r: RunResult): SupplementCheckState | null {
  if (r.kind === 'alreadyHas') return { status: 'alreadyHas', reason: 'ALREADY_HAS_OUTER_FABRIC', message: r.message };
  if (r.kind === 'ineligible' && isKnownReason(r.reason)) return { status: REASON_TO_STATUS[r.reason], reason: r.reason, message: r.message };
  return null;
}

// 호출 예외 → 결과. HTTP 5xx 는 서버 오류(연속 2회면 일괄 중단), 그 밖(시간 초과·네트워크·4xx)은 실패.
export function interpretRunError(error: unknown, now: () => Date = () => new Date()): RunResult {
  const status = isObject(error) && isObject(error.response) ? (error.response as { status?: unknown }).status : undefined;
  const at = now().toISOString();
  if (typeof status === 'number' && status >= 500) return { kind: 'serverError', reason: `HTTP_${status}`, at };
  if (isObject(error) && error.code === 'ECONNABORTED') return { kind: 'failed', reason: 'TIMEOUT', at };
  return { kind: 'failed', reason: typeof status === 'number' ? `HTTP_${status}` : 'NETWORK', at };
}

// ── 대상 구성 ──────────────────────────────────────────────────────────
interface UploadedStyle {
  sheetName: string;
  styleNo?: string;
  parseError?: string;
  bomItems?: { category?: string; itemName?: string; consumption?: number }[];
}

export interface SupplementRow<T extends UploadedStyle = UploadedStyle> {
  key: string; // 정규화한 스타일 번호
  styleNo: string;
  style: T;
  check?: SupplementCheckState; // 아직 점검 전이면 없음
}

// 이미 등록된(existsMap===true) 스타일만 대상. 같은 정규화 번호가 둘 이상이면 모두 "확인 필요(중복)"로 두고 점검하지 않는다(어느 시트가 맞는지 판단하지 않음).
export function buildSupplementRows<T extends UploadedStyle>(styles: T[], existsMap: Record<string, boolean>): { checkable: SupplementRow<T>[]; duplicates: SupplementRow<T>[] } {
  const dups = findDuplicateStyleKeys(styles);
  const checkable: SupplementRow<T>[] = [];
  const duplicates: SupplementRow<T>[] = [];
  for (const s of styles) {
    if (!s.styleNo || s.styleNo.trim() === '' || s.parseError) continue;
    if (existsMap[s.styleNo] !== true) continue;
    const key = normalizeStyleKey(s.styleNo);
    const row: SupplementRow<T> = { key, styleNo: s.styleNo, style: s };
    if (dups.has(key)) duplicates.push({ ...row, check: { status: 'needsCheck', reason: 'DUPLICATE' } });
    else checkable.push(row);
  }
  return { checkable, duplicates };
}

// 추가될 겉감 행 미리보기 — 서버가 알려 준 인덱스로 로컬 입력 행을 읽는다. 범위 밖이거나 값이 없으면 null(미리보기 없음).
export function previewOuterRow(style: UploadedStyle, outerRowIndex: number | undefined): { category: string; itemName: string; consumption: string } | null {
  if (outerRowIndex == null || !Number.isInteger(outerRowIndex) || outerRowIndex < 0) return null;
  const row = style.bomItems?.[outerRowIndex];
  if (!row || typeof row.itemName !== 'string') return null;
  return {
    category: typeof row.category === 'string' ? row.category.replace(/\s+/g, ' ').trim() : '',
    itemName: row.itemName.replace(/\s+/g, ' ').trim(),
    consumption: typeof row.consumption === 'number' && Number.isFinite(row.consumption) ? String(row.consumption) : '-',
  };
}

// ── 선택 규칙 ──────────────────────────────────────────────────────────
export const isSelectable = (row: Pick<SupplementRow, 'check'>, doneKeys: ReadonlySet<string>, key: string): boolean =>
  row.check?.status === 'eligible' && !doneKeys.has(key);

export function selectAllEligible(rows: SupplementRow[], doneKeys: ReadonlySet<string>): Set<string> {
  return new Set(rows.filter((r) => isSelectable(r, doneKeys, r.key)).map((r) => r.key));
}

// 선택 가능한 행만 토글(보충 가능이 아니거나 이미 보충된 행은 선택되지 않는다).
export function toggleSelection(selected: ReadonlySet<string>, rows: SupplementRow[], doneKeys: ReadonlySet<string>, key: string): Set<string> {
  const row = rows.find((r) => r.key === key);
  const next = new Set(selected);
  if (!row || !isSelectable(row, doneKeys, key)) {
    next.delete(key);
    return next;
  }
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// 실행 대상 = 선택된 것 중 지금도 선택 가능한 것(성공한 스타일 재전송 방지).
export function runnableTargets<T extends UploadedStyle>(rows: SupplementRow<T>[], selected: ReadonlySet<string>, doneKeys: ReadonlySet<string>): SupplementRow<T>[] {
  return rows.filter((r) => selected.has(r.key) && isSelectable(r, doneKeys, r.key));
}

// ── 실행 큐 ───────────────────────────────────────────────────────────
export const MAX_CONSECUTIVE_SERVER_ERRORS = 2;

export interface QueueOutcome<T> {
  row: SupplementRow<T & UploadedStyle>;
  result: RunResult;
}

// 순차 실행. 한 건의 실패가 다음 건을 막지 않지만, 서버 오류(5xx)가 연속 2회면 남은 스타일은 실행하지 않고 'notRun' 으로 표시한다.
export async function runSupplementQueue<T extends UploadedStyle>(
  rows: SupplementRow<T>[],
  runOne: (row: SupplementRow<T>) => Promise<unknown>,
  onProgress?: (done: number, total: number, outcome: QueueOutcome<T>) => void,
  now: () => Date = () => new Date(),
): Promise<{ outcomes: QueueOutcome<T>[]; aborted: boolean }> {
  const outcomes: QueueOutcome<T>[] = [];
  let consecutive = 0;
  let aborted = false;
  for (const row of rows) {
    let result: RunResult;
    if (aborted) {
      result = { kind: 'notRun', reason: 'SERVER_ERRORS', message: '서버 오류가 연속으로 발생해 실행하지 않았습니다.' };
    } else {
      try {
        result = interpretRunResponse(await runOne(row));
      } catch (error) {
        result = interpretRunError(error, now);
      }
      consecutive = result.kind === 'serverError' ? consecutive + 1 : 0;
      if (consecutive >= MAX_CONSECUTIVE_SERVER_ERRORS) aborted = true;
    }
    const outcome = { row, result } as QueueOutcome<T>;
    outcomes.push(outcome);
    onProgress?.(outcomes.length, rows.length, outcome);
  }
  return { outcomes, aborted };
}

// ── 요약·문구 ─────────────────────────────────────────────────────────
export interface RunSummary {
  added: number;
  alreadyHas: number;
  notEligible: number; // 다른 변경 있음/보충 불가(서버가 실행 시점에 부적격으로 답한 것)
  failed: number; // 실패·서버 오류·시간 초과·중단으로 실행하지 않은 것(확인 필요)
}

export function summarizeRun(results: RunResult[]): RunSummary {
  const s: RunSummary = { added: 0, alreadyHas: 0, notEligible: 0, failed: 0 };
  for (const r of results) {
    if (r.kind === 'added') s.added++;
    else if (r.kind === 'alreadyHas') s.alreadyHas++;
    else if (r.kind === 'ineligible') s.notEligible++;
    else s.failed++;
  }
  return s;
}

export const formatRunSummary = (s: RunSummary): string =>
  `성공 ${s.added} · 이미 겉감 있음 ${s.alreadyHas} · 다른 변경 있음/보충 불가 ${s.notEligible} · 실패(확인 필요) ${s.failed}`;

export function describeRunResult(r: RunResult): string {
  switch (r.kind) {
    case 'added': return '겉감 행 추가됨';
    case 'alreadyHas': return '이미 겉감 행이 있어 추가하지 않았습니다.';
    case 'ineligible': return `서버가 보충하지 않았습니다 — ${(r.reason && REASON_TEXT[r.reason]) || r.message || r.reason || '사유 없음'}`;
    case 'serverError': return `서버 오류 — 관리자에게 알려 주세요(${r.reason ?? ''} · ${r.at ?? ''})`;
    case 'notRun': return r.message ?? '실행하지 않았습니다.';
    default: return `실패 — ${r.reason === 'TIMEOUT' ? '시간이 초과되었습니다' : r.reason === 'NETWORK' ? '서버에 연결하지 못했습니다' : r.reason === 'BAD_RESPONSE' ? '서버 응답을 해석할 수 없습니다' : (r.reason ?? '알 수 없는 오류')}${r.at ? ` (${r.at})` : ''}`;
  }
}

// 확인창 문구(스타일 번호 목록은 화면이 접어서 보여 준다).
export const buildConfirmMessage = (count: number): string =>
  `선택한 ${count}개 스타일에 겉감 행을 1개씩 추가합니다. 스타일 정보·오더개요·선적일·계약·기존 자재 행은 바뀌지 않습니다. 계속할까요?`;

export const INTRO_TEXT =
  '이미 등록된 스타일 중 겉감 행이 없는 스타일에 겉감 행만 추가합니다. 스타일 정보·오더개요·선적일·계약·기존 자재 행은 바뀌지 않습니다. 추가된 겉감 행의 혼용률은 비어 있습니다(이후 입력).';
export const FIRST_TIME_HINT = '처음에는 1개 스타일만 선택해 결과를 확인한 뒤 나머지를 진행하세요.';
export const DONE_HINT = "자재·BOM 조회 > 겉감 점검 탭에서 해당 스타일이 '겉감 혼용률 비어 있음'으로 바뀐 것을 확인하세요.";
export const ABORT_NOTICE = '서버 오류가 연속 2회 발생해 남은 스타일의 실행을 중단했습니다. 서버 상태를 확인한 뒤 "다시 시도"로 진행하세요.';
