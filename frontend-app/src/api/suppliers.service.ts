import apiClient from './client';

// PR-171: 공급업체 "주요품목" — Supplier<->Item 다대다 관계의 요약 정보(id+name 정도).
export interface SupplierMainItem {
  id: number;
  name: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  businessNumber?: string;
  contactPhone?: string;
  email?: string;
  address?: string;
  abbrCode?: string | null;
  mainItems?: SupplierMainItem[];
  // PR-183: 취급 품목군(칩으로 고르는 새 방식).
  categories?: { id: number; name: string }[];
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
  // PR-171: 주요품목(Item.id) 목록 — 비우면(undefined/[]) 선택 안 함.
  mainItemIds?: number[];
  // PR-183: 취급 품목군(MaterialCategory.id) 목록 — undefined=변경 없음, []=전부 해제.
  categoryIds?: number[];
}

export type UpdateSupplier = Partial<CreateSupplier>;

// PR-126: keyword(업체명/코드/약칭 부분일치, 대소문자 무시)를 주면 서버에서 검색한다. 생략하면 전체 목록(기존 동작).
// PR-183: categoryId를 주면 그 품목군을 취급하는 업체만 돌려준다(발주 폼 필터).
export const getSuppliers = (params?: { keyword?: string; categoryId?: number }): Promise<any> => {
  const query = {
    ...(params?.keyword ? { keyword: params.keyword } : {}),
    ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
  };
  return apiClient.get('/suppliers', Object.keys(query).length ? { params: query } : undefined);
};
export const createSupplier = (data: CreateSupplier): Promise<any> => apiClient.post('/suppliers', data);
export const updateSupplier = (id: number, data: UpdateSupplier): Promise<any> =>
  apiClient.patch(`/suppliers/${id}`, data);
export const deleteSupplier = (id: number): Promise<any> => apiClient.delete(`/suppliers/${id}`);
