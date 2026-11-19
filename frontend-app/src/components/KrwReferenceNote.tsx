import React from 'react';
import { formatAmount } from '../utils/currency';
import { NO_RATE_MESSAGE, PARTIAL_RATE_MESSAGE, rateFor, summarizeKrwReference, type RateByDate, type UsdRow } from '../utils/krwReference';

// PR-244b: USD 행/합계 옆의 "원화 환산 참고" — 표시 전용(저장 안 함). 환율은 발주일이 속한 구간의
// 등록환율(수입 구분)이고, 구간에 환율이 없으면 환산 금액을 비우고 사유를 보여 준다(자동 적용 없음).
const muted = 'block text-xs text-gray-500';
const warn = 'block text-xs text-amber-700';

// 한 행(한 발주)의 환산 참고.
export const KrwReferenceNote: React.FC<{ usd: number; date: string | null; rates: RateByDate }> = ({ usd, date, rates }) => {
  if (date && !rates.has(date)) return null; // 아직 조회 전
  const rate = rateFor(rates, date);
  if (rate == null) return <span className={warn} data-testid="krw-ref-norate">{NO_RATE_MESSAGE}</span>;
  return (
    <span className={muted} data-testid="krw-ref">
      ≈ 원화 환산 참고 ₩{Math.round(usd * rate).toLocaleString('ko-KR')} (수입환율 {formatAmount(rate, 'KRW')}, 기준일 {date} 발주일)
    </span>
  );
};

// 여러 USD 행의 환산 합계 참고 — 모든 USD 행에 환율이 있을 때만 값을 낸다.
export const KrwReferenceTotal: React.FC<{ rows: readonly UsdRow[]; rates: RateByDate }> = ({ rows, rates }) => {
  if (rows.some((r) => r.date && !rates.has(r.date))) return null; // 조회 전
  const ref = summarizeKrwReference(rows, rates);
  if (ref.status === 'none') return null;
  if (ref.status === 'noRate') return <span className={warn} data-testid="krw-ref-total-norate">{NO_RATE_MESSAGE}</span>;
  if (ref.status === 'partial') return <span className={warn} data-testid="krw-ref-total-partial">{PARTIAL_RATE_MESSAGE} — 환산 합계를 표시하지 않습니다</span>;
  return (
    <span className={muted} data-testid="krw-ref-total">
      ≈ 원화 환산 참고 ₩{ref.krw.toLocaleString('ko-KR')} (수입환율·발주일 기준)
    </span>
  );
};
