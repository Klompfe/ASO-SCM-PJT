import apiClient from './client';

export type ExportShipmentStatus = 'DRAFT' | 'REVIEWED' | 'FINALIZED';

export type ExportShipmentSource = 'GENERATED' | 'IMPORTED';

export type ExportShipmentLinePriceSource = 'PURCHASE_ORDER' | 'MIDO_PRICE_TABLE' | 'MANUAL';

export interface ExportShipmentLine {
  id: number;
  exportShipmentId: number;
  styleNo: string;
  packingReceiptId?: number | null;
  description: string;
  hsCode?: string;
  color?: string | null;
  qty: number;
  unit: string;
  unitPrice?: number | null;
  amount?: number | null;
  netWeight?: number | null;
  grossWeight?: number | null;
  packageCount?: number | null;
  packageType?: string | null;
  cbm?: number | null;
  unitPriceUsd?: number | null;
  amountUsd?: number | null;
  priceSource?: ExportShipmentLinePriceSource | null;
  // PR-182: 생성 시점에 BomItem.threadType/tapeType을 복사한 값(실/테이프가 아니거나
  // BOM 연결이 없으면 null) — 미터단가 → 콘/롤단가 환산 후보를 얼마나 좁힐 수 있는지 결정한다.
  materialSubType?: string | null;
  // PR-182: 환산이 적용된 경우 확정 시 저장된 근거 식(예: "미도 단가표 0.00012/m × 2500m = 0.3/콘(코아사)").
  priceBasisNote?: string | null;
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
  exchangeRateUsdKrw?: number | null;
  exchangeRateDate?: string | null;
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
  exchangeRateUsdKrw?: number;
}

// PR-102: 스타일번호/자재명/선적건번호 검색 — 셋 다 선택적, AND 결합.
export interface FindExportShipmentsFilter {
  styleNo?: string;
  materialName?: string;
  sheetNo?: string;
}

export const getExportShipments = (filter?: FindExportShipmentsFilter): Promise<any> =>
  apiClient.get('/export-shipments', { params: filter });

// PR-119: 수출 실적표(FINALIZED만 집계, INVOICE 일자 기간, 라인 단위 브랜드 분류).
export interface ExportPerformanceShipment {
  id: number;
  sheetNo: string | null;
  invoiceDate: string | null;
  styleNos: string[];
  brands: string[];
  buyers: string[];
  lineCount: number;
  qtyByUnit: Record<string, number>;
  amount: number;
  linesWithoutAmount: number;
}

export interface ExportPerformanceBrand {
  brand: string;
  shipmentCount: number;
  lineCount: number;
  qtyByUnit: Record<string, number>;
  amount: number;
}

export interface ExportPerformanceBuyer {
  buyer: string;
  shipmentCount: number;
  lineCount: number;
  qtyByUnit: Record<string, number>;
  amount: number;
}

export interface ExportPerformance {
  totals: { shipmentCount: number; lineCount: number; qtyByUnit: Record<string, number>; amount: number; linesWithoutAmount: number };
  byBrand: ExportPerformanceBrand[];
  byBuyer: ExportPerformanceBuyer[];
  shipments: ExportPerformanceShipment[];
  excludedNotFinalized: number;
}

export const getExportPerformance = (params?: { from?: string; to?: string }): Promise<ExportPerformance> =>
  apiClient.get('/export-shipments/performance', { params });

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

// PR-157: 환율 입력/수정 — PurchaseOrder 기준 자동계산 라인만 재계산된다(사람이 이미
// 확정한 MANUAL/MIDO_PRICE_TABLE 라인은 그대로 유지).
export const updateExportShipmentExchangeRate = (id: number, exchangeRateUsdKrw: number): Promise<any> =>
  apiClient.patch(`/export-shipments/${id}/exchange-rate`, { exchangeRateUsdKrw });

export const confirmExportShipmentLinePrice = (
  exportShipmentId: number,
  lineId: number,
  data: { source: ExportShipmentLinePriceSource; unitPriceUsd: number; midoPriceItemId?: number; priceBasisNote?: string },
): Promise<any> => apiClient.patch(`/export-shipments/${exportShipmentId}/lines/${lineId}/price`, data);

// PR-080: 기 작성된 INVOICE/Packing List 엑셀을 그대로 가져와 DRAFT로 즉시 등록한다.
// 응답에는 warnings(단위 불일치 등 조용히 무시하지 않은 경고 목록)가 함께 온다.
export const importExportShipmentFromFile = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/export-shipments/import-from-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
