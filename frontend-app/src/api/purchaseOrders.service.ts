import apiClient from './client';

export interface PurchaseOrder {
  id: number;
  itemId: number;
  item?: { id: number; code: string; name: string };
  quantity: number;
  unitPrice?: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  supplierId?: number;
  supplier?: { id: number; code: string; name: string };
  notes?: string;
  createdAt?: string;
  // PR-180: 실발주(FIRM)/가발주(PROVISIONAL). 기존 행은 null일 수 있다(미지정).
  orderType?: 'FIRM' | 'PROVISIONAL' | null;
}

export interface CreatePurchaseOrder {
  supplierId: number;
  itemId: number;
  quantity: number;
  unitPrice: number;
  notes?: string;
  orderType?: 'FIRM' | 'PROVISIONAL';
}

export interface GetPurchaseOrdersFilter {
  supplierId?: number;
  itemId?: number;
  status?: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  startDate?: string;
  endDate?: string;
  // PR-127: 품목명/코드/공급업체명 부분일치 검색어
  keyword?: string;
  // PR-127: page 또는 limit를 주면 서버가 실제로 페이지네이션한다(둘 다 생략하면 전량 — 원장/리포트용)
  page?: number;
  limit?: number;
}

export const getPurchaseOrders = (filter?: GetPurchaseOrdersFilter): Promise<any> =>
  apiClient.get('/purchase-orders', { params: filter });
export const createPurchaseOrder = (data: CreatePurchaseOrder): Promise<any> =>
  apiClient.post('/purchase-orders', data);
export const updatePurchaseOrderStatus = (
  id: number,
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED',
): Promise<any> => apiClient.patch(`/purchase-orders/${id}/status`, { status });

// PR-177: 미입고(PENDING) 발주 수정 — 수량/단가/비고.
export const updatePurchaseOrder = (
  id: number,
  data: { quantity?: number; unitPrice?: number; notes?: string },
): Promise<any> => apiClient.patch(`/purchase-orders/${id}`, data);

// PR-179: 일괄발주 — 미리보기에서 확인된 행들을 한 번에 생성(서버는 하나라도 틀리면 전부 취소).
export const createPurchaseOrdersBulk = (
  orders: { supplierId: number; itemId: number; quantity: number; unitPrice: number; notes?: string; orderType?: 'FIRM' | 'PROVISIONAL' }[],
): Promise<any> => apiClient.post('/purchase-orders/bulk', { orders });

// PR-178: 발주서 표준 양식(엑셀) — base64로 내려온다(Bearer 인증 때문에 직접 링크 불가).
export const getPurchaseOrderDocument = (id: number): Promise<{ filename: string; base64: string }> =>
  apiClient.get(`/purchase-orders/${id}/document`);

// PR-180: 품목의 발주 구분 제안 — 이 품목을 쓰는 활성 BOM 스타일의 계약방식 기준. 확신할 수 없으면 orderType이 null이다.
export interface OrderTypeSuggestion {
  orderType: 'FIRM' | 'PROVISIONAL' | null;
  reason: string;
  styleNos: string[];
}
export const getOrderTypeSuggestion = (itemId: number): Promise<OrderTypeSuggestion> =>
  apiClient.get('/purchase-orders/order-type-suggestion', { params: { itemId } });
