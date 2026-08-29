import apiClient from './client';

export interface WorkOrder {
  id: number;
  status: string;
  itemId: number;
  quantity: number;
  dueDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetWorkOrdersFilter {
  page?: number;
  limit?: number;
  status?: string;
  itemId?: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateWorkOrderStatus {
  status: string;
}

export const getWorkOrders = (filter: GetWorkOrdersFilter): Promise<any> => apiClient.get('/work-orders', { params: filter });
export const updateWorkOrderStatus = (id: number, data: UpdateWorkOrderStatus): Promise<any> => apiClient.patch(`/work-orders/${id}/status`, data);
export const uploadWorkOrderImage = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/work-orders/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
