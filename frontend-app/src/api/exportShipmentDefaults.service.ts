import apiClient from './client';

export interface ExportShipmentDefaults {
  id: number;
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
  /** @deprecated PR-193: 더 이상 기본값으로 쓰지 않는다(선적 건마다 바뀌는 값이라 제외됨) — 과거 저장된 값이 응답에 남아있을 수 있지만 화면에서 쓰지 않는다. */
  carrier?: string;
  updatedAt: string;
}

export interface UpdateExportShipmentDefaults {
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
}

// 미설정 상태에서는 null이 반환된다(에러 아님) — PR-079.
export const getExportShipmentDefaults = (): Promise<any> => apiClient.get('/export-shipment-defaults');

export const updateExportShipmentDefaults = (data: UpdateExportShipmentDefaults): Promise<any> =>
  apiClient.put('/export-shipment-defaults', data);
