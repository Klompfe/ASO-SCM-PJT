import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizeKrwReference, krwOfUsd, rateFor } from './krwReference';

vi.mock('../api/customsExchangeRates.service', () => ({ lookupCustomsExchangeRate: vi.fn() }));
import { lookupCustomsExchangeRate } from '../api/customsExchangeRates.service';
import { fetchImportRates, clearImportRateCache } from './importRateCache';

describe('환산 참고 금액 (PR-244b)', () => {
  const rates = new Map<string, number | null>([['2026-11-01', 1400], ['2026-11-08', null]]);

  it('환율 있음: 행별 반올림 합계', () => {
    expect(krwOfUsd(10.5, 1400)).toBe(14700);
    expect(summarizeKrwReference([{ usdAmount: 10, date: '2026-11-01' }, { usdAmount: 5, date: '2026-11-01' }], rates)).toEqual({ status: 'ok', krw: 21000, rates: [1400, 1400] });
  });

  it('환율 없음(found:false → null) / 날짜 없음 / 조회 전: 비운다', () => {
    expect(summarizeKrwReference([{ usdAmount: 10, date: '2026-11-08' }], rates)).toEqual({ status: 'noRate' });
    expect(summarizeKrwReference([{ usdAmount: 10, date: null }], rates)).toEqual({ status: 'noRate' });
    expect(rateFor(rates, '2026-12-01')).toBeNull();
  });

  it('일부만 없으면 환산 합계를 비운다(partial)', () => {
    expect(summarizeKrwReference([{ usdAmount: 10, date: '2026-11-01' }, { usdAmount: 5, date: '2026-11-08' }], rates)).toEqual({ status: 'partial' });
  });

  it('USD 행이 없으면 none', () => {
    expect(summarizeKrwReference([], rates)).toEqual({ status: 'none' });
  });
});

describe('수입환율 조회 캐시 (PR-244b)', () => {
  beforeEach(() => { clearImportRateCache(); vi.mocked(lookupCustomsExchangeRate).mockReset(); });

  it('같은 날짜는 한 번만 조회한다(N+1 방지), 수입(IMPORT)·USD 로 조회한다', async () => {
    vi.mocked(lookupCustomsExchangeRate).mockResolvedValue({ found: true, rate: 1390 });
    const m = await fetchImportRates(['2026-11-01', '2026-11-01', '2026-11-01']);
    await fetchImportRates(['2026-11-01']);
    expect(lookupCustomsExchangeRate).toHaveBeenCalledTimes(1);
    expect(lookupCustomsExchangeRate).toHaveBeenCalledWith({ rateType: 'IMPORT', currency: 'USD', date: '2026-11-01' });
    expect(m.get('2026-11-01')).toBe(1390);
  });

  it('found:false 면 직전 구간 참고값이 있어도 null(자동 적용 안 함)', async () => {
    vi.mocked(lookupCustomsExchangeRate).mockResolvedValue({ found: false, previous: { rate: 1300, validFrom: 'a', validTo: 'b' } });
    expect((await fetchImportRates(['2026-12-01'])).get('2026-12-01')).toBeNull();
  });

  it('조회 실패는 null 이고 캐시하지 않아 다시 조회할 수 있다', async () => {
    vi.mocked(lookupCustomsExchangeRate).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ found: true, rate: 1380 });
    expect((await fetchImportRates(['2026-11-02'])).get('2026-11-02')).toBeNull();
    expect((await fetchImportRates(['2026-11-02'])).get('2026-11-02')).toBe(1380);
  });
});
