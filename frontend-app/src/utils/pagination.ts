// PR-128: 목록 화면 공통 페이지네이션 로직(순수 함수 — React 밖에서 그대로 테스트할 수 있다).
// 백엔드 페이지네이션 응답({ items, meta })의 meta 모양이며, 특정 도메인에 묶이지 않는다.
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export const DEFAULT_PAGE_SIZE = 10;

export const EMPTY_PAGE_META: PageMeta = {
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// 응답에서 meta를 꺼낸다. meta가 없는 응답(배열 등)은 "한 페이지에 전부"로 취급한다.
export function toPageMeta(res: unknown, fallback: { page: number; limit: number }): PageMeta {
  const meta = (res as { meta?: Record<string, unknown> } | null | undefined)?.meta;
  if (!meta) {
    const total = Array.isArray(res) ? res.length : 0;
    return { total, page: 1, limit: Math.max(total, fallback.limit), totalPages: total > 0 ? 1 : 0, hasNextPage: false, hasPreviousPage: false };
  }
  const page = num(meta.page, fallback.page);
  const totalPages = num(meta.totalPages, 0);
  return {
    total: num(meta.total, 0),
    page,
    limit: num(meta.limit, fallback.limit),
    totalPages,
    hasNextPage: typeof meta.hasNextPage === 'boolean' ? meta.hasNextPage : page < totalPages,
    hasPreviousPage: typeof meta.hasPreviousPage === 'boolean' ? meta.hasPreviousPage : page > 1,
  };
}

// 요청 페이지를 [1, max(totalPages,1)] 범위로 맞춘다.
export function clampPage(page: number, totalPages: number): number {
  const max = Math.max(totalPages, 1);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), max);
}

// 마지막 페이지의 항목을 지우는 등으로 요청 페이지가 전체 페이지 수를 넘어섰을 때 돌아갈 페이지(아니면 null).
export function pageToRecoverTo(meta: PageMeta, requestedPage: number): number | null {
  if (meta.totalPages > 0 && requestedPage > meta.totalPages) return meta.totalPages;
  return null;
}

export interface PaginationView {
  page: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  label: string;
  summary: string;
}

// 화면에 보일 문구/버튼 활성 여부. 데이터가 0건이면 1 / 1 로 보이고 두 버튼 모두 비활성이다.
export function getPaginationView(input: { page: number; totalPages: number; total?: number }): PaginationView {
  const totalPages = Math.max(input.totalPages, 1);
  const page = clampPage(input.page, totalPages);
  return {
    page,
    totalPages,
    canPrev: page > 1,
    canNext: page < totalPages,
    label: `${page} / ${totalPages}`,
    summary: input.total === undefined ? '' : `총 ${input.total.toLocaleString('ko-KR')}건`,
  };
}
