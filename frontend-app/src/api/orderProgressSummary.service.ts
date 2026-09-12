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

export const getOrderProgressSummary = (): Promise<any> => apiClient.get('/order-progress-summary');
