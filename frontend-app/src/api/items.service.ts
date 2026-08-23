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
