import apiClient from './client';

export interface Supplier {
  id: number;
  code: string;
  name: string;
  businessNumber?: string;
  contactPhone?: string;
  email?: string;
  address?: string;
}

export interface CreateSupplier {
  code: string;
  name: string;
  businessNumber?: string;
  contactPhone?: string;
  email?: string;
  address?: string;
}

export type UpdateSupplier = Partial<CreateSupplier>;

export const getSuppliers = (): Promise<any> => apiClient.get('/suppliers');
export const createSupplier = (data: CreateSupplier): Promise<any> => apiClient.post('/suppliers', data);
export const updateSupplier = (id: number, data: UpdateSupplier): Promise<any> =>
  apiClient.patch(`/suppliers/${id}`, data);
export const deleteSupplier = (id: number): Promise<any> => apiClient.delete(`/suppliers/${id}`);
