// PR-244b: 발주일별 수입환율(USD) 조회 — 같은 날짜는 한 번만 조회하고 캐시한다(N+1 금지).
// found:false 면 null(직전 구간 참고값은 자동 적용하지 않는다). 조회 실패도 null(환율 없음 표시).
import { lookupCustomsExchangeRate } from '../api/customsExchangeRates.service';
import type { RateByDate } from './krwReference';

const cache = new Map<string, Promise<number | null>>();

export const clearImportRateCache = () => cache.clear();

export function fetchImportRate(date: string): Promise<number | null> {
  let p = cache.get(date);
  if (!p) {
    p = lookupCustomsExchangeRate({ rateType: 'IMPORT', currency: 'USD', date })
      .then((res) => (res?.found && typeof res.rate === 'number' && res.rate > 0 ? res.rate : null))
      .catch(() => {
        cache.delete(date); // 일시 오류는 다음에 다시 조회할 수 있게 캐시하지 않는다.
        return null;
      });
    cache.set(date, p);
  }
  return p;
}

export async function fetchImportRates(dates: readonly string[]): Promise<RateByDate> {
  const unique = [...new Set(dates.filter(Boolean))];
  const entries = await Promise.all(unique.map(async (d) => [d, await fetchImportRate(d)] as const));
  return new Map(entries);
}
