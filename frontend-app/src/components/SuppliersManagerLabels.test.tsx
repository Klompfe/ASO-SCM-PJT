import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-171: 공급업체 등록 폼/목록에 "주요품목" 다중 선택 UI가 추가됐는지 정적 렌더로
// 확인한다(검색 팝업 클릭→선택 상호작용은 이 프로젝트 테스트 환경(renderToStaticMarkup만
// 사용, jsdom 없음)에서는 검증할 수 없다 — 그 부분의 핵심 로직(중복 선택 방지)은
// mainItemsPicker.test.ts에서 순수 함수로 분리해 테스트한다).
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn(), deleteSupplier: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn() }));

import { SuppliersManager } from './SuppliersManager';

describe('SuppliersManager 주요품목 UI (PR-171)', () => {
  it('등록 폼과 목록 테이블에 "주요품목" 라벨/컬럼이 표시된다', () => {
    const html = renderToStaticMarkup(createElement(SuppliersManager, {}));
    expect(html).toContain('주요품목');
  });
});
