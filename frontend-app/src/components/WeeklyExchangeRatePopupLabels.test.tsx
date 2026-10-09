import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { ExchangeRateStatus } from '../api/customsExchangeRates.service';

vi.mock('../api/customsExchangeRates.service', () => ({
  createCustomsExchangeRate: vi.fn(),
}));

import { WeeklyExchangeRatePopup, WeeklyExchangeRateBanner } from './WeeklyExchangeRatePopup';

const found = { found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' } as const;
const notFound = { found: false, previous: null } as const;

// PR-184: 로그인 직후 팝업 — 둘 다 없음/한쪽만 없음 두 상태를 정적 렌더로 확인한다.
describe('WeeklyExchangeRatePopup (PR-184)', () => {
  it('둘 다 없으면 수출/수입 입력칸이 각각 렌더된다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: notFound, IMPORT: notFound };
    const html = renderToStaticMarkup(createElement(WeeklyExchangeRatePopup, { status, onClose: vi.fn(), onSaved: vi.fn() }));
    expect(html).toContain('이번 주 관세청 환율이 등록되지 않았습니다');
    expect(html).toContain('수출 환율 입력칸');
    expect(html).toContain('수입 환율 입력칸');
    expect(html).not.toContain('등록됨:');
  });

  it('수출만 없으면 수출은 입력칸, 수입은 등록됨 읽기전용으로 나온다', () => {
    const status: ExchangeRateStatus = { date: '2026-10-07', EXPORT: notFound, IMPORT: found };
    const html = renderToStaticMarkup(createElement(WeeklyExchangeRatePopup, { status, onClose: vi.fn(), onSaved: vi.fn() }));
    expect(html).toContain('수출 환율 입력칸');
    expect(html).not.toContain('수입 환율 입력칸');
    expect(html).toContain('등록됨:');
  });
});

describe('WeeklyExchangeRateBanner (PR-184)', () => {
  it('USER용 상단 안내 문구를 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(WeeklyExchangeRateBanner, { onClose: vi.fn() }));
    expect(html).toContain('관리자에게 등록을 요청하세요');
  });
});
