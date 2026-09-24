import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

// API 모듈은 axios 클라이언트(브라우저 전용)를 끌어오므로 가짜로 바꾸고, 첫 화면에 무엇이 그려지는지만 본다.
vi.mock('../api/workOrders.service', () => ({ getWorkOrders: vi.fn(), createWorkOrder: vi.fn(), updateWorkOrderStatus: vi.fn() }));
vi.mock('../api/statusCodes.service', () => ({ getStatusCodes: vi.fn().mockResolvedValue([]) }));
vi.mock('../api/salesOrders.service', () => ({ uploadSalesOrderImage: vi.fn(), commitSalesOrderAnalysis: vi.fn(), getAiUsageSummary: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn(), createMasterStyle: vi.fn() }));
vi.mock('../api/brandPrefixRules.service', () => ({ getBrandPrefixRules: vi.fn() }));
vi.mock('../api/contracts.service', () => ({ issueContract: vi.fn(), getContractsByStyleNo: vi.fn(), approveContract: vi.fn(), rejectContract: vi.fn(), deleteContract: vi.fn() }));
vi.mock('../api/orderProgress.service', () => ({
  upsertProcessStage: vi.fn(), getProcessStagesByStyle: vi.fn(), getMaterialReadiness: vi.fn(),
  createOrderShipment: vi.fn(), updateOrderShipment: vi.fn(), getOrderShipmentsByStyle: vi.fn(), getShipmentSummary: vi.fn(),
}));
vi.mock('../api/auth.service', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn() }));
vi.mock('../api/buyers.service', () => ({ getBuyers: vi.fn() }));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn() }));
vi.mock('../api/purchaseOrders.service', () => ({ getPurchaseOrders: vi.fn() }));
vi.mock('../api/productionContracts.service', () => ({ getProductionContracts: vi.fn() }));

import { StylesManager } from './StylesManager';
import { WorkOrdersManager } from './WorkOrdersManager';
import { SalesOrderUploadModal } from './SalesOrderUploadModal';

const modal = (isOpen: boolean) => renderToStaticMarkup(createElement(SalesOrderUploadModal, { isOpen, onClose: vi.fn(), onSuccess: vi.fn() }));

describe('수주 등록 화면 위치 (PR-134)', () => {
  it('오더관리(오더 목록) 화면 상단에 "수주 등록" 버튼이 있고, 모달은 닫혀 있다', () => {
    const html = renderToStaticMarkup(createElement(StylesManager, {}));
    expect(html).toContain('오더관리 (Order Management)');
    expect(html).toContain('>수주 등록</button>');
    expect(html).not.toContain('수주 등록(작업지시서 업로드)'); // 모달 제목은 버튼을 누르기 전에는 없다
  });

  it('작업지시 화면에는 더 이상 수주 등록/이미지 업로드 버튼이 없다(생산 실행 목록만 남음)', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorkOrdersManager)));
    expect(html).toContain('Work Orders');
    expect(html).toContain('Filter by Status'); // 작업지시 목록 화면은 그대로
    expect(html).not.toContain('수주 등록');
    expect(html).not.toContain('이미지로 등록');
    expect(html).not.toContain('AI 분석');
  });

  it('수주 등록 모달: 제목이 "수주 등록(작업지시서 업로드)"이다(예전 "작업지시서 이미지 업로드" 아님)', () => {
    const html = modal(true);
    expect(html).toContain('수주 등록(작업지시서 업로드)');
    expect(html).not.toContain('작업지시서 이미지 업로드');
    expect(html).toContain('AI 분석 시작'); // 업로드 → 분석 단계의 버튼
  });

  it('닫힌 모달은 아무것도 그리지 않는다', () => {
    expect(modal(false)).toBe('');
  });
});
