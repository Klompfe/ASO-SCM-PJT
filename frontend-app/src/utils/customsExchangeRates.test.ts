import { describe, it, expect } from 'vitest';
import {
  suggestValidTo,
  suggestValidFrom,
  shouldShowWeeklyRatePopup,
  markPopupDismissedThisSession,
  wasPopupDismissedThisSession,
  canEnterWeeklyRate,
  formatRateRange,
  formatPreviousHint,
  sourceLabel,
  buildInvoiceRateBadge,
} from './customsExchangeRates';
import type { ExchangeRateStatus } from '../api/customsExchangeRates.service';

describe('suggestValidTo', () => {
  it('시작일+6일을 제안한다', () => {
    expect(suggestValidTo('2026-10-05')).toBe('2026-10-11');
  });
  it('월을 넘어가는 경우도 올바르게 계산한다', () => {
    expect(suggestValidTo('2026-10-28')).toBe('2026-11-03');
  });
});

describe('suggestValidFrom', () => {
  it('직전 주가 없으면 오늘을 쓴다', () => {
    expect(suggestValidFrom(null, '2026-10-12')).toBe('2026-10-12');
  });
  it('직전 주 validTo+1일이 오늘보다 이전이면 그 날을 쓴다', () => {
    expect(suggestValidFrom({ validTo: '2026-10-04' }, '2026-10-12')).toBe('2026-10-05');
  });
  it('직전 주 validTo+1일이 오늘이거나 이후면 오늘을 쓴다(공백 기간을 만들지 않음)', () => {
    expect(suggestValidFrom({ validTo: '2026-10-11' }, '2026-10-12')).toBe('2026-10-12');
    expect(suggestValidFrom({ validTo: '2026-10-20' }, '2026-10-12')).toBe('2026-10-12');
  });
});

describe('shouldShowWeeklyRatePopup', () => {
  const found = { found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' } as const;
  const notFound = { found: false, previous: null } as const;

  it('상태가 없으면(조회 실패) 띄우지 않는다', () => {
    expect(shouldShowWeeklyRatePopup(null)).toBe(false);
  });
  it('둘 다 있으면 띄우지 않는다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: found, IMPORT: found };
    expect(shouldShowWeeklyRatePopup(status)).toBe(false);
  });
  it('수출만 없으면 띄운다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: notFound, IMPORT: found };
    expect(shouldShowWeeklyRatePopup(status)).toBe(true);
  });
  it('수입만 없으면 띄운다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: found, IMPORT: notFound };
    expect(shouldShowWeeklyRatePopup(status)).toBe(true);
  });
  it('둘 다 없으면 띄운다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: notFound, IMPORT: notFound };
    expect(shouldShowWeeklyRatePopup(status)).toBe(true);
  });
});

describe('세션 동안 "나중에" 기억(이 테스트 환경엔 sessionStorage가 없어 메모리 폴백 경로를 검증한다)', () => {
  it('닫으면 그 뒤로는 true다(sessionStorage가 없는 환경에서도 메모리로 기억)', () => {
    expect(wasPopupDismissedThisSession()).toBe(false);
    markPopupDismissedThisSession();
    expect(wasPopupDismissedThisSession()).toBe(true);
  });
});

describe('canEnterWeeklyRate', () => {
  it('MANAGER/ADMIN만 입력 가능', () => {
    expect(canEnterWeeklyRate('MANAGER')).toBe(true);
    expect(canEnterWeeklyRate('ADMIN')).toBe(true);
    expect(canEnterWeeklyRate('USER')).toBe(false);
    expect(canEnterWeeklyRate(null)).toBe(false);
  });
});

describe('표시 문구', () => {
  it('formatRateRange', () => {
    expect(formatRateRange({ rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' })).toBe('1,343 (2026-10-05~2026-10-11)');
  });
  it('formatPreviousHint는 previous가 없으면 null', () => {
    expect(formatPreviousHint({ found: false, previous: null })).toBeNull();
    expect(formatPreviousHint(null)).toBeNull();
  });
  it('formatPreviousHint는 previous가 있으면 참고 문구를 만든다', () => {
    expect(formatPreviousHint({ found: false, previous: { rate: 1300, validFrom: '2026-09-28', validTo: '2026-10-04' } }))
      .toBe('직전 등록 주: 1,300 (2026-09-28~2026-10-04) (참고)');
  });
  it('sourceLabel', () => {
    expect(sourceLabel('CUSTOMS_WEEKLY_EXPORT')).toBe('관세청 주간환율(수출) 적용');
    expect(sourceLabel('CUSTOMS_WEEKLY_IMPORT')).toBe('관세청 주간환율(수입) 적용');
    expect(sourceLabel('MANUAL')).toBe('수동 입력');
    expect(sourceLabel(null)).toBe('출처 미기록');
    expect(sourceLabel(undefined)).toBe('출처 미기록');
  });
});

describe('buildInvoiceRateBadge', () => {
  it('조회 전이면 none', () => {
    expect(buildInvoiceRateBadge(null, 'EXPORT', false)).toEqual({ kind: 'none' });
  });
  it('사용자가 값을 고치면(touched) manual — 찾았든 못 찾았든 상관없이', () => {
    expect(buildInvoiceRateBadge({ found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' }, 'EXPORT', true))
      .toEqual({ kind: 'manual' });
  });
  it('찾았고 사용자가 안 건드렸으면 suggested', () => {
    expect(buildInvoiceRateBadge({ found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' }, 'EXPORT', false))
      .toEqual({ kind: 'suggested', rateType: 'EXPORT', validFrom: '2026-10-05', validTo: '2026-10-11' });
  });
  it('못 찾았으면 not_found — previous가 있으면 참고 문구를 함께 담는다', () => {
    expect(buildInvoiceRateBadge({ found: false, previous: { rate: 1300, validFrom: '2026-09-28', validTo: '2026-10-04' } }, 'EXPORT', false))
      .toEqual({ kind: 'not_found', previous: '1,300 (2026-09-28~2026-10-04)' });
    expect(buildInvoiceRateBadge({ found: false, previous: null }, 'EXPORT', false))
      .toEqual({ kind: 'not_found', previous: null });
  });
});
