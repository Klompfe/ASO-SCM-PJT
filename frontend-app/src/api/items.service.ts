import apiClient from './client';

export interface Item {
  id: number;
  code: string;
  name: string;
  englishName?: string;
  type: string;
  unit?: string;
  spec?: string;
  description?: string;
  // PR-104: FINISHED_GOOD 타입 품목이 속한 MasterStyle.styleNo — 사람이 직접
  // 입력해야 하는 값(BOM 커밋 등 다른 경로에서 자동으로 채워지지 않음, work-orders.
  // service.ts가 재고 차감 시 이 값으로 스타일을 찾는다).
  styleNo?: string;
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
  englishName?: string;
  type: string;
  unit?: string;
  spec?: string;
  description?: string;
  styleNo?: string;
}

export type UpdateItem = Partial<CreateItem>;

export const getItems = (filter: GetItemsFilter): Promise<any> => apiClient.get('/items', { params: filter });
export const createItem = (data: CreateItem): Promise<any> => apiClient.post('/items', data);
export const updateItem = (id: number, data: UpdateItem): Promise<any> => apiClient.patch(`/items/${id}`, data);
export const uploadPreview = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/items/upload-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const bulkInsert = (data: { styleInfo: any, matrix: any, materials: any[] }, policy: 'OVERWRITE' | 'SKIP'): Promise<any> =>
  apiClient.post('/items/bulk-insert', { data, policy });
