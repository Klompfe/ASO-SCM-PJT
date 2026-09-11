import apiClient from './client';

export type ProcessStageName = 'CUTTING' | 'SEWING' | 'PACKING';

export interface OrderProcessStage {
  id: number;
  styleNo: string;
  stage: ProcessStageName;
  startDate: string | null;
  finishDate: string | null;
  targetQty: number | null;
  completedQty: number;
  lineOrTeam: string | null;
  updatedAt: string;
}

export interface UpsertProcessStage {
  styleNo: string;
  stage: ProcessStageName;
  startDate?: string;
  finishDate?: string;
  targetQty?: number;
  completedQty?: number;
  lineOrTeam?: string;
}

export interface MaterialReadiness {
  totalMaterials: number;
  readyMaterials: number;
}

export interface OrderShipment {
  id: number;
  styleNo: string;
  installmentNo: number;
  plannedShipDate: string;
  actualShipDate: string | null;
  quantity: number;
  remark: string | null;
  createdAt: string;
}

export interface CreateOrderShipment {
  styleNo: string;
  plannedShipDate: string;
  quantity: number;
  remark?: string;
}

export interface UpdateOrderShipment {
  plannedShipDate?: string;
  actualShipDate?: string;
  quantity?: number;
  remark?: string;
}

export const upsertProcessStage = (data: UpsertProcessStage): Promise<any> =>
  apiClient.put('/order-process-stages', data);
export const getProcessStagesByStyle = (styleNo: string): Promise<any> =>
  apiClient.get('/order-process-stages', { params: { styleNo } });
export const getMaterialReadiness = (styleNo: string): Promise<any> =>
  apiClient.get('/order-process-stages/material-readiness', { params: { styleNo } });

export const createOrderShipment = (data: CreateOrderShipment): Promise<any> =>
  apiClient.post('/order-shipments', data);
export const updateOrderShipment = (id: number, data: UpdateOrderShipment): Promise<any> =>
  apiClient.patch(`/order-shipments/${id}`, data);
export const getOrderShipmentsByStyle = (styleNo: string): Promise<any> =>
  apiClient.get('/order-shipments', { params: { styleNo } });

export interface ShippedQtySummary {
  styleNo: string;
  shippedQty: number;
}
export const getShipmentSummary = (): Promise<any> => apiClient.get('/order-shipments/summary');
