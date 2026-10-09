import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-185: 발주 폼에 스타일 연결(선택)·트랙 필터·단가표 참고(USD) UI가 추가됐는지 정적
// 렌더로 확인한다(DOM 상호작용은 이 프로젝트 테스트 환경에서 검증할 수 없음 — 핵심 로직은
// utils/purchaseOrderForm.test.ts에서 순수 함수로 검증했다).
vi.mock('../api/purchaseOrders.service', () => ({
  getPurchaseOrders: vi.fn(), createPurchaseOrder: vi.fn(), getOrderTypeSuggestion: vi.fn(),
  updatePurchaseOrderStatus: vi.fn(), getMaterialProductionContext: vi.fn(), getPurchaseOrderDocument: vi.fn(),
  getPriceReference: vi.fn(),
}));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn(), getItem: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn() }));
vi.mock('../api/workOrders.service', () => ({ getStyleRequirements: vi.fn() }));
vi.mock('../api/brandPriceRules.service', () => ({ getBrandPriceRules: vi.fn() }));
vi.mock('../api/materialCategories.service', () => ({ getMaterialCategories: vi.fn() }));

import { PurchaseOrdersManager } from './PurchaseOrdersManager';

describe('PurchaseOrdersManager — 스타일 연결/트랙 필터/단가표 참고 UI (PR-185)', () => {
  it('발주 폼에 "스타일 연결" 선택란과 수량 입력(기본값 1 없음), 목록에 트랙 필터 버튼이 렌더된다', () => {
    const html = renderToStaticMarkup(createElement(PurchaseOrdersManager, {}));
    expect(html).toContain('스타일 연결(선택)');
    expect(html).toContain('스타일 미연결(기본)');
    expect(html).toContain('전체');
    expect(html).toContain('스타일 미연결');
    // 수량 입력란에 기본값 1이 더 이상 없다(PR-185 B 회귀 확인) — value="1"이 아니라 value=""로 시작.
    expect(html).not.toContain('value="1" aria-label="수량"');
  });
});
