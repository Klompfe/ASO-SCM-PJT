import { describe, it, expect } from 'vitest';
import { normalizeCurrency, sumByCurrency, formatTotals, formatAmount, formatAmountDefaultLocale, withCurrencyLabel, toKstDay, hasForeignCurrency } from './currency';

describe('currency 유틸 (PR-244b)', () => {
  it('normalizeCurrency: NULL/빈 값/소문자/알 수 없는 값', () => {
    expect(normalizeCurrency(null)).toBe('KRW');
    expect(normalizeCurrency(undefined)).toBe('KRW');
    expect(normalizeCurrency('')).toBe('KRW');
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(normalizeCurrency('EUR')).toBe('KRW');
  });

  it('sumByCurrency: KRW 만 / 혼합 / 빈 목록 / 문자열 숫자·비정상 값', () => {
    const items = [{ a: 1000, c: 'KRW' }, { a: '2000', c: null }, { a: 2.5, c: 'USD' }, { a: 'x', c: 'USD' }];
    expect(sumByCurrency(items.slice(0, 2), (i) => Number(i.a), (i) => i.c)).toEqual({ KRW: 3000 });
    expect(sumByCurrency(items, (i) => Number(i.a), (i) => i.c)).toEqual({ KRW: 3000, USD: 2.5 });
    expect(sumByCurrency([], () => 0, () => 'KRW')).toEqual({});
  });

  it('sumByCurrency: USD 소수 합산은 부동소수 오차 없이 표시 단계에서 2자리로 맞춰진다', () => {
    const t = sumByCurrency([0.1, 0.2], (n) => n, () => 'USD');
    expect(formatAmount(t.USD ?? 0, 'USD')).toBe('0.30');
  });

  it('formatTotals: KRW 만 있으면 기존 표기(ko-KR) 그대로, 빈 목록은 0', () => {
    expect(formatTotals({ KRW: 1234000 })).toBe((1234000).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
    expect(formatTotals({})).toBe('0');
  });

  it('formatTotals: 섞이면 통화별로 따로 — KRW 먼저, USD 소수 2자리', () => {
    expect(formatTotals({ USD: 1250, KRW: 1234000 })).toBe('KRW 1,234,000 / USD 1,250.00');
    expect(formatTotals({ USD: 12.5 })).toBe('USD 12.50');
    expect(hasForeignCurrency({ USD: 1 })).toBe(true);
    expect(hasForeignCurrency({ KRW: 1 })).toBe(false);
  });

  it('단가/금액 표시: KRW 는 이전 문자열 그대로, USD 만 접두', () => {
    expect(formatAmountDefaultLocale(1500000, 'KRW')).toBe((1500000).toLocaleString());
    expect(formatAmountDefaultLocale(1500000, null)).toBe((1500000).toLocaleString());
    expect(formatAmountDefaultLocale(25, 'USD')).toBe('USD 25.00');
    expect(withCurrencyLabel('12.5', 'KRW')).toBe('12.5');
    expect(withCurrencyLabel('12.5', 'USD')).toBe('USD 12.5');
  });

  it('toKstDay: UTC 15시 이후는 한국 기준 다음 날', () => {
    expect(toKstDay('2026-11-18T16:00:00.000Z')).toBe('2026-11-19');
    expect(toKstDay('2026-11-18T14:59:00.000Z')).toBe('2026-11-18');
    expect(toKstDay(null)).toBeNull();
  });
});
