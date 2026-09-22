import apiClient from './client';

export type ProductionContractPriceSource = 'PRE_AGREED' | 'CMT_INVOICE';
export type ProductionContractPriceStatus = 'CONFIRMED' | 'PENDING_CMT_INVOICE';

export interface ProductionContract {
  id: number;
  styleNo: string;
  manufacturerId: number;
  manufacturer?: { id: number; name: string; code: string };
  priceSource: ProductionContractPriceSource;
  cmtPrice: number | null;
  priceStatus: ProductionContractPriceStatus;
  quantity: number;
  contractDate: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionContract {
  styleNo: string;
  manufacturerId: number;
  priceSource: ProductionContractPriceSource;
  // PRE_AGREED일 때만 보낸다 — CMT_INVOICE면 서버가 생성 시점 cmtPrice를 거부한다(PR-093).
  cmtPrice?: number;
  quantity: number;
  contractDate: string;
  note?: string;
}

// PR-127: keyword(스타일번호/제조사명 부분일치)와 page/limit(선택 — 생략하면 전량)를 지원한다. 응답은 계속 배열.
export interface GetProductionContractsFilter {
  from?: string;
  to?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}

export const getProductionContracts = (params?: GetProductionContractsFilter): Promise<any> =>
  apiClient.get('/production-contracts', { params });
export const createProductionContract = (data: CreateProductionContract): Promise<any> =>
  apiClient.post('/production-contracts', data);
export const deleteProductionContract = (id: number): Promise<any> =>
  apiClient.delete(`/production-contracts/${id}`);
