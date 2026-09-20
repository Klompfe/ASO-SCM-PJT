import { getWorkOrders, type GetWorkOrdersFilter, type WorkOrder } from '../api/workOrders.service';
import { getItems, type GetItemsFilter, type Item } from '../api/items.service';
import { DEFAULT_PAGE_SIZE, toPageMeta, type PageMeta } from './pagination';

// PR-128: 작업지시/품목관리 메인 목록의 조회 조건 → API 파라미터 변환과 "한 페이지 조회". 화면 밖의 순수 로직이라 그대로 테스트한다.
export interface PagedResult<T> {
  items: T[];
  meta: PageMeta;
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export interface WorkOrderListQuery {
  page: number;
  status?: string;
  keyword?: string;
}

// 빈 값은 파라미터에서 뺀다("All" 상태가 status=''로 나가 서버 enum 검증에 걸리던 문제 방지).
export function buildWorkOrdersQuery(q: WorkOrderListQuery): GetWorkOrdersFilter {
  return { page: q.page, limit: DEFAULT_PAGE_SIZE, status: clean(q.status), keyword: clean(q.keyword) };
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
