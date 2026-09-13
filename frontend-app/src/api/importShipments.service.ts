import apiClient from './client';

export type ImportShipmentStatus = 'PENDING_CLEARANCE' | 'CLEARED';

export interface ImportShipmentLine {
  id: number;
  importShipmentId: number;
  itemType: string;
  composition: string;
  fabricType: string;
  hsCode?: string | null;
  unmatched: boolean;
  qty: number;
  unit: string;
  unitPrice?: number | null;
  amount?: number | null;
  netWeight?: number | null;
  grossWeight?: number | null;
  packageCount?: number | null;
}

export interface ImportShipment {
  id: number;
  styleNo: string;
  style?: { styleNo: string; overview?: { styleName: string | null } | null } | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  status: ImportShipmentStatus;
  clearedAt?: string | null;
  lines: ImportShipmentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportShipmentLine {
  itemType: string;
  composition: string;
  fabricType?: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  amount?: number;
  netWeight?: number;
  grossWeight?: number;
  packageCount?: number;
}

export interface CreateImportShipment {
  styleNo: string;
  invoiceNo?: string;
  invoiceDate?: string;
  lines: CreateImportShipmentLine[];
}

export const getImportShipments = (): Promise<any> => apiClient.get('/import-shipments');

export const getImportShipment = (id: number): Promise<any> => apiClient.get(`/import-shipments/${id}`);

export const createImportShipment = (data: CreateImportShipment): Promise<any> =>
  apiClient.post('/import-shipments', data);

export const updateImportShipmentStatus = (id: number, status: ImportShipmentStatus): Promise<any> =>
  apiClient.put(`/import-shipments/${id}/status`, { status });

export const updateImportShipmentLineHsCode = (
  importShipmentId: number,
  lineId: number,
  hsCode: string,
): Promise<any> => apiClient.put(`/import-shipments/${importShipmentId}/lines/${lineId}`, { hsCode });
