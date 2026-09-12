import apiClient from './client';

export interface ExportShipmentDefaults {
  id: number;
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
  carrier?: string;
  updatedAt: string;
}

export interface UpdateExportShipmentDefaults {
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
  carrier?: string;
}

// 미설정 상태에서는 null이 반환된다(에러 아님) — PR-079.
export const getExportShipmentDefaults = (): Promise<any> => apiClient.get('/export-shipment-defaults');

export const updateExportShipmentDefaults = (data: UpdateExportShipmentDefaults): Promise<any> =>
  apiClient.put('/export-shipment-defaults', data);
