import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

// 화면 컴포넌트가 끌어오는 API 모듈은 axios 클라이언트(브라우저 전용)를 import하므로 통째로 가짜로 바꾼다.
// renderToStaticMarkup은 effect를 실행하지 않으므로 여기서는 "첫 화면에 무엇이 그려지는가"만 본다.
vi.mock('../api/buyers.service', () => ({ getBuyers: vi.fn() }));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn() }));
vi.mock('../api/purchaseOrders.service', () => ({ getPurchaseOrders: vi.fn() }));
vi.mock('../api/productionContracts.service', () => ({
  getProductionContracts: vi.fn(),
  createProductionContract: vi.fn(),
  deleteProductionContract: vi.fn(),
}));
vi.mock('../api/workOrders.service', () => ({
  getWorkOrders: vi.fn(),
  createWorkOrder: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
  getMaterialRequirements: vi.fn(),
  uploadWorkOrderImage: vi.fn(),
  commitWorkOrderAnalysis: vi.fn(),
  getAiUsageSummary: vi.fn(),
}));
vi.mock('../api/cashVouchers.service', () => ({
  getCashVouchers: vi.fn(),
  getCashVoucherSummary: vi.fn(),
  createCashVoucher: vi.fn(),
  deleteCashVoucher: vi.fn(),
}));

import { WorkOrdersManager } from './WorkOrdersManager';
import { BomRequirementReport } from './BomRequirementReport';
import { CashVouchersManager } from './CashVouchersManager';
import { CashVoucherStatementView } from './CashVoucherStatementView';
import { ProductionContractsManager } from './ProductionContractsManager';
import { PurchaseOrderLedgerReport } from './PurchaseOrderLedgerReport';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

// 필드의 aria-label로 그 자리에 검색 선택 입력란(+ 옆의 돋보기 버튼)이 그려졌는지 본다.
const hasSearchField = (html: string, label: string) =>
  html.includes(`aria-label="${label}"`) && html.includes(`aria-label="${label} 검색"`);

describe('조회 UI 감사 후속: 검색 선택 적용 화면 (PR-127)', () => {
  it('작업지시 등록: 품목이 <select>가 아니라 검색 선택이다(예전엔 최초 100개만 불러온 <select>)', () => {
    const html = render(createElement(MemoryRouter, null, createElement(WorkOrdersManager)));
    expect(hasSearchField(html, '품목')).toBe(true);
    expect(html).not.toContain('선택하세요'); // 기존 품목 <select>의 안내 옵션
    // 상태 필터는 고정된 3개 값이라 그대로 <select>
    expect(html).toContain('Filter by Status');
  });

  it('BOM 소요명세서: 작업지시가 검색 선택이다', () => {
    const html = render(createElement(BomRequirementReport));
    expect(hasSearchField(html, '작업지시 선택')).toBe(true);
    expect(html).not.toContain('작업지시를 선택하세요'); // 기존 <select>의 안내 옵션
    expect(html).toContain('작업지시를 선택하면 물량 기준 자재 소요량이 계산됩니다.');
  });

  it('입출금전표: 거래처(고객사)/거래처(공급업체)/관련 발주/관련 생산계약이 모두 검색 선택이고, 구분 필터만 <select>로 남는다', () => {
    const html = render(createElement(CashVouchersManager));
    for (const label of ['거래처(고객사) 연결', '거래처(공급업체) 연결', '관련 발주 연결', '관련 생산계약 연결']) {
      expect(hasSearchField(html, label)).toBe(true);
    }
    expect(html).not.toContain('연결 안 함</option>'); // 기존 <select>의 "연결 안 함" 옵션이 하나도 남지 않는다
    expect(html).toContain('placeholder="연결 안 함"'); // 대신 빈 상태 안내로 남는다
    expect(html).toContain('<option value="DEPOSIT">입금</option>'); // 고정 값 필터는 그대로
  });

  it('거래내역서: 거래처가 검색 선택이고 구분(고객사/공급업체)은 <select>로 남는다. buyers/suppliers props가 필요 없다', () => {
    const html = render(createElement(CashVoucherStatementView, { onClose: vi.fn() }));
    expect(hasSearchField(html, '거래처')).toBe(true);
    expect(html).not.toContain('<option value="">선택하세요</option>');
    expect(html).toContain('<option value="buyer" selected="">고객사</option>'); // 기본 선택값
    expect(html).toContain('<option value="supplier">공급업체</option>');
  });

  it('생산계약: 제조사가 검색 선택이다', () => {
    const html = render(createElement(ProductionContractsManager));
    expect(hasSearchField(html, '제조사')).toBe(true);
    expect(html).not.toContain('<option value="">선택</option>');
  });

  it('발주 원장: 공급업체 필터가 검색 선택(선택 해제 = 전체)이고 상태 필터는 <select>로 남는다', () => {
    const html = render(createElement(PurchaseOrderLedgerReport));
    expect(hasSearchField(html, '공급업체 필터')).toBe(true);
    expect(html).toContain('placeholder="전체 업체"');
    expect(html).toContain('aria-label="상태 필터"');
  });
});
