import { calculateUsdValueFromKrw, calculateUsdValueForPo } from './invoice-value.util';

describe('calculateUsdValueForPo (PR-244a — 통화 가드)', () => {
  it('[재현] 통화를 안 보는 KRW 환산에 USD 단가를 넣으면 환율로 나눠 금액이 환율 배수만큼 줄어든다', () => {
    expect(calculateUsdValueFromKrw(2.5, 10, 1500)).toEqual({ unitPriceUsd: 0.0017, amountUsd: 0.017 });
  });

  it('KRW / NULL / undefined / 빈 값 / 소문자·공백 통화는 기존 함수와 완전히 같은 결과(회귀)', () => {
    for (const cur of ['KRW', null, undefined, '', ' krw ']) {
      for (const [price, qty, rate] of [[1500, 10, 1500], [3333, 7, 1387.5], [0.5, 1000, 1300]] as const) {
        expect(calculateUsdValueForPo(price, cur, qty, rate)).toEqual(calculateUsdValueFromKrw(price, qty, rate));
      }
    }
    expect(calculateUsdValueForPo(null, 'KRW', 10, 1500)).toBeNull();
    expect(calculateUsdValueForPo(1500, 'KRW', 10, null)).toBeNull();
  });

  it('USD 는 환산하지 않고 단가를 그대로 USD 단가로 쓴다(환율이 없어도·있어도 같다)', () => {
    expect(calculateUsdValueForPo(2.5, 'USD', 10, 1500)).toEqual({ unitPriceUsd: 2.5, amountUsd: 25 });
    expect(calculateUsdValueForPo(2.5, 'usd', 10, null)).toEqual({ unitPriceUsd: 2.5, amountUsd: 25 });
    expect(calculateUsdValueForPo('2.5' as any, 'USD', 4, 1500)).toEqual({ unitPriceUsd: 2.5, amountUsd: 10 });
  });

  it('USD 인데 단가가 없으면 null', () => {
    expect(calculateUsdValueForPo(null, 'USD', 10, 1500)).toBeNull();
  });
});
