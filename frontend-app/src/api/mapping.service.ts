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
  // PR-248: 엑셀 "혼용률/중량" 열에서 읽은 문구(없으면 필드 자체가 없음).
  composition?: string;
}

export interface ParsedStyleResult {
  sheetName: string;
  styleNo?: string;
  matchStatus: null;
  overview?: ParsedStyleOverview;
  bomItems?: ParsedBomItem[];
  parseError?: string;
  // PR-248: 파서 안내(예: 혼용률 문구가 너무 길어 비움) — 오류가 아니다.
  warnings?: string[];
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

// PR-259: 겉감 행 일괄 보충(서버 PR-258) — 스타일 하나씩. 응답은 해석하지 않고 그대로 돌려준다(화면의 outerFabricSupplement.ts 가 엄격하게 해석 — 알 수 없으면 "확인 필요").
// 인터셉터가 이미 응답 본문을 풀어 돌려주므로 여기서 다시 .data 를 꺼내지 않는다. 요청마다 시간 제한(무료 서버 콜드 스타트를 고려).
export const OUTER_FABRIC_CHECK_TIMEOUT_MS = 60_000;
export const OUTER_FABRIC_RUN_TIMEOUT_MS = 90_000;
export const checkOuterFabricSupplement = (payload: { styleNo: string; bomItems: unknown[] }): Promise<unknown> =>
  apiClient.post('/mapping/outer-fabric-supplement/check', payload, { timeout: OUTER_FABRIC_CHECK_TIMEOUT_MS });
export const runOuterFabricSupplement = (payload: { styleNo: string; bomItems: unknown[] }): Promise<unknown> =>
  apiClient.post('/mapping/outer-fabric-supplement', payload, { timeout: OUTER_FABRIC_RUN_TIMEOUT_MS });

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
  composition?: string | null;
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
