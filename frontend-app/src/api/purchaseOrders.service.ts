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
}

export interface CreatePurchaseOrder {
  supplierId: number;
  itemId: number;
  quantity: number;
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
