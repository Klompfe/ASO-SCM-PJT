// PR-238(사용자 요구): 자재명세(자재·BOM 조회)에서 발주관리로 가는 이동을 전부 "새
// 브라우저 탭"으로 바꾼다. 업무 데이터(품번·자재명 등)를 URL에 직접 싣지 않고 식별자
// (스타일번호, BOM 행 id)만 쿼리로 넘긴다 — 새 탭은 그 식별자로 서버에서 다시 조회한다.
// window 객체에 직접 의존하지 않도록 pathname을 인자로 받는다(테스트 가능, jsdom 불필요).

export const BOM_ORDER_VIEW_PARAM = 'view';
export const BOM_ORDER_VIEW_VALUE = 'purchaseOrders';

export function buildSingleOrderUrl(pathname: string, itemId: number, styleNo?: string | null): string {
  const params = new URLSearchParams();
  params.set(BOM_ORDER_VIEW_PARAM, BOM_ORDER_VIEW_VALUE);
  params.set('prefillItemId', String(itemId));
  if (styleNo) params.set('prefillStyleNo', styleNo);
  return `${pathname}?${params.toString()}`;
}

export function buildBulkOrderUrl(pathname: string, styleNo: string, bomItemIds: number[]): string {
  const params = new URLSearchParams();
  params.set(BOM_ORDER_VIEW_PARAM, BOM_ORDER_VIEW_VALUE);
  params.set('bulkStyleNo', styleNo);
  params.set('bulkBomItemIds', bomItemIds.join(','));
  return `${pathname}?${params.toString()}`;
}

export interface SingleOrderPrefill {
  kind: 'single';
  itemId: number;
  styleNo: string | null;
}

export interface BulkOrderPrefill {
  kind: 'bulk';
  styleNo: string;
  bomItemIds: number[];
}

// 인식하는 쿼리가 없으면(기존 흐름으로 그냥 연 경우) null — 지시사항 "쿼리 없이 열면
// 지금과 같다"를 그대로 지킨다.
export function parseOrderPrefillFromSearch(search: string): SingleOrderPrefill | BulkOrderPrefill | null {
  const params = new URLSearchParams(search);
  if (params.get(BOM_ORDER_VIEW_PARAM) !== BOM_ORDER_VIEW_VALUE) return null;

  const bulkStyleNo = params.get('bulkStyleNo');
  const bulkIdsRaw = params.get('bulkBomItemIds');
  if (bulkStyleNo && bulkIdsRaw) {
    const ids = bulkIdsRaw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return null;
    return { kind: 'bulk', styleNo: bulkStyleNo, bomItemIds: ids };
  }

  const itemIdRaw = params.get('prefillItemId');
  if (itemIdRaw) {
    const itemId = Number(itemIdRaw);
    if (!Number.isFinite(itemId) || itemId <= 0) return null;
    return { kind: 'single', itemId, styleNo: params.get('prefillStyleNo') };
  }

  return null;
}
