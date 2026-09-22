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
  // PR-127: 완제품 품목명/코드/스타일번호 부분일치 검색어
  keyword?: string;
}

export interface UpdateWorkOrderStatus {
  status: string;
}

export interface CreateWorkOrder {
  itemId: number;
  targetQuantity: number;
}

// 작업지시서 AI 분석 결과 3단 구조 — vision.service.ts의 AiWorkOrderResultDto와 동일한 shape.
export interface AiOverview {
  styleNo: string | null;
  styleName: string | null;
  itemType: string | null;
  brand: string | null;
  productionType: 'FOB' | 'CMT' | null;
  factory: string | null;
  buyer: string | null;
  totalQty: number | null;
  targetRdd: string | null;
}

export interface AiBomItem {
  category: string | null;
  itemName: string;
  spec: string | null;
  colorCode: string | null;
  consumption: number | null;
  requiredQty: number | null;
  supplier: string | null;
  remarks: string | null;
}

export interface AiSizeSpecRow {
  part: string;
  size: string;
  instructedValue: string | null;
  sampleValue: string | null;
  diffValue: string | null;
  finalValue: string | null;
}

export interface AiWorkOrderResult {
  overview: AiOverview;
  bomItems: AiBomItem[];
  sizeSpecs: AiSizeSpecRow[];
  workNotes: string | null;
}

export const getWorkOrders = (filter: GetWorkOrdersFilter): Promise<any> => apiClient.get('/work-orders', { params: filter });
export const createWorkOrder = (data: CreateWorkOrder): Promise<any> => apiClient.post('/work-orders', data);
export const updateWorkOrderStatus = (id: number, data: UpdateWorkOrderStatus): Promise<any> => apiClient.patch(`/work-orders/${id}/status`, data);
export const uploadWorkOrderImage = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/work-orders/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const commitWorkOrderAnalysis = (result: AiWorkOrderResult): Promise<any> =>
  apiClient.post('/work-orders/commit-analysis', result);
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
export const getWorkOrderSpec = (styleNo: string): Promise<any> =>
  apiClient.get('/work-orders/spec', { params: { styleNo } });

export interface AiUsageLog {
  id: number;
  pageCount: number;
  promptTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  chargedAmountKrw: number;
  createdAt: string;
}

export interface AiUsageSummary {
  totalCalls: number;
  totalChargedKrw: number;
  totalCostUsd: number;
}

export const getAiUsage = (): Promise<any> => apiClient.get('/work-orders/ai-usage');
export const getAiUsageSummary = (): Promise<any> => apiClient.get('/work-orders/ai-usage/summary');
