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
  // PR-196: 모호한 미연결 발주(추측 금지 — 누구 몫으로도 안 셈)가 걸려 있는 발주 건수와,
  // 이 스타일 몫으로 자동 귀속된(미연결인데 이 자재를 쓰는 스타일이 하나뿐) 발주 건수.
  unlinkedPoCount: number;
  autoAttributedPoCount: number;
  targetRdd: string | null;
  brand: string | null;
}

// PR-089: 오더관리 하위 "발주·입고·출고 현황" 서브탭용.
export const getProcurementStatusReport = (): Promise<any> =>
  apiClient.get('/order-process-stages/procurement-status');
