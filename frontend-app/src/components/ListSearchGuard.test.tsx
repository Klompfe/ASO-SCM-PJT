import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

// PR-139: 목록 화면(작업지시/품목관리)에서 아무 조건 없이 검색하면 경고를 띄우고 조회를 막아야 한다.
// 판정 로직(hasAnySearchCondition) 자체는 listQueries.test.ts에서 모든 조합(전부 빈값/상태만/텍스트만)을
// 철저히 단위 테스트한다. 여기서는 이 두 화면이 renderToStaticMarkup으로도 확인 가능한 것 — 구조가
// 실제로 그 판정 함수를 쓰도록 연결돼 있는지(통합 검색창이 항목별 입력란으로 바뀐 구조 등)만 본다.
// (이 프로젝트에는 jsdom/testing-library가 없고, WorkOrdersManager/ItemsManager는 hook을 쓰는 함수
// 컴포넌트라 dispatcher 없이 직접 호출해 onSubmit을 꺼낼 수 없다 — 실제 클릭/경고 동작은 Puppeteer로
// 배포 화면에서 검증한다.)
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/workOrders.service', () => ({ getWorkOrders: vi.fn(), createWorkOrder: vi.fn(), updateWorkOrderStatus: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn(), getAllItems: vi.fn(), createItem: vi.fn(), updateItem: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn() }));
vi.mock('../api/boms.service', () => ({ getBomByStyleNo: vi.fn(), updateBomItem: vi.fn(), addBomLabelSet: vi.fn() }));
vi.mock('../api/mapping.service', () => ({ parseMappingFile: vi.fn(), checkStyleExists: vi.fn(), commitMapping: vi.fn() }));

import { WorkOrdersManager } from './WorkOrdersManager';
import { ItemsManager } from './ItemsManager';

describe('목록 화면 검색 UX (PR-139)', () => {
  it('작업지시 목록: 통합 검색창(품목명/코드/스타일번호)이 항목별 개별 입력란 + 조회 버튼 3개로 바뀌었다', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorkOrdersManager)));
    for (const label of ['품목명 검색어', '품목코드 검색어', '스타일번호 검색어']) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`aria-label="${label} 조회"`); // 각 입력란 옆 개별 돋보기 버튼
    }
    // 예전 통합 검색창(단일 keyword 입력 하나)은 더 이상 없다.
    expect(html).not.toContain('aria-label="작업지시 검색어"');
    expect(html).not.toContain('검색 (품목명/코드/스타일번호)');
    // "초기화" 버튼은 그대로 남아있다.
    expect(html).toContain('초기화');
  });

  it('품목관리(품목 마스터 목록): 구분/키워드 검색 UI가 그대로 있다(검색 자체는 남고, 빈 조건 판정만 추가)', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toContain('전체 구분');
    expect(html).toContain('placeholder="품목명/코드 검색"');
  });
});
