import { describe, it, expect } from 'vitest';
import type { PurchaseOrder } from '../api/purchaseOrders.service';
import { summarizeByStatus, summarizeBySupplier, totalsOfSummary, purchaseOrderColumns, purchaseOrderColumnsFor } from './purchaseOrderReport';

// PR-244b [재현]: USD 행과 KRW 행이 섞인 목록에서 합계가 숫자를 그대로 더하면 안 된다.
const po = (id: number, qty: number, price: number, currency: string | null | undefined, supplierId = 1, status: PurchaseOrder['status'] = 'PENDING'): PurchaseOrder =>
  ({ id, itemId: 1, quantity: qty, unitPrice: price, currency, status, supplierId, supplier: { id: supplierId, code: 'S', name: `합성공급사${supplierId}` } }) as PurchaseOrder;

describe('발주 현황표 합계의 통화 분리 (PR-244b)', () => {
  const mixed = [po(1, 10, 1000, 'KRW'), po(2, 10, 1000, null), po(3, 10, 2.5, 'USD')];

  it('상태별 금액(기존 필드)은 KRW 만 합산하고 USD 는 byCurrency 에 따로 담긴다', () => {
    const pending = summarizeByStatus(mixed).find((s) => s.status === 'PENDING')!;
    expect(pending.amount).toBe(20000); // USD 25 가 섞이면 20025 가 된다(수정 전 동작)
    expect(pending.byCurrency).toEqual({ KRW: 20000, USD: 25 });
  });

  it('공급업체별 금액도 통화별로 분리한다', () => {
    const [s] = summarizeBySupplier(mixed);
    expect(s.amount).toBe(20000);
    expect(s.byCurrency).toEqual({ KRW: 20000, USD: 25 });
  });

  it('KRW 만 있는 목록은 이전과 같은 값(amount)이고 byCurrency 도 KRW 하나', () => {
    const krwOnly = [po(1, 3, 1500, 'KRW'), po(2, 2, 700, undefined)];
    const [s] = summarizeBySupplier(krwOnly);
    expect(s.amount).toBe(5900);
    expect(s.byCurrency).toBeUndefined(); // 객체가 이전과 같다
    expect(totalsOfSummary(s)).toEqual({ KRW: 5900 });
  });

  it('엑셀 열: USD 행이 있을 때만 "통화" 열이 붙고, KRW 만 있으면 기존 열 그대로', () => {
    expect(purchaseOrderColumnsFor([po(1, 1, 1, 'KRW')])).toBe(purchaseOrderColumns);
    const cols = purchaseOrderColumnsFor(mixed);
    expect(cols[cols.length - 1].header).toBe('통화');
    expect(cols[cols.length - 1].accessor(mixed[2])).toBe('USD');
  });
});
