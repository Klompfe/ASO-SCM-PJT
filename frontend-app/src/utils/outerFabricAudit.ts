import type { OuterFabricAuditResponse, OuterFabricAuditStatus } from '../api/boms.service';

// PR-256: 겉감 혼용률 점검 목록 화면용 순수 로직(표시 문구·배지). 목록은 읽기 전용이다.

export const AUDIT_STATUS_BADGE: Record<OuterFabricAuditStatus, { label: string; className: string }> = {
  noRow: { label: '겉감 행 없음', className: 'bg-red-100 text-red-700 border border-red-300' },
  blank: { label: '겉감 혼용률 비어 있음', className: 'bg-red-100 text-red-700 border border-red-300' },
  noBom: { label: 'BOM 없음', className: 'bg-red-100 text-red-700 border border-red-300' },
};

// 예: "전체 120개 스타일 중 점검 대상 7개 — 겉감 행 없음 3 · 겉감 혼용률 비어 있음 2 · BOM 없음 2"
export function formatAuditSummary(res: Pick<OuterFabricAuditResponse, 'counts' | 'styleCount'>): string {
  const { counts, styleCount } = res;
  return `전체 ${styleCount}개 스타일 중 점검 대상 ${counts.total}개 — 겉감 행 없음 ${counts.noRow} · 겉감 혼용률 비어 있음 ${counts.blank} · BOM 없음 ${counts.noBom}`;
}

export const AUDIT_EMPTY_MESSAGE = '겉감 점검 대상이 없습니다 — 모든 스타일의 겉감 혼용률이 입력되어 있습니다';
export const AUDIT_ERROR_MESSAGE = '점검 목록을 불러오지 못했습니다 — 점검 결과를 확인할 수 없는 상태이며 "문제 없음"이 아닙니다. 다시 시도해 주세요.';
export const AUDIT_CATEGORY_HINT = '구분 값에 겉감과 비슷하지만 인식되지 않는 값(예: FABRIC)이 있는지 확인해 주세요.';

export const AUDIT_FILTER_OPTIONS: { value: 'all' | OuterFabricAuditStatus; label: string }[] = [
  { value: 'all', label: '전체 누락' },
  { value: 'noRow', label: '겉감 행 없음' },
  { value: 'blank', label: '겉감 혼용률 비어 있음' },
  { value: 'noBom', label: 'BOM 없음' },
];

// ── PR-262: 응답 일관성 검사와 화면 상태 결정(순수 함수) ──────────────────────────
// "문제 없음"은 확인된 경우에만 말한다. 응답이 앞뒤가 맞지 않으면 숫자를 숨기고 다시 조회를 요청한다.

export const AUDIT_PAGE_SIZE = 50;

export interface AuditRequest {
  status: 'all' | OuterFabricAuditStatus;
  q: string; // 적용 중인 검색어(앞뒤 공백 제거, 없으면 '')
  page: number;
  pageSize: number;
}

export const AUDIT_SUSPECT_MESSAGE = '점검 결과를 확인할 수 없습니다 — 다시 조회해 주세요';
export const AUDIT_NO_STYLES_MESSAGE = '등록된 스타일이 없습니다';
export const AUDIT_ZERO_STATUS_MESSAGE = '이 상태는 0건입니다';
export const AUDIT_SEARCH_SCOPE_NOTE = '검색은 점검 대상(누락) 스타일 안에서 합니다. 겉감 혼용률 입력이 끝난 스타일은 목록에 나오지 않습니다.';
export const AUDIT_UNAPPLIED_HINT = "입력한 검색어는 아직 적용되지 않았습니다 — '검색'을 눌러 주세요.";
export const formatNoSearchResult = (q: string): string => `검색 결과 없음 (검색어: ${q})`;
export const formatPageOverflow = (page: number): string => `마지막 쪽을 넘었습니다(${page}쪽)`;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// 일관성이 깨진 이유(없으면 null). 새 필드가 없는 옛 응답(배포 시차)도 의심 응답이다.
export function findAuditInconsistency(res: unknown, request: AuditRequest): string | null {
  if (typeof res !== 'object' || res === null) return 'shape';
  const r = res as Partial<OuterFabricAuditResponse>;
  const { items, counts, overall, applied } = r;
  if (!Array.isArray(items) || !counts || !isCount(r.total) || !isCount(r.styleCount)) return 'shape';
  if (!overall || !applied || typeof r.generatedAt !== 'string' || r.generatedAt === '') return 'missing-fields';
  if (![counts.noBom, counts.noRow, counts.blank, counts.total].every(isCount)) return 'shape';
  if (![overall.total, overall.noBom, overall.noRow, overall.blank, overall.okCount].every(isCount)) return 'shape';

  if (overall.total !== overall.noBom + overall.noRow + overall.blank + overall.okCount) return 'invariant';
  if (overall.total !== r.styleCount) return 'style-count';
  if (counts.total !== counts.noBom + counts.noRow + counts.blank) return 'counts-sum';

  if (applied.q !== request.q || applied.status !== request.status || applied.page !== request.page || applied.pageSize !== request.pageSize) return 'applied-mismatch';
  if (r.page !== applied.page || r.pageSize !== applied.pageSize) return 'applied-mismatch';

  const keys = ['noBom', 'noRow', 'blank'] as const;
  // 검색이 없으면 검색 후 개수(counts)는 전체 개수와 같아야 하고, 검색이 있으면 전체를 넘을 수 없다.
  if (keys.some((k) => (request.q === '' ? counts[k] !== overall[k] : counts[k] > overall[k]))) return 'counts-vs-overall';
  const expectedTotal = request.status === 'all' ? counts.total : counts[request.status];
  if (r.total !== expectedTotal) return 'filtered-total';
  const expectedItems = Math.max(0, Math.min(applied.pageSize, expectedTotal - (applied.page - 1) * applied.pageSize));
  if (items.length !== expectedItems) return 'items-length';
  return null;
}

export type AuditEmptyKind = 'noStyles' | 'noSearchResult' | 'zeroStatus' | 'pageOverflow' | 'allDone';

export type AuditScreen =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'suspect' }
  | { kind: 'list'; data: OuterFabricAuditResponse }
  | { kind: 'empty'; empty: AuditEmptyKind; data: OuterFabricAuditResponse };

// 화면에 무엇을 보일지 한 곳에서 정한다. 로딩·오류·의심 응답에는 숫자를 보이지 않는다.
// 초록 "모두 입력되어 있습니다"(allDone)는 검색 없음 + 필터 "전체 누락" + 입력 완료 수 === 전체 수 > 0 일 때만이다.
export function decideAuditScreen(input: { loading: boolean; error: boolean; data: OuterFabricAuditResponse | null; request: AuditRequest }): AuditScreen {
  if (input.loading) return { kind: 'loading' };
  if (input.error) return { kind: 'error' };
  if (!input.data) return { kind: 'suspect' };
  const data = input.data;
  if (findAuditInconsistency(data, input.request) !== null) return { kind: 'suspect' };
  if (data.items.length > 0) return { kind: 'list', data };

  const overall = data.overall!;
  const { q, status, page } = input.request;
  const empty = (kind: AuditEmptyKind): AuditScreen => ({ kind: 'empty', empty: kind, data });
  if (overall.total === 0) return empty('noStyles');
  if (data.total === 0 && q !== '') return empty('noSearchResult');
  if (data.total === 0 && status !== 'all') return empty('zeroStatus');
  if (data.total > 0 && page > 1) return empty('pageOverflow');
  if (q === '' && status === 'all' && page === 1 && overall.okCount === overall.total) return empty('allDone');
  return { kind: 'suspect' }; // 어느 경우에도 해당하지 않으면 "문제 없음"으로 보지 않는다
}

// 최신 요청의 응답만 반영한다 — 요청마다 번호를 받고, 응답이 왔을 때 그 번호가 가장 최신일 때만 적용한다.
export function createLatestGate(): { next: () => number; isLatest: (id: number) => boolean } {
  let latest = 0;
  return { next: () => ++latest, isLatest: (id: number) => id === latest };
}

export interface AuditLoadState {
  loading: boolean;
  error: boolean;
  data: OuterFabricAuditResponse | null;
  request: AuditRequest;
}

// 한 번의 조회. 시작할 때 이전 숫자를 지우고(로딩만 보임), 늦게 온 이전 요청의 성공·실패는 버린다.
export async function runAuditLoad(
  gate: ReturnType<typeof createLatestGate>,
  request: AuditRequest,
  fetcher: (request: AuditRequest) => Promise<OuterFabricAuditResponse>,
  apply: (state: AuditLoadState) => void,
): Promise<void> {
  const id = gate.next();
  apply({ loading: true, error: false, data: null, request });
  try {
    const data = await fetcher(request);
    if (gate.isLatest(id)) apply({ loading: false, error: false, data, request });
  } catch {
    if (gate.isLatest(id)) apply({ loading: false, error: true, data: null, request });
  }
}
