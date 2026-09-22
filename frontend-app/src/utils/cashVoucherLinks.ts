// PR-127: 입출금전표 등록 폼의 "연결" 4종(고객사/공급업체/발주/생산계약)은 검색 선택으로 고른 객체를 들고 있다가,
// 제출할 때 서버가 받는 ID 필드로만 바꿔 보낸다(선택 안 한 항목은 필드 자체를 보내지 않는다).
export interface VoucherLinkSources {
  buyer: { id: number } | null;
  supplier: { id: number } | null;
  purchaseOrder: { id: number } | null;
  productionContract: { id: number } | null;
}

export interface VoucherLinkIds {
  counterpartyBuyerId?: number;
  counterpartySupplierId?: number;
  relatedPurchaseOrderId?: number;
  relatedProductionContractId?: number;
}

export function voucherLinkIds(links: VoucherLinkSources): VoucherLinkIds {
  return {
    ...(links.buyer ? { counterpartyBuyerId: links.buyer.id } : {}),
    ...(links.supplier ? { counterpartySupplierId: links.supplier.id } : {}),
    ...(links.purchaseOrder ? { relatedPurchaseOrderId: links.purchaseOrder.id } : {}),
    ...(links.productionContract ? { relatedProductionContractId: links.productionContract.id } : {}),
  };
}
