import apiClient from './client';

export type ExportShipmentStatus = 'DRAFT' | 'REVIEWED' | 'FINALIZED';

export interface ExportShipmentLine {
  id: number;
  exportShipmentId: number;
  styleNo: string;
  packingReceiptId: number;
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

export const getExportShipments = (): Promise<any> => apiClient.get('/export-shipments');

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
