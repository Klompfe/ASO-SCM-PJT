import apiClient from './client';

// PR-184: 관세청 주간환율(수출/수입) — 유니패스 크롤링/Open API 연동은 범위 밖. 담당자가
// 매주 화면에서 직접 입력하고, 이 값은 "추천/참고"로만 쓰인다(자동 확정 없음).
export type ExchangeRateType = 'EXPORT' | 'IMPORT';

export interface CustomsExchangeRate {
  id: number;
  rateType: ExchangeRateType;
  currency: string;
  validFrom: string;
  validTo: string;
  rate: number;
  note?: string | null;
}

export interface CreateCustomsExchangeRate {
  rateType: ExchangeRateType;
  currency?: string;
  validFrom: string;
  validTo: string;
  rate: number;
  note?: string;
}

export type UpdateCustomsExchangeRate = Partial<CreateCustomsExchangeRate>;

export interface ExchangeRateLookupResult {
  found: boolean;
  rate?: number;
  validFrom?: string;
  validTo?: string;
  rateType?: ExchangeRateType;
  previous?: { rate: number; validFrom: string; validTo: string } | null;
}

export interface ExchangeRateStatus {
  date: string;
  EXPORT: ExchangeRateLookupResult;
  IMPORT: ExchangeRateLookupResult;
}

export const getCustomsExchangeRates = (params?: { rateType?: ExchangeRateType; currency?: string; page?: number; limit?: number }): Promise<any> =>
  apiClient.get('/customs-exchange-rates', { params });
export const createCustomsExchangeRate = (data: CreateCustomsExchangeRate): Promise<any> =>
  apiClient.post('/customs-exchange-rates', data);
export const updateCustomsExchangeRate = (id: number, data: UpdateCustomsExchangeRate): Promise<any> =>
  apiClient.patch(`/customs-exchange-rates/${id}`, data);
export const deleteCustomsExchangeRate = (id: number): Promise<any> => apiClient.delete(`/customs-exchange-rates/${id}`);

export const lookupCustomsExchangeRate = (params: { rateType: ExchangeRateType; currency?: string; date: string }): Promise<ExchangeRateLookupResult> =>
  apiClient.get('/customs-exchange-rates/lookup', { params });

export const getCustomsExchangeRateStatus = (params?: { currency?: string; date?: string }): Promise<ExchangeRateStatus> =>
  apiClient.get('/customs-exchange-rates/status', { params });
