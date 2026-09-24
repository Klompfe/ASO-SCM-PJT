import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

// API 모듈(axios 클라이언트는 브라우저 전용)은 가짜로 바꾸고, 첫 화면에 페이지 이동 UI와 검색 수단이 그려지는지만 본다.
vi.mock('../api/workOrders.service', () => ({
  getWorkOrders: vi.fn(), createWorkOrder: vi.fn(), updateWorkOrderStatus: vi.fn(),
}));
vi.mock('../api/items.service', () => ({ getItems: vi.fn(), getAllItems: vi.fn(), createItem: vi.fn(), updateItem: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn() }));
vi.mock('../api/boms.service', () => ({ getBomByStyleNo: vi.fn(), updateBomItem: vi.fn(), addBomLabelSet: vi.fn() }));
vi.mock('../api/mapping.service', () => ({ parseMappingFile: vi.fn(), checkStyleExists: vi.fn(), commitMapping: vi.fn() }));
vi.mock('../api/buyers.service', () => ({ getBuyers: vi.fn() }));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn() }));
vi.mock('../api/purchaseOrders.service', () => ({ getPurchaseOrders: vi.fn() }));
vi.mock('../api/productionContracts.service', () => ({ getProductionContracts: vi.fn() }));

import { WorkOrdersManager } from './WorkOrdersManager';
import { ItemsManager } from './ItemsManager';

describe('목록 화면 페이지네이션 UI (PR-128)', () => {
  it('작업지시 관리: 페이지 이동(이전/다음)과 검색창이 있고, 상태 필터는 서버 enum 값이다', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorkOrdersManager)));
    expect(html).toContain('aria-label="페이지 이동"');
    expect(html).toContain('aria-label="이전 페이지"');
    expect(html).toContain('aria-label="다음 페이지"');
    expect(html).toContain('1 / 1'); // 첫 렌더(아직 조회 전)는 0건 상태
    expect(html).toContain('aria-label="품목명 검색어"');
    expect(html).toContain('aria-label="품목코드 검색어"');
    expect(html).toContain('aria-label="스타일번호 검색어"');
    for (const status of ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) expect(html).toContain(`<option value="${status}">`);
    expect(html).not.toContain('PLANNED'); // 서버에 없는 값
  });

  it('품목관리: 메인 목록에 페이지 이동(이전/다음)이 있다', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toContain('aria-label="페이지 이동"');
    expect(html).toContain('aria-label="이전 페이지"');
    expect(html).toContain('aria-label="다음 페이지"');
  });
});
