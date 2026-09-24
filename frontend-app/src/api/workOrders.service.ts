import apiClient from './client';
import type { MaterialRequirements } from '../utils/bomRequirementReport';

export interface WorkOrder {
  id: number;
  status: string;
  itemId: number;
  targetQuantity: number;
  item?: { id: number; name: string; code: string; type: string; styleNo?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface GetWorkOrdersFilter {
  page?: number;
  limit?: number;
  status?: string;
  itemId?: number;
  startDate?: string;
  endDate?: string;
  // PR-127: 완제품 품목명/코드/스타일번호 부분일치 검색어(OR, 통합 검색 선택 컴포넌트용)
  keyword?: string;
  // PR-139: 작업지시 목록 화면의 항목별 개별 검색(AND, 채운 항목만 조건이 됨)
  itemName?: string;
  itemCode?: string;
  styleNo?: string;
}

export interface UpdateWorkOrderStatus {
  status: string;
}

export interface CreateWorkOrder {
  itemId: number;
  targetQuantity: number;
}

export const getWorkOrders = (filter: GetWorkOrdersFilter): Promise<any> => apiClient.get('/work-orders', { params: filter });
export const createWorkOrder = (data: CreateWorkOrder): Promise<any> => apiClient.post('/work-orders', data);
export const updateWorkOrderStatus = (id: number, data: UpdateWorkOrderStatus): Promise<any> => apiClient.patch(`/work-orders/${id}/status`, data);
// PR-120: BOM 소요명세서(작업지시 물량 기준 자재 소요량/이미 발주 수량/부족 수량).
export const getMaterialRequirements = (id: number): Promise<MaterialRequirements> =>
  apiClient.get(`/work-orders/${id}/material-requirements`);
// PR-126: 작업지시 없이 스타일+수량으로 같은 계산(발주 화면의 "스타일번호로 필요 자재 찾기"). quantity 생략 시 스타일 총 수량.
export interface StyleRequirements extends Omit<MaterialRequirements, 'workOrder' | 'styleNo'> {
  styleNo: string;
  styleExists: boolean;
  quantity: number;
  quantitySource: 'REQUESTED' | 'STYLE_TOTAL_QTY' | 'NONE';
  styleTotalQty: number;
}
export const getStyleRequirements = (styleNo: string, quantity?: number): Promise<StyleRequirements> =>
  apiClient.get('/work-orders/style-requirements', { params: { styleNo, ...(quantity ? { quantity } : {}) } });
