import apiClient from './client';

export type CashVoucherType = 'DEPOSIT' | 'WITHDRAWAL';

export interface CashVoucher {
  id: number;
  voucherType: CashVoucherType;
  voucherDate: string;
  amount: number;
  counterpartyName: string;
  counterpartyBuyerId: number | null;
  counterpartySupplierId: number | null;
  account: string;
  category: string;
  relatedPurchaseOrderId: number | null;
  relatedProductionContractId: number | null;
  note: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashVoucher {
  voucherType: CashVoucherType;
  voucherDate: string;
  amount: number;
  counterpartyName: string;
  counterpartyBuyerId?: number;
  counterpartySupplierId?: number;
  account: string;
  category: string;
  relatedPurchaseOrderId?: number;
  relatedProductionContractId?: number;
  note?: string;
}

export interface CashVoucherFilter {
  from?: string;
  to?: string;
  voucherType?: CashVoucherType;
}

export interface CashVoucherSummary {
  depositTotal: number;
  withdrawalTotal: number;
  balance: number;
}

export const getCashVouchers = (filter?: CashVoucherFilter): Promise<any> =>
  apiClient.get('/cash-vouchers', { params: filter });

export const getCashVoucherSummary = (from?: string, to?: string): Promise<any> =>
  apiClient.get('/cash-vouchers/summary', { params: { from, to } });

export const createCashVoucher = (data: CreateCashVoucher): Promise<any> =>
  apiClient.post('/cash-vouchers', data);

export const deleteCashVoucher = (id: number): Promise<any> => apiClient.delete(`/cash-vouchers/${id}`);
