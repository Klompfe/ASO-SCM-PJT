import apiClient from './client';

// PR-167: 빈폴/에잇세컨즈처럼 판매시장(국내/중국)에 따라 계약방식이 갈리는
// 브랜드는 비워둔다 — 그 외(미도/W컨셉/킴마틴/뮤트 등)는 기본 계약방식을
// 미리 정해두면 계약 승인 화면에서 제안값으로 쓸 수 있다.
export type DefaultProductionType = 'FOB' | 'CMT';

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
  defaultProductionType?: DefaultProductionType | null;
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
  defaultProductionType?: DefaultProductionType;
}

export type UpdateBuyer = Partial<CreateBuyer>;

// PR-127: keyword(고객사명/코드/브랜드약칭 부분일치, 대소문자 무시)를 주면 서버에서 검색한다. 생략하면 전체 목록(기존 동작).
export const getBuyers = (params?: { keyword?: string }): Promise<any> =>
  apiClient.get('/buyers', params?.keyword ? { params } : undefined);
export const createBuyer = (data: CreateBuyer): Promise<any> => apiClient.post('/buyers', data);
export const updateBuyer = (id: number, data: UpdateBuyer): Promise<any> =>
  apiClient.patch(`/buyers/${id}`, data);
export const deleteBuyer = (id: number): Promise<any> => apiClient.delete(`/buyers/${id}`);
