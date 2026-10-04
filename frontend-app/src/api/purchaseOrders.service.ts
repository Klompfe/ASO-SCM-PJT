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
  // PR-176: 색상/사이즈별 상세 줄(없으면 빈 배열 — 기존 발주).
  lines?: PurchaseOrderLine[];
}

// PR-176: 색상/사이즈 자유입력 한 줄. 수량은 정수.
export interface PurchaseOrderLine {
  color?: string | null;
  size?: string | null;
  qty: number;
}

export interface CreatePurchaseOrder {
  supplierId: number;
  itemId: number;
  // PR-176: 라인이 있으면 생략 가능(총수량 = 라인 합계).
  quantity?: number;
  lines?: PurchaseOrderLine[];
  unitPrice: number;
  notes?: string;
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
