import apiClient from './client';

export interface Buyer {
  id: number;
  code: string;
  name: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  email?: string;
  country?: string | null;
  address?: string;
  brandCode?: string | null;
}

// PR-085: code는 더 이상 클라이언트가 보내지 않는다(서버가 "TY-{브랜드약칭}-
// {YY}{일련번호4자리}" 형식으로 자동채번). 고객사명만 있으면 등록 가능하도록
// 담당자/연락처/국가는 선택으로 바뀌었다.
export interface CreateBuyer {
  name: string;
  contactPerson?: string;
  contactPhone?: string;
  email?: string;
  country?: string;
  address?: string;
  brandCode?: string;
}

export type UpdateBuyer = Partial<CreateBuyer>;

export const getBuyers = (): Promise<any> => apiClient.get('/buyers');
export const createBuyer = (data: CreateBuyer): Promise<any> => apiClient.post('/buyers', data);
export const updateBuyer = (id: number, data: UpdateBuyer): Promise<any> =>
  apiClient.patch(`/buyers/${id}`, data);
export const deleteBuyer = (id: number): Promise<any> => apiClient.delete(`/buyers/${id}`);
