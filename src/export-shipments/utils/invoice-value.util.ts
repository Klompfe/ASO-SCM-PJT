// PR-157: INVOICE 밸류(USD) 계산 — PurchaseOrder.unitPrice(원화) × 수량 ÷ 환율.
// 환율이나 원화단가가 없으면 계산하지 않고 null(호출 측이 "수동 확인 필요"로 표시).
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export interface UsdValueResult {
  unitPriceUsd: number;
  amountUsd: number;
}

export function calculateUsdValueFromKrw(
  unitPriceKrw: number | null | undefined,
  qty: number,
  exchangeRateUsdKrw: number | null | undefined,
): UsdValueResult | null {
  if (unitPriceKrw == null || exchangeRateUsdKrw == null || exchangeRateUsdKrw <= 0) return null;
  const unitPriceUsd = round4(unitPriceKrw / exchangeRateUsdKrw);
  return { unitPriceUsd, amountUsd: round4(unitPriceUsd * qty) };
}

// 미도 단가표(USD)는 환율을 거꾸로 적용해 원화 환산을 함께 보여주면 담당자가 판단하기
// 쉽다(요구사항 4) — 계산만 하고 저장은 호출 측 책임.
export function convertUsdToKrw(
  amountUsd: number,
  exchangeRateUsdKrw: number | null | undefined,
): number | null {
  if (exchangeRateUsdKrw == null || exchangeRateUsdKrw <= 0) return null;
  return Math.round(amountUsd * exchangeRateUsdKrw);
}
