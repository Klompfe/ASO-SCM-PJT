import apiClient from './client';

export interface ProcurementStatusRow {
  styleNo: string;
  buyer: string | null;
  poCreated: boolean;
  materialReadiness: { ready: number; total: number };
  exported: boolean;
  // PR-179: 포장내역 등록 여부와, 포장내역이 없는 입고 발주 id(인라인 '포장내역 등록' 대상).
  packed: boolean;
  packingPendingPurchaseOrderId: number | null;
  overallStatus: string;
}

// PR-089: 오더관리 하위 "발주·입고·출고 현황" 서브탭용.
export const getProcurementStatusReport = (): Promise<any> =>
  apiClient.get('/order-process-stages/procurement-status');
