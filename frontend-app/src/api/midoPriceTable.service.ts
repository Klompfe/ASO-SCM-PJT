import apiClient from './client';

export interface MidoPriceItem {
  id: number;
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
  note?: string | null;
}

// PR-157: 자재명 부분일치로 후보를 찾는다(자동 확정 없음 — 담당자가 직접 골라 연결).
export const findMidoPriceCandidates = (materialName: string): Promise<MidoPriceItem[]> =>
  apiClient.get('/mido-price-table/candidates', { params: { materialName } });
