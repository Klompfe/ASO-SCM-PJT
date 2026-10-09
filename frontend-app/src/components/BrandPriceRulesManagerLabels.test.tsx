import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/brandPriceRules.service', () => ({ getBrandPriceRules: vi.fn() }));

import { BrandPriceRulesManager } from './BrandPriceRulesManager';

describe('BrandPriceRulesManager (PR-185)', () => {
  it('브랜드 전용가 안내문과 등록 폼을 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(BrandPriceRulesManager, {}));
    expect(html).toContain('브랜드 전용가');
    expect(html).toContain('뮤트');
    expect(html).toContain('품목구분 키워드');
  });
});
