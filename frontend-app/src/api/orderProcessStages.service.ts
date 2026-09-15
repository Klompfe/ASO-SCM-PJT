import apiClient from './client';

export interface ProcurementStatusRow {
  styleNo: string;
  buyer: string | null;
  poCreated: boolean;
  materialReadiness: { ready: number; total: number };
  exported: boolean;
  overallStatus: string;
}

// PR-089: 오더관리 하위 "발주·입고·출고 현황" 서브탭용.
export const getProcurementStatusReport = (): Promise<any> =>
  apiClient.get('/order-process-stages/procurement-status');
