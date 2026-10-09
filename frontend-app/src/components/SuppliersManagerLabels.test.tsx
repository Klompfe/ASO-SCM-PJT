import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-171/PR-183: 공급업체 등록 폼/목록의 라벨을 정적 렌더로 확인한다(jsdom 없음 — 칩 클릭 같은
// 상호작용은 검증 불가, 핵심 규칙은 utils/materialCategories.test.ts에서 순수 함수로 검증).
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn(), deleteSupplier: vi.fn() }));
vi.mock('../api/materialCategories.service', () => ({ getMaterialCategories: vi.fn() }));

import { SuppliersManager } from './SuppliersManager';

describe('SuppliersManager 취급 품목군 UI (PR-183)', () => {
  it('등록 폼과 목록 테이블에 "취급 품목군" 라벨/컬럼이 표시되고 품목 검색 라벨은 없다', () => {
    const html = renderToStaticMarkup(createElement(SuppliersManager, {}));
    expect(html).toContain('취급 품목군');
    expect(html).toContain('품목군 필터');
    expect(html).not.toContain('주요품목 검색');
  });
});
