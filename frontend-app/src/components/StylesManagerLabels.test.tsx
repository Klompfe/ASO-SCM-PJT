import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-170: StylesManager(오더관리)에 남아있던 "목표출고일" 라벨 4곳을 "납기일"로
// 통일한다(ItemsManagerLabels.test.tsx·PR-167과 동일한 라벨 전용 수정 — targetRdd
// 필드/값/바인딩은 전혀 건드리지 않는다). 수정 폼/상세뷰의 라벨은 selectedStyle/
// editingStyle 상태(행 클릭 등 상호작용) 뒤에만 렌더되는데, 이 프로젝트 테스트
// 환경은 jsdom/이벤트 시뮬레이션 없이 renderToStaticMarkup만 쓰므로(ItemsManagerLabels
// 와 동일한 제약) 여기서는 상호작용 없이도 항상 보이는 검색 필터 영역만 검증한다.
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn(), createMasterStyle: vi.fn(), updateMasterStyle: vi.fn() }));
vi.mock('../api/brandPrefixRules.service', () => ({ getBrandPrefixRules: vi.fn() }));
vi.mock('../api/contracts.service', () => ({
  issueContract: vi.fn(), getContractsByStyleNo: vi.fn(), approveContract: vi.fn(),
  rejectContract: vi.fn(), deleteContract: vi.fn(), getContractApprovalContext: vi.fn(),
}));
vi.mock('../api/orderProgress.service', () => ({
  upsertProcessStage: vi.fn(), getProcessStagesByStyle: vi.fn(), getMaterialReadiness: vi.fn(),
  createOrderShipment: vi.fn(), updateOrderShipment: vi.fn(), getOrderShipmentsByStyle: vi.fn(), getShipmentSummary: vi.fn(),
}));
vi.mock('../api/auth.service', () => ({ getCurrentUser: vi.fn() }));

import { StylesManager } from './StylesManager';

describe('StylesManager 납기일 라벨 (PR-170)', () => {
  it('검색 필터 영역에 "납기일(From/To)"로 표시되고, 예전 "목표출고일" 라벨은 더 이상 없다', () => {
    const html = renderToStaticMarkup(createElement(StylesManager, {}));
    expect(html).toContain('납기일(From)');
    expect(html).toContain('납기일(To)');
    expect(html).not.toContain('목표출고일');
  });
});
