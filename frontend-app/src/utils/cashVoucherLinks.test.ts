import { describe, expect, it } from 'vitest';
import { voucherLinkIds } from './cashVoucherLinks';

describe('voucherLinkIds — 검색 선택한 연결 항목 → 전표 등록 요청의 ID 필드 (PR-127)', () => {
  it('아무것도 선택하지 않으면 ID 필드를 하나도 보내지 않는다', () => {
    expect(voucherLinkIds({ buyer: null, supplier: null, purchaseOrder: null, productionContract: null })).toEqual({});
  });

  it('선택한 항목만 해당 필드로 변환된다', () => {
    expect(voucherLinkIds({ buyer: { id: 1 }, supplier: null, purchaseOrder: { id: 30 }, productionContract: null })).toEqual({
      counterpartyBuyerId: 1,
      relatedPurchaseOrderId: 30,
    });
  });

  it('4종을 모두 선택하면 4개 필드가 모두 채워진다', () => {
    expect(voucherLinkIds({ buyer: { id: 1 }, supplier: { id: 2 }, purchaseOrder: { id: 3 }, productionContract: { id: 4 } })).toEqual({
      counterpartyBuyerId: 1,
      counterpartySupplierId: 2,
      relatedPurchaseOrderId: 3,
      relatedProductionContractId: 4,
    });
  });
});
