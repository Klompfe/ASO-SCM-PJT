import apiClient from './client';

export interface WorkOrder {
  id: number;
  status: string;
  itemId: number;
  quantity: number;
  dueDate: string;
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
}

export interface UpdateWorkOrderStatus {
  status: string;
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
