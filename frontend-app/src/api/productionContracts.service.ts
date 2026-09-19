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

export const getProductionContracts = (params?: { from?: string; to?: string }): Promise<any> =>
  apiClient.get('/production-contracts', { params });
export const createProductionContract = (data: CreateProductionContract): Promise<any> =>
  apiClient.post('/production-contracts', data);
export const deleteProductionContract = (id: number): Promise<any> =>
  apiClient.delete(`/production-contracts/${id}`);
