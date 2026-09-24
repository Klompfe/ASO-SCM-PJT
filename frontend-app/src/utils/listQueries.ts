import { getWorkOrders, type GetWorkOrdersFilter, type WorkOrder } from '../api/workOrders.service';
import { getItems, type GetItemsFilter, type Item } from '../api/items.service';
import { DEFAULT_PAGE_SIZE, toPageMeta, type PageMeta } from './pagination';

// PR-128: 작업지시/품목관리 메인 목록의 조회 조건 → API 파라미터 변환과 "한 페이지 조회". 화면 밖의 순수 로직이라 그대로 테스트한다.
export interface PagedResult<T> {
  items: T[];
  meta: PageMeta;
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

// PR-139: 상태(구분) 필터 + 텍스트 검색을 함께 쓰는 목록 화면(작업지시/품목관리 등) 공통 — 아무 조건도
// 없이 검색하면(전체 목록이 그냥 나오는 대신) 경고를 띄우고 조회를 막아야 한다. 필터 중 하나라도
// 비어있지 않으면 유효한 조건으로 본다(예: 상태만 골라도 통과).
export function hasAnySearchCondition(...values: Array<string | undefined | null>): boolean {
  return values.some((v) => !!v && v.trim() !== '');
}

export interface WorkOrderListQuery {
  page: number;
  status?: string;
  keyword?: string;
  // PR-139: 통합 keyword 대신 항목별 개별 검색(AND) — 화면은 이 셋을 쓰고 keyword는 다른 화면(검색 선택)이 쓴다.
  itemName?: string;
  itemCode?: string;
  styleNo?: string;
}

// 빈 값은 파라미터에서 뺀다("All" 상태가 status=''로 나가 서버 enum 검증에 걸리던 문제 방지).
export function buildWorkOrdersQuery(q: WorkOrderListQuery): GetWorkOrdersFilter {
  return {
    page: q.page,
    limit: DEFAULT_PAGE_SIZE,
    status: clean(q.status),
    keyword: clean(q.keyword),
    itemName: clean(q.itemName),
    itemCode: clean(q.itemCode),
    styleNo: clean(q.styleNo),
  };
}

export interface ItemListQuery {
  page: number;
  type?: string;
  keyword?: string;
}

export function buildItemsQuery(q: ItemListQuery): GetItemsFilter {
  return { page: q.page, limit: DEFAULT_PAGE_SIZE, type: clean(q.type), keyword: clean(q.keyword) };
}

function toResult<T>(res: unknown, fallback: { page: number; limit: number }): PagedResult<T> {
  const items = Array.isArray(res) ? (res as T[]) : Array.isArray((res as { items?: unknown })?.items) ? ((res as { items: T[] }).items) : [];
  return { items, meta: toPageMeta(res, fallback) };
}

export async function fetchWorkOrderPage(q: WorkOrderListQuery): Promise<PagedResult<WorkOrder>> {
  const filter = buildWorkOrdersQuery(q);
  return toResult<WorkOrder>(await getWorkOrders(filter), { page: q.page, limit: DEFAULT_PAGE_SIZE });
}

export async function fetchItemPage(q: ItemListQuery): Promise<PagedResult<Item>> {
  const filter = buildItemsQuery(q);
  return toResult<Item>(await getItems(filter), { page: q.page, limit: DEFAULT_PAGE_SIZE });
}
