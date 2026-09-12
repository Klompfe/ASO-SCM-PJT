import apiClient from './client';

export interface Buyer {
  id: number;
  code: string;
  name: string;
  contactPerson: string;
  contactPhone: string;
  email?: string;
  country: string;
  address?: string;
}

export interface CreateBuyer {
  code: string;
  name: string;
  contactPerson: string;
  contactPhone: string;
  email?: string;
  country: string;
  address?: string;
}

export type UpdateBuyer = Partial<CreateBuyer>;

export const getBuyers = (): Promise<any> => apiClient.get('/buyers');
export const createBuyer = (data: CreateBuyer): Promise<any> => apiClient.post('/buyers', data);
export const updateBuyer = (id: number, data: UpdateBuyer): Promise<any> =>
  apiClient.patch(`/buyers/${id}`, data);
export const deleteBuyer = (id: number): Promise<any> => apiClient.delete(`/buyers/${id}`);
