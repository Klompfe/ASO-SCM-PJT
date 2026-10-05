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
  // PR-173: CMT 계약 건은 단가가 당장 필요 없어(수출선적서류 작성 시점에 입력) 선택값으로 바뀌었다.
  unitPrice?: number;
  notes?: string;
}

// PR-173: 발주 생성 폼이 선택된 품목의 스타일 생산유형(CMT/FOB)을 미리 조회해 단가
// 필수 여부를 판단한다. BOM에 연결되지 않은 자재는 둘 다 null(FOB와 동일하게 취급).
export interface MaterialProductionContext {
  styleNo: string | null;
  productionType: 'CMT' | 'FOB' | null;
}

export const getMaterialProductionContext = (itemId: number): Promise<MaterialProductionContext> =>
  apiClient.get('/purchase-orders/material-context', { params: { itemId } });

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

// PR-178: 발주서 표준 양식(엑셀) — base64로 내려온다(Bearer 인증 때문에 직접 링크 불가).
export const getPurchaseOrderDocument = (id: number): Promise<{ filename: string; base64: string }> =>
  apiClient.get(`/purchase-orders/${id}/document`);
