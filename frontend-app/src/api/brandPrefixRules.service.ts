import apiClient from './client';

export interface BrandPrefixRule {
  id: number;
  prefix: string | null;
  isNumericStart: boolean;
  brandName: string;
  note?: string | null;
  // PR-188: 'MIDO'면 이 브랜드에 미도 단가표 참고단가 후보를 보여준다.
  priceTableCode?: string | null;
  // PR-188: 이 브랜드의 수출서류 원단(FABRIC) 라인 단위 기본값(예: M) — Item.unit보다 우선.
  fabricLineUnit?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandPrefixRule {
  prefix?: string;
  isNumericStart?: boolean;
  brandName: string;
  note?: string;
  priceTableCode?: string | null;
  fabricLineUnit?: string | null;
}

export type UpdateBrandPrefixRule = Partial<CreateBrandPrefixRule>;

// PR-111: 스타일번호 접두사 → 브랜드 매핑 마스터 — 하드코딩하지 않고 화면에서
// 추가/수정 가능하게 관리한다.
export const getBrandPrefixRules = (): Promise<any> => apiClient.get('/brand-prefix-rules');
export const createBrandPrefixRule = (data: CreateBrandPrefixRule): Promise<any> =>
  apiClient.post('/brand-prefix-rules', data);
export const updateBrandPrefixRule = (id: number, data: UpdateBrandPrefixRule): Promise<any> =>
  apiClient.patch(`/brand-prefix-rules/${id}`, data);
export const deleteBrandPrefixRule = (id: number): Promise<any> => apiClient.delete(`/brand-prefix-rules/${id}`);
