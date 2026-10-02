import { calculateUsdValueFromKrw, convertUsdToKrw } from './invoice-value.util';

describe('calculateUsdValueFromKrw (PR-157)', () => {
  it('원화단가 ÷ 환율 = USD 단가, × 수량 = USD 금액', () => {
    const r = calculateUsdValueFromKrw(1300, 100, 1300);
    expect(r).toEqual({ unitPriceUsd: 1, amountUsd: 100 });
  });

  it('소수점은 4자리까지 반올림한다', () => {
    const r = calculateUsdValueFromKrw(1000, 3, 1387.5);
    expect(r!.unitPriceUsd).toBeCloseTo(0.7207, 4);
  });

  it('원화단가가 없으면 계산하지 않고 null(추측 금지)', () => {
    expect(calculateUsdValueFromKrw(null, 10, 1300)).toBeNull();
    expect(calculateUsdValueFromKrw(undefined, 10, 1300)).toBeNull();
  });

  it('환율이 없거나 0 이하이면 계산하지 않고 null', () => {
    expect(calculateUsdValueFromKrw(1000, 10, null)).toBeNull();
    expect(calculateUsdValueFromKrw(1000, 10, 0)).toBeNull();
    expect(calculateUsdValueFromKrw(1000, 10, -1)).toBeNull();
  });
});

describe('convertUsdToKrw (PR-157)', () => {
  it('USD × 환율 = 원화(반올림)', () => {
    expect(convertUsdToKrw(1, 1300)).toBe(1300);
    expect(convertUsdToKrw(2.5, 1300.4)).toBe(3251);
  });

  it('환율이 없으면 null', () => {
    expect(convertUsdToKrw(1, null)).toBeNull();
    expect(convertUsdToKrw(1, 0)).toBeNull();
  });
});
