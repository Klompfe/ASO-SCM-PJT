import apiClient from './client';

export interface Item {
  id: number;
  code: string;
  name: string;
  type: string;
  unit?: string;
  spec?: string;
  description?: string;
}

export interface GetItemsFilter {
  page?: number;
  limit?: number;
  type?: string;
  keyword?: string;
}

export interface CreateItem {
  code: string;
  name: string;
  type: string;
  unit?: string;
  spec?: string;
  description?: string;
}

export const getItems = (filter: GetItemsFilter): Promise<any> => apiClient.get('/items', { params: filter });
export const createItem = (data: CreateItem): Promise<any> => apiClient.post('/items', data);
export const uploadPreview = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/items/upload-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const bulkInsert = (data: { styleInfo: any, matrix: any, materials: any[] }, policy: 'OVERWRITE' | 'SKIP'): Promise<any> =>
  apiClient.post('/items/bulk-insert', { data, policy });
