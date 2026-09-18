import apiClient from './client';

export interface GoodsReceiptLine {
  id: number;
  goodsReceiptId: number;
  packingDetailId: number;
  styleNo: string;
  color: string;
  size: string;
  originalQty: number;
  adjustedQty: number;
  adjustmentReason?: string | null;
}

export interface GoodsReceipt {
  id: number;
  receiptNo: string;
  issuedDate: string;
  importShipmentId: number;
  // PR-108: 발급(인쇄) 화면에 스타일번호/INVOICE 번호를 표시하기 위한 관계 — 상세
  // 조회(getGoodsReceipt)에서만 채워진다(목록 조회는 기존대로 없음).
  importShipment?: { id: number; styleNo: string; invoiceNo?: string | null } | null;
  remark?: string | null;
  lines: GoodsReceiptLine[];
  createdAt: string;
}

export interface CreateGoodsReceiptLine {
  packingDetailId: number;
  adjustedQty?: number;
  adjustmentReason?: string;
}

export interface CreateGoodsReceipt {
  importShipmentId: number;
  remark?: string;
  lines: CreateGoodsReceiptLine[];
}

export const getGoodsReceipts = (importShipmentId?: number): Promise<any> =>
  apiClient.get('/goods-receipts', { params: importShipmentId ? { importShipmentId } : undefined });

export const getGoodsReceipt = (id: number): Promise<any> => apiClient.get(`/goods-receipts/${id}`);

export const createGoodsReceipt = (data: CreateGoodsReceipt): Promise<any> =>
  apiClient.post('/goods-receipts', data);
