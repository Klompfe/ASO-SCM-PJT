import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// 이 프로젝트에는 jsdom/testing-library가 없어(기존 PR-226~235와 같은 제약) 이 컴포넌트는
// 데이터를 useEffect 안에서 API 호출로 가져온다 — renderToStaticMarkup은 effect를 실행하지
// 않으므로 정적 렌더로는 "불러오는 중..." 초기 상태만 확인할 수 있다. 공급사 그룹핑·검증·
// 발주 생성(업체별 독립/롤백) 로직 자체는 bomBulkOrderGrouping.test.ts에서 순수 함수로
// DOM 없이 철저히 검증했고, 실제 화면 동작(체크박스·입력·생성 버튼)은 수동 확인으로 남긴다.
vi.mock('../api/boms.service', () => ({ getBomByStyleNo: vi.fn(() => new Promise(() => {})) }));
vi.mock('../api/styles.service', () => ({
  getMasterStyles: vi.fn(() => new Promise(() => {})),
  getStyleColorSizeQuantities: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn(() => new Promise(() => {})) }));
vi.mock('../api/materialPackagingUnitRules.service', () => ({ getMaterialPackagingUnitRules: vi.fn(() => new Promise(() => {})) }));
vi.mock('../api/purchaseOrders.service', () => ({
  getPurchaseOrders: vi.fn(() => new Promise(() => {})),
  createPurchaseOrdersBulk: vi.fn(() => new Promise(() => {})),
  getCombinedPurchaseOrderDocuments: vi.fn(() => new Promise(() => {})),
}));

const { BomBulkOrderPanel } = await import('./BomBulkOrderPanel');

describe('BomBulkOrderPanel (PR-238)', () => {
  it('초기 렌더는 로딩 상태를 보여준다(effect는 정적 렌더에서 실행되지 않음)', () => {
    const html = renderToStaticMarkup(
      createElement(BomBulkOrderPanel, { styleNo: 'MB00AAA000Z', bomItemIds: [1, 2], onClose: vi.fn() }),
    );
    expect(html).toContain('불러오는 중');
  });
});
