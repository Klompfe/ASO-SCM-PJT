import apiClient from './client';

export interface StatusCode {
  id: number;
  domain: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStatusCode {
  domain: string;
  code: string;
  label: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateStatusCode = Partial<Pick<StatusCode, 'label' | 'sortOrder' | 'isActive'>>;

// PR-140: 상태코드 마스터 테이블 — 필터 드롭다운(기본: 활성만)과 관리 화면(includeInactive로
// 비활성도 함께 조회) 양쪽이 쓴다.
export const getStatusCodes = (domain: string, includeInactive = false): Promise<any> =>
  apiClient.get('/status-codes', { params: { domain, ...(includeInactive ? { includeInactive: 'true' } : {}) } });
export const createStatusCode = (data: CreateStatusCode): Promise<any> => apiClient.post('/status-codes', data);
export const updateStatusCode = (id: number, data: UpdateStatusCode): Promise<any> => apiClient.patch(`/status-codes/${id}`, data);
export const deleteStatusCode = (id: number): Promise<any> => apiClient.delete(`/status-codes/${id}`);
