import apiClient from './client';

// PR-182: 종류(실/테이프)가 확정돼 있으면 환산값 하나만(determined), 모르면 가능한
// 종류별 환산값을 전부(안전모드 — 자동 확정 금지) 내려준다.
export interface MeterPriceConversionOption {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  unitPriceUsd: number;
  formula: string;
  unitPriceUsdMax?: number;
  formulaMax?: string;
}

export interface MeterPriceConversionInfo {
  determined: boolean;
  options: MeterPriceConversionOption[];
  warning?: string;
}

export interface MidoPriceItem {
  id: number;
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
  note?: string | null;
  // PR-182: lineUnit이 콘/롤이고 이 후보 단위가 M일 때만 채워진다.
  conversion?: MeterPriceConversionInfo;
  // PR-188: 삭제 대신 사용 중지/재사용 토글.
  isActive: boolean;
}

// PR-157: 자재명 부분일치로 후보를 찾는다(자동 확정 없음 — 담당자가 직접 골라 연결).
// PR-182: lineUnit(라인 단위)이 콘/롤이면 콘/롤단가 환산 후보(conversion)도 함께 온다.
// materialSubType(BomItem.threadType/tapeType)이 있으면 그 종류 하나로만, 없으면
// 가능한 종류를 전부 나열한다 — 둘 다 생략하면 기존(PR-157) 동작과 동일하다.
export const findMidoPriceCandidates = (
  materialName: string,
  opts?: { lineUnit?: string; materialSubType?: string | null },
): Promise<MidoPriceItem[]> =>
  apiClient.get('/mido-price-table/candidates', {
    params: { materialName, lineUnit: opts?.lineUnit, materialSubType: opts?.materialSubType ?? undefined },
  });

// PR-188: 관리 화면 — 등록/수정(MANAGER/ADMIN)·사용중지(삭제 API 없음, isActive 토글)·
// CSV 일괄 등록(미리보기 → 선택 적용, all-or-nothing).
export const getMidoPriceItems = (includeInactive = false): Promise<MidoPriceItem[]> =>
  apiClient.get('/mido-price-table', { params: { includeInactive: includeInactive ? 'true' : undefined } });

export interface CreateMidoPriceItem {
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
  note?: string;
}
export type UpdateMidoPriceItem = Partial<CreateMidoPriceItem> & { isActive?: boolean };

export const createMidoPriceItem = (data: CreateMidoPriceItem): Promise<MidoPriceItem> =>
  apiClient.post('/mido-price-table', data);
export const updateMidoPriceItem = (id: number, data: UpdateMidoPriceItem): Promise<MidoPriceItem> =>
  apiClient.patch(`/mido-price-table/${id}`, data);

export interface MidoPriceImportPreviewRow {
  line: number;
  status: 'NEW' | 'CHANGED' | 'SAME' | 'ERROR';
  before?: { priceUsdMin: number; priceUsdMax: number; unit: string; note: string | null };
  after: { itemName: string; priceUsdMin: number | null; priceUsdMax: number | null; unit: string; note: string | null };
  errors?: string[];
}
export interface MidoPriceImportPreviewResult {
  rows: MidoPriceImportPreviewRow[];
  summary: { new: number; changed: number; same: number; error: number; total: number };
}
export const previewMidoPriceImport = (csv: string): Promise<MidoPriceImportPreviewResult> =>
  apiClient.post('/mido-price-table/import/preview', { csv });

export interface MidoPriceImportApplyRow {
  line: number;
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
  note?: string | null;
  status: 'NEW' | 'CHANGED';
}
export const applyMidoPriceImport = (rows: MidoPriceImportApplyRow[]): Promise<{ created: number; updated: number }> =>
  apiClient.post('/mido-price-table/import/apply', { rows });
