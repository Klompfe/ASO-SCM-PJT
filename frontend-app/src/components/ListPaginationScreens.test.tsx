import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

// API 모듈(axios 클라이언트는 브라우저 전용)은 가짜로 바꾸고, 첫 화면에 페이지 이동 UI와 검색 수단이 그려지는지만 본다.
vi.mock('../api/workOrders.service', () => ({
  getWorkOrders: vi.fn(), createWorkOrder: vi.fn(), updateWorkOrderStatus: vi.fn(),
}));
vi.mock('../api/statusCodes.service', () => ({ getStatusCodes: vi.fn().mockResolvedValue([]) }));
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
  it('작업지시 관리: 페이지 이동(이전/다음)과 검색창이 있고, 상태 필터는 마스터 테이블(GET /status-codes)에서 옵션을 받는다', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorkOrdersManager)));
    expect(html).toContain('aria-label="페이지 이동"');
    expect(html).toContain('aria-label="이전 페이지"');
    expect(html).toContain('aria-label="다음 페이지"');
    expect(html).toContain('1 / 1'); // 첫 렌더(아직 조회 전)는 0건 상태
    expect(html).toContain('aria-label="품목명 검색어"');
    expect(html).toContain('aria-label="품목코드 검색어"');
    expect(html).toContain('aria-label="스타일번호 검색어"');
    // PR-140: renderToStaticMarkup은 effect를 실행하지 않으므로 마운트 시 불러오는 상태코드
    // 옵션은 아직 없다(로딩 전 "All"만) — 실제 옵션이 API 결과로 채워지는지는
    // WorkOrdersStatusOptions.test.tsx(직접 fetch 모킹 후 재렌더)에서 확인한다.
    expect(html).toContain('aria-label="상태 필터"');
    expect(html).toContain('>All</option>');
  });

  it('품목관리: 메인 목록에 페이지 이동(이전/다음)이 있다', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toContain('aria-label="페이지 이동"');
    expect(html).toContain('aria-label="이전 페이지"');
    expect(html).toContain('aria-label="다음 페이지"');
  });
});
