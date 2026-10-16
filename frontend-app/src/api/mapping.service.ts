import apiClient from './client';

export interface ParsedStyleOverview {
  styleNo: string;
  totalQty: number;
  factory: string;
  buyer: string;
  shipDate: string;
}

export interface ParsedBomItem {
  id: number;
  category?: string;
  itemName: string;
  consumption?: number;
  requiredQty?: number;
  colorOf?: string;
  spec?: string;
}

export interface ParsedStyleResult {
  sheetName: string;
  styleNo?: string;
  matchStatus: null;
  overview?: ParsedStyleOverview;
  bomItems?: ParsedBomItem[];
  parseError?: string;
}

export const parseMappingFile = (file: File): Promise<ParsedStyleResult[]> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/mapping/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const checkStyleExists = (styleNo: string): Promise<{ exists: boolean }> =>
  apiClient.get('/mapping/check-exists', { params: { styleNo } });

// PR-132: 응답의 notices(NEEDS_REVIEW/AUTO_APPLIED 구조화 알림)와 warnings(문자열 배열, 호환용)를 화면이 그대로 쓴다.
export type { CommitResponse, CommitNotice } from '../utils/commitNotices';
export const commitMapping = (payload: { styleNo: string; overviewData: any; bomItems: any[] }): Promise<import('../utils/commitNotices').CommitResponse> =>
  apiClient.post('/mapping/commit', payload);

// PR-198: 저장 전 "기존 BOM과 비교"(읽기 전용) — 응답 타입은 백엔드 bom-diff.util.ts의
// 분류 결과를 그대로 따른다(필드명 일치, 새 타입 재정의 없음).
export type BomDiffRowType = 'SAME' | 'VALUE_DIFF' | 'ONLY_NEW' | 'ONLY_EXISTING';

export interface BomDiffExistingRow {
  bomItemId: number;
  itemName: string;
  category: string | null;
  colorCode: string | null;
  spec: string | null;
  consumption: number;
  linkedPoCount: number;
}

export interface BomDiffIncomingRow {
  itemName: string;
  category?: string | null;
  colorCode?: string | null;
  spec?: string | null;
  consumption?: number | null;
}

export interface BomDiffRow {
  type: BomDiffRowType;
  existing?: BomDiffExistingRow;
  incoming?: BomDiffIncomingRow;
}

export interface BomSimilarPair {
  existing: BomDiffExistingRow;
  incoming: BomDiffIncomingRow;
}

export interface BomDiffResponse {
  hasExistingBom: boolean;
  rows?: BomDiffRow[];
  similarPairs?: BomSimilarPair[];
}

export const getBomDiff = (payload: { styleNo: string; bomItems: any[] }): Promise<BomDiffResponse> =>
  apiClient.post('/mapping/bom-diff', payload);

export type BomReconcileActionType = 'OVERWRITE' | 'ADD' | 'REMOVE' | 'REPLACE';

export interface BomReconcileAction {
  type: BomReconcileActionType;
  bomItemId?: number;
  newItem?: Record<string, unknown>;
}

export interface BomReconcileResult {
  styleNo: string;
  applied: { overwritten: number; added: number; removed: number; replaced: number };
  remainingBomItemCount: number;
  warnings: string[];
}

export const reconcileBom = (payload: { styleNo: string; actions: BomReconcileAction[] }): Promise<BomReconcileResult> =>
  apiClient.post('/mapping/bom-reconcile', payload);
