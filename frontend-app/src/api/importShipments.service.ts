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
  // PR-124: 선적 정보. pol/pod/etd/vessel은 INVOICE 엑셀에서 자동 캡처, eta(도착예정일)는 화면에서만 입력.
  pol?: string | null;
  pod?: string | null;
  etd?: string | null;
  eta?: string | null;
  vessel?: string | null;
  lines: ImportShipmentLine[];
  createdAt: string;
  updatedAt: string;
  // PR-111: 스타일번호 접두사로 조회 시점에 계산되는 값(DB 컬럼 아님).
  brand?: string | null;
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
  pol?: string;
  pod?: string;
  etd?: string;
  eta?: string;
  vessel?: string;
  lines: CreateImportShipmentLine[];
}

export interface ImportShipmentVoyage {
  pol?: string | null;
  pod?: string | null;
  etd?: string | null;
  eta?: string | null;
  vessel?: string | null;
}

// PR-102: 스타일번호/품목(자재명)/선적건번호(INVOICE 번호) 검색 — 셋 다 선택적, AND 결합.
export interface FindImportShipmentsFilter {
  styleNo?: string;
  materialName?: string;
  sheetNo?: string;
  // PR-111: 브랜드(스타일번호 접두사로 분류) 정확히 일치 필터.
  brand?: string;
}

export const getImportShipments = (filter?: FindImportShipmentsFilter): Promise<any> =>
  apiClient.get('/import-shipments', { params: filter });

export const getImportShipment = (id: number): Promise<any> => apiClient.get(`/import-shipments/${id}`);

export const createImportShipment = (data: CreateImportShipment): Promise<any> =>
  apiClient.post('/import-shipments', data);

// PR-124: 선적 일정/경로 수정(null 또는 빈 값은 지움, 보내지 않은 필드는 유지).
export const updateImportShipmentHeader = (id: number, data: ImportShipmentVoyage): Promise<any> =>
  apiClient.patch(`/import-shipments/${id}`, data);

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

// PR-107: 색상·사이즈별 상세내역 — 완제품입고증 작성의 재료가 되는 값. 엑셀
// 자동연동(DETAIL PACKING 시트)이 아직 없어 지금은 전부 MANUAL로 등록된다.
export type ImportShipmentPackingDetailSource = 'EXCEL' | 'MANUAL';

export interface ImportShipmentPackingDetail {
  id: number;
  importShipmentId: number;
  styleNo: string;
  color: string;
  size: string;
  qty: number;
  source: ImportShipmentPackingDetailSource;
  hasReceipt: boolean;
}

export interface CreatePackingDetailRow {
  color: string;
  size: string;
  qty: number;
}

export const getImportShipmentPackingDetails = (importShipmentId: number): Promise<any> =>
  apiClient.get(`/import-shipments/${importShipmentId}/packing-details`);

export const createImportShipmentPackingDetails = (
  importShipmentId: number,
  details: CreatePackingDetailRow[],
): Promise<any> => apiClient.post(`/import-shipments/${importShipmentId}/packing-details`, { details });

export const updateImportShipmentPackingDetail = (
  importShipmentId: number,
  detailId: number,
  data: Partial<CreatePackingDetailRow>,
): Promise<any> => apiClient.put(`/import-shipments/${importShipmentId}/packing-details/${detailId}`, data);

export const deleteImportShipmentPackingDetail = (importShipmentId: number, detailId: number): Promise<any> =>
  apiClient.delete(`/import-shipments/${importShipmentId}/packing-details/${detailId}`);
