import apiClient from './client';

export type PackingMaterialCategory = 'FABRIC' | 'TRIM';

export interface PackingReceiptRoll {
  id: number;
  rollNo: string;
  color?: string;
  widthCm?: number;
  widthInch?: number;
  grossWeight?: number;
  netWeight?: number;
  thickness?: number;
}

export interface PackingReceiptCarton {
  id: number;
  cartonNo: string;
  color?: string;
  size?: string;
  lotNo?: string;
  qty: number;
  itemName?: string;
  weightKg?: number;
}

export interface PackingReceipt {
  id: number;
  purchaseOrderId: number;
  materialCategory: PackingMaterialCategory;
  receivedDate?: string;
  remark?: string;
  createdAt: string;
  rolls?: PackingReceiptRoll[];
  cartons?: PackingReceiptCarton[];
  totals: {
    rollCount?: number;
    totalGrossWeight?: number;
    totalNetWeight?: number;
    cartonCount?: number;
    lineCount?: number;
    totalQty?: number;
    totalWeightKg?: number;
  };
}

export interface CreatePackingReceiptRoll {
  rollNo: string;
  color?: string;
  widthCm?: number;
  widthInch?: number;
  grossWeight?: number;
  netWeight?: number;
  thickness?: number;
}

export interface CreatePackingReceiptCarton {
  cartonNo: string;
  color?: string;
  size?: string;
  lotNo?: string;
  qty: number;
  itemName?: string;
  weightKg?: number;
}

export interface CreatePackingReceipt {
  materialCategory: PackingMaterialCategory;
  receivedDate?: string;
  remark?: string;
  rolls?: CreatePackingReceiptRoll[];
  cartons?: CreatePackingReceiptCarton[];
}

export const getPackingReceipts = (purchaseOrderId: number): Promise<any> =>
  apiClient.get(`/purchase-orders/${purchaseOrderId}/packing-receipts`);

export const createPackingReceipt = (purchaseOrderId: number, data: CreatePackingReceipt): Promise<any> =>
  apiClient.post(`/purchase-orders/${purchaseOrderId}/packing-receipts`, data);

export const uploadPackingReceipt = (
  purchaseOrderId: number,
  file: File,
  materialCategory: PackingMaterialCategory,
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('materialCategory', materialCategory);
  return apiClient.post(`/purchase-orders/${purchaseOrderId}/packing-receipts/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// PR-118: 집계 보고서용 — 발주를 가로질러 부자재(카톤) 포장내역 전체(입고일 기간 필터).
export const getPackingReceiptsReport = (params?: { from?: string; to?: string }): Promise<any> =>
  apiClient.get('/packing-receipts', { params });
