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

// PR-083: 태일 VN 공장이 실제로 작성하는 Vietnam INVOICE/Packing List 엑셀을 그대로
// 업로드해 스타일별로 수입통관 문서를 자동 생성한다. 응답에는 warnings(설명/수량
// 불일치, MasterStyle 미등록 스타일 스킵 등 조용히 무시하지 않은 경고 목록)가 함께 온다.
export const importImportShipmentsFromFile = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/import-shipments/import-from-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
