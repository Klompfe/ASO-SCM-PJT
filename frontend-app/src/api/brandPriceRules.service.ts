import apiClient from './client';

// PR-185: 브랜드 전용가(예: 뮤트 겉감 $1.00/YD) — 미도 단가표보다 우선하는 고정가.
export interface BrandPriceRule {
  id: number;
  brandName: string;
  categoryKeyword: string;
  priceUsd: number;
  unit: string;
  note?: string | null;
  isActive: boolean;
}

export interface CreateBrandPriceRule {
  brandName: string;
  categoryKeyword: string;
  priceUsd: number;
  unit: string;
  note?: string;
  isActive?: boolean;
}

export type UpdateBrandPriceRule = Partial<CreateBrandPriceRule>;

export const getBrandPriceRules = (): Promise<any> => apiClient.get('/brand-price-rules');
export const createBrandPriceRule = (data: CreateBrandPriceRule): Promise<any> => apiClient.post('/brand-price-rules', data);
export const updateBrandPriceRule = (id: number, data: UpdateBrandPriceRule): Promise<any> => apiClient.patch(`/brand-price-rules/${id}`, data);
export const deleteBrandPriceRule = (id: number): Promise<any> => apiClient.delete(`/brand-price-rules/${id}`);
