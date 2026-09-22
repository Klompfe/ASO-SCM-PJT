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
