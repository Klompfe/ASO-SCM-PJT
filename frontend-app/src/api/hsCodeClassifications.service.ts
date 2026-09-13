import apiClient from './client';

export interface HsCodeClassification {
  id: number;
  itemType: string;
  fabricType: string;
  composition: string;
  hsCode: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HsCodeClassificationsPage {
  items: HsCodeClassification[];
  total: number;
  page: number;
  limit: number;
}

export interface HsCodeImportConflict {
  itemType: string;
  fabricType: string;
  composition: string;
  previousHsCode: string;
  newHsCode: string;
}

export interface HsCodeImportResult {
  totalRows: number;
  created: number;
  updated: number;
  conflicts: HsCodeImportConflict[];
}

export interface CreateHsCodeClassification {
  itemType: string;
  fabricType: string;
  composition: string;
  hsCode: string;
  note?: string;
}

export interface GetHsCodeClassificationsFilter {
  itemType?: string;
  fabricType?: string;
  composition?: string;
  page?: number;
  limit?: number;
}

export const getHsCodeClassifications = (
  filter?: GetHsCodeClassificationsFilter,
): Promise<any> => apiClient.get('/hs-code-classifications', { params: filter });

export const createHsCodeClassification = (data: CreateHsCodeClassification): Promise<any> =>
  apiClient.post('/hs-code-classifications', data);

export const uploadHsCodeClassifications = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/hs-code-classifications/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
