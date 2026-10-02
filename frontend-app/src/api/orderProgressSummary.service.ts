import apiClient from './client';
import type { ContractStatus } from './contracts.service';

export interface StageProgress {
  completedQty: number;
  targetQty: number | null;
  rate: number;
}

export interface OrderProgressSummaryRow {
  styleNo: string;
  factory: string | null;
  buyer: string | null;
  targetRdd: string | null;
  contractStatus: ContractStatus | 'NONE';
  stages: {
    CUTTING: StageProgress;
    SEWING: StageProgress;
    PACKING: StageProgress;
  };
  currentStageLabel: string;
  shipRate: number;
  fulfillmentRate: number;
  deliveryStatus: string;
}

// PR-167: factory를 생략하면 전체(기존 동작) — 화면이 기본값으로 "태일"을 넘긴다.
export const getOrderProgressSummary = (factory?: string): Promise<any> =>
  apiClient.get('/order-progress-summary', factory ? { params: { factory } } : undefined);
