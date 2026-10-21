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
  // PR-158: 문서 상단 작성일(targetRdd와 서로 다른 필드) + 서버가 계산해 내려주는
  // "납기가 작성일/오늘보다 이르거나 같아 의심스러운지" 플래그.
  documentDate: string | null;
  targetRddSuspicious?: boolean;
  // PR-190: 서버가 계산해 내려주는 값 — 납기에 연도가 없어 작성일보다 이른 날짜로
  // 인식됐을 때 다음 해로 자동 보정했는지와, 보정했다면 원래 인식값(화면 안내용).
  targetRddYearAdjusted?: boolean;
  targetRddOriginal?: string | null;
  // PR-168: 미도 전용 — 작지 상단 수기 CMT단가. candidate는 AI 후보(읽기전용 참고용,
  // 미도가 아니면 항상 null), cmtPrice는 사람이 확인/수정한 최종값(이것만 저장된다).
  handwrittenCmtPriceCandidate?: number | null;
  // PR-181: candidate와 짝인 수기 표기 원문(계산식이면 식 전체) — 코멘트칸 기본값.
  handwrittenCmtPriceMemo?: string | null;
  cmtPrice?: number | null;
  // PR-181: cmtPrice의 근거 코멘트 — 저장되는 값(계약 cmtPriceNote까지 전달됨).
  cmtPriceNote?: string | null;
  // PR-200: 서버가 계산해 내려주는 값(AI가 채우는 필드 아님) — 스타일번호가 대소문자만
  // 틀려 서버가 대문자로 정리했을 때만 원문이 담긴다.
  rawStyleNo?: string | null;
  // PR-200: 서버 후처리 경고(저장 대상 아님, 검토 화면 표시용).
  warnings?: AiWarning[] | null;
}

// PR-200: 작지 AI 판독 안전장치 — 서버 후처리 경고 하나(code/message + 선택적 후보값).
export interface AiWarning {
  code: string;
  message: string;
  suggestions?: string[];
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
  // PR-175: AI 후보(읽기전용 참고) — 실/테이프 종류 한글 라벨 중 하나 또는 null.
  materialSubTypeCandidate?: string | null;
  // 사람이 검토 화면에서 확정한 최종값(저장 대상). AI가 직접 채우지 않는다.
  threadType?: string | null;
  tapeType?: string | null;
  // PR-200: 전부 AI 후보/서버 후처리 필드다 — commitSalesOrderAnalysis로 그대로
  // 보내도 서버 commitAnalysis는 이 필드들을 읽지 않는다(저장 대상 아님).
  itemNameCandidates?: string[] | null;
  consumptionCandidates?: number[] | null;
  uncertain?: boolean | null;
  uncertainReason?: string | null;
  // "공급사)자재명"을 서버가 분리했을 때만 채워진다(형식 해석). 화면에서 사람이
  // 확인하면 기존 supplier 칸으로 복사해야 저장된다(이 필드 자체는 저장 대상 아님).
  supplierName?: string | null;
  rawItemName?: string | null;
  warnings?: AiWarning[] | null;
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

// PR-192: 백엔드가 240초 한도로 재시도·폴백을 끝내므로, 그보다 약간 긴 270초로 맞춰
// 둔다(전역 axiosInstance 기본값에는 timeout이 없다 — 다른 API는 건드리지 않음).
export const uploadSalesOrderImage = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/sales-orders/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 270_000,
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
