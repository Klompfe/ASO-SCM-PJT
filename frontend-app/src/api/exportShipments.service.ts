import apiClient from './client';

export type ExportShipmentStatus = 'DRAFT' | 'REVIEWED' | 'FINALIZED';

export type ExportShipmentSource = 'GENERATED' | 'IMPORTED';

export interface ExportShipmentLine {
  id: number;
  exportShipmentId: number;
  styleNo: string;
  packingReceiptId?: number | null;
  description: string;
  hsCode?: string;
  qty: number;
  unit: string;
  unitPrice?: number | null;
  amount?: number | null;
  netWeight?: number | null;
  grossWeight?: number | null;
  packageCount?: number | null;
  packageType?: string | null;
}

export interface ExportShipment {
  id: number;
  styleNos: string[];
  status: ExportShipmentStatus;
  source?: ExportShipmentSource;
  sheetNo?: string;
  invoiceDate?: string;
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
  carrier?: string;
  sailingDate?: string;
  createdAt: string;
  lines: ExportShipmentLine[];
}

export interface GenerateExportShipment {
  sheetNo?: string;
  invoiceDate?: string;
  shipperInfo?: string;
  consigneeInfo?: string;
  portOfLoading?: string;
  finalDestination?: string;
  carrier?: string;
  sailingDate?: string;
}

// PR-102: 스타일번호/자재명/선적건번호 검색 — 셋 다 선택적, AND 결합.
export interface FindExportShipmentsFilter {
  styleNo?: string;
  materialName?: string;
  sheetNo?: string;
}

export const getExportShipments = (filter?: FindExportShipmentsFilter): Promise<any> =>
  apiClient.get('/export-shipments', { params: filter });

export const getExportShipment = (id: number): Promise<any> => apiClient.get(`/export-shipments/${id}`);

export const generateExportShipment = (
  purchaseOrderIds: number[],
  data: GenerateExportShipment,
): Promise<any> =>
  apiClient.post('/export-shipments/generate', data, {
    params: { purchaseOrderIds: purchaseOrderIds.join(',') },
  });

export const updateExportShipmentStatus = (id: number, status: ExportShipmentStatus): Promise<any> =>
  apiClient.patch(`/export-shipments/${id}/status`, { status });

export const updateExportShipmentLine = (
  exportShipmentId: number,
  lineId: number,
  unitPrice: number | null,
): Promise<any> =>
  apiClient.patch(`/export-shipments/${exportShipmentId}/lines/${lineId}`, { unitPrice });

// PR-080: 기 작성된 INVOICE/Packing List 엑셀을 그대로 가져와 DRAFT로 즉시 등록한다.
// 응답에는 warnings(단위 불일치 등 조용히 무시하지 않은 경고 목록)가 함께 온다.
export const importExportShipmentFromFile = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/export-shipments/import-from-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
