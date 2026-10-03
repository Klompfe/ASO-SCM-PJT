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
  lengthYd?: number;
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
  cbm?: number;
  createdAt: string;
  rolls?: PackingReceiptRoll[];
  cartons?: PackingReceiptCarton[];
  totals: {
    rollCount?: number;
    totalGrossWeight?: number;
    totalNetWeight?: number;
    totalLengthYd?: number;
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
  lengthYd?: number;
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
  cbm?: number;
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

// PR-169: 공급업체 포장내역 표준양식 — 다운로드(발주 컨텍스트 자동 채움)는 base64로
// 감싸서 내려온다(Bearer 인증이 필요해 <a href> 직접 다운로드를 쓸 수 없음 — 백엔드
// packing-receipts.controller.ts 주석 참고). 업로드는 미리보기만 하고 저장하지
// 않으며, 사용자가 확인한 뒤 기존 createPackingReceipt로 커밋한다.
export interface PackingReceiptTemplateDownload {
  filename: string;
  base64: string;
}

export const getPackingReceiptTemplate = (
  purchaseOrderId: number,
  materialCategory: PackingMaterialCategory,
): Promise<any> =>
  apiClient.get(`/purchase-orders/${purchaseOrderId}/packing-receipts/template`, {
    params: { materialCategory },
  });

export interface PackingReceiptTemplatePreview {
  materialCategory: PackingMaterialCategory;
  cbm?: number;
  remark?: string;
  rolls?: CreatePackingReceiptRoll[];
  cartons?: CreatePackingReceiptCarton[];
  warnings: string[];
  declaredPackageCount: number | null;
}

export const previewPackingReceiptTemplateUpload = (
  purchaseOrderId: number,
  file: File,
  materialCategory: PackingMaterialCategory,
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post(
    `/purchase-orders/${purchaseOrderId}/packing-receipts/template/preview`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, params: { materialCategory } },
  );
};
