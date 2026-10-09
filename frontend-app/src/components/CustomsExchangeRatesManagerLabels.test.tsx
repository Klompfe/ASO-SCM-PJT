import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-184: 주간 환율 화면이 안내문/탭/입력 폼을 렌더하는지 정적 렌더로 확인한다(DOM
// 상호작용은 이 프로젝트 테스트 환경에서 검증할 수 없음 — 핵심 규칙은
// utils/customsExchangeRates.test.ts에서 순수 함수로 검증한다).
vi.mock('../api/customsExchangeRates.service', () => ({
  getCustomsExchangeRates: vi.fn(),
  lookupCustomsExchangeRate: vi.fn(),
  createCustomsExchangeRate: vi.fn(),
  deleteCustomsExchangeRate: vi.fn(),
}));

import { CustomsExchangeRatesManager } from './CustomsExchangeRatesManager';

describe('CustomsExchangeRatesManager (PR-184)', () => {
  it('자동수집 안내문과 수출/수입 탭, 입력 폼을 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(CustomsExchangeRatesManager, {}));
    expect(html).toContain('시스템이 자동으로 가져오지 않습니다');
    expect(html).toContain('수출');
    expect(html).toContain('수입');
    expect(html).toContain('적용 시작일');
    expect(html).toContain('적용 종료일');
  });
});
