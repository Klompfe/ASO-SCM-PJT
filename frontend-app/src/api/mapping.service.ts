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

export const commitMapping = (payload: { styleNo: string; overviewData: any; bomItems: any[] }): Promise<any> =>
  apiClient.post('/mapping/commit', payload);
