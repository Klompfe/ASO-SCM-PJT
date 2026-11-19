import { useEffect, useMemo, useState } from 'react';
import { fetchImportRates } from '../utils/importRateCache';
import type { RateByDate } from '../utils/krwReference';

// PR-244b: 주어진 날짜들의 수입환율(USD)을 조회해 돌려준다. 날짜 목록이 바뀔 때만 다시 조회하고,
// 같은 날짜는 모듈 캐시(importRateCache)로 한 번만 조회한다. 조회 전에는 빈 Map.
export function useImportRates(dates: readonly string[]): { rates: RateByDate; loading: boolean } {
  const key = useMemo(() => [...new Set(dates.filter(Boolean))].sort().join(','), [dates]);
  const [state, setState] = useState<{ key: string; rates: RateByDate }>({ key: '', rates: new Map() });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchImportRates(key.split(',')).then((rates) => {
      if (!cancelled) setState({ key, rates });
    });
    return () => { cancelled = true; };
  }, [key]);

  return { rates: state.rates, loading: key !== '' && state.key !== key };
}
