import apiClient from './client';

// PR-134: 수주(고객사로부터 받은 주문) 등록 API — 작업지시서 문서 업로드 → AI 분석 → 저장. PR-133에서 백엔드가 /work-orders/* 에서
// /sales-orders/* 로 분리되었고, 이 파일이 그 프론트 쪽 짝이다(예전에는 workOrders.service.ts에 섞여 있었다).
// 내부 생산 실행 지시(작업지시, WorkOrder)는 workOrders.service.ts에 그대로 있다.

// 작업지시서 AI 분석 결과 3단 구조 — vision.service.ts의 AiSalesOrderResultDto와 동일한 shape.
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

export interface AiSalesOrderResult {
  overview: AiOverview;
  bomItems: AiBomItem[];
  sizeSpecs: AiSizeSpecRow[];
  workNotes: string | null;
}

export const uploadSalesOrderImage = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/sales-orders/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const commitSalesOrderAnalysis = (result: AiSalesOrderResult): Promise<any> =>
  apiClient.post('/sales-orders/commit-analysis', result);
export const getSalesOrderSpec = (styleNo: string): Promise<any> =>
  apiClient.get('/sales-orders/spec', { params: { styleNo } });

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

export const getAiUsage = (): Promise<any> => apiClient.get('/sales-orders/ai-usage');
export const getAiUsageSummary = (): Promise<any> => apiClient.get('/sales-orders/ai-usage/summary');
