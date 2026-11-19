// PR-244b: USD 금액의 원화 환산 "참고" 금액 — 표시 전용(저장 금지). 환율은 등록환율(수입 구분)에서
// 발주일이 속한 구간의 값만 쓴다. 구간에 환율이 없으면 직전 구간 값을 자동 적용하지 않고 비운다.
import type { Currency } from './currency';

export const NO_RATE_MESSAGE = '환율 없음 — 마스터·설정 > 주간 환율에서 등록해 주세요';
export const PARTIAL_RATE_MESSAGE = '일부 행 환율 없음';

// 날짜 → 환율(없으면 null). 조회 전이면 키가 없다(undefined).
export type RateByDate = ReadonlyMap<string, number | null>;

export interface UsdRow {
  usdAmount: number;
  // 환율 기준일(발주일, YYYY-MM-DD). 없으면 환율을 알 수 없는 행.
  date: string | null;
}

export type KrwReference =
  | { status: 'none' } // USD 행 없음
  | { status: 'ok'; krw: number; rates: number[] }
  | { status: 'noRate' } // 모든 USD 행에 환율 없음
  | { status: 'partial' }; // 일부만 없음 → 환산 합계를 비운다

export const rateFor = (rates: RateByDate, date: string | null): number | null => {
  if (!date) return null;
  const r = rates.get(date);
  return r != null && Number.isFinite(r) && r > 0 ? r : null;
};

// 한 행의 환산(원, 반올림). 환율 없으면 null.
export function krwOfUsd(usdAmount: number, rate: number | null): number | null {
  return rate == null ? null : Math.round(usdAmount * rate);
}

// 여러 USD 행의 환산 합계 — 모든 행에 환율이 있을 때만 값을 낸다.
export function summarizeKrwReference(rows: readonly UsdRow[], rates: RateByDate): KrwReference {
  if (rows.length === 0) return { status: 'none' };
  let krw = 0;
  let missing = 0;
  const used: number[] = [];
  for (const r of rows) {
    const rate = rateFor(rates, r.date);
    if (rate == null) { missing += 1; continue; }
    krw += Math.round(r.usdAmount * rate);
    used.push(rate);
  }
  if (missing === 0) return { status: 'ok', krw, rates: used };
  return missing === rows.length ? { status: 'noRate' } : { status: 'partial' };
}

export function isUsd(c: Currency | string | null | undefined): boolean {
  return String(c ?? '').trim().toUpperCase() === 'USD';
}
