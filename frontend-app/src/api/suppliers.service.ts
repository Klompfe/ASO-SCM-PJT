import apiClient from './client';

export interface Supplier {
  id: number;
  code: string;
  name: string;
  businessNumber?: string;
  contactPhone?: string;
  email?: string;
  address?: string;
  abbrCode?: string | null;
}

// PR-088: code는 더 이상 클라이언트가 보내지 않는다(서버가 "TY-{업체약칭}-
// {YY}{일련번호4자리}" 형식으로 자동채번).
export interface CreateSupplier {
  name: string;
  businessNumber?: string;
  contactPhone?: string;
  email?: string;
  address?: string;
  abbrCode?: string;
}

export type UpdateSupplier = Partial<CreateSupplier>;

// PR-126: keyword(업체명/코드/약칭 부분일치, 대소문자 무시)를 주면 서버에서 검색한다. 생략하면 전체 목록(기존 동작).
export const getSuppliers = (params?: { keyword?: string }): Promise<any> =>
  apiClient.get('/suppliers', params?.keyword ? { params } : undefined);
export const createSupplier = (data: CreateSupplier): Promise<any> => apiClient.post('/suppliers', data);
export const updateSupplier = (id: number, data: UpdateSupplier): Promise<any> =>
  apiClient.patch(`/suppliers/${id}`, data);
export const deleteSupplier = (id: number): Promise<any> => apiClient.delete(`/suppliers/${id}`);
