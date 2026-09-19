import { describe, it, expect } from 'vitest';
import { pickLatestOrderDefaults, resolveAutofill, sortForShortage, suggestedQuantity } from './purchaseOrderForm';
import type { PurchaseOrder } from '../api/purchaseOrders.service';
import type { MaterialRequirementRow } from './bomRequirementReport';

const sup = (id: number, name: string) => ({ id, code: `TY-${id}`, name });
const po = (id: number, over: Partial<PurchaseOrder> = {}): PurchaseOrder =>
  ({ id, itemId: 1, quantity: 10, unitPrice: 5, status: 'RECEIVED', supplierId: 1, supplier: sup(1, '가공급'), ...over }) as PurchaseOrder;

describe('발주 폼: 최근 발주 이력 자동 채움 (PR-126)', () => {
  describe('pickLatestOrderDefaults', () => {
    it('이력이 있으면 가장 최근(id 최대) 발주의 공급업체/단가를 돌려준다(서버 정렬에 의존하지 않는다)', () => {
      const r = pickLatestOrderDefaults([po(3, { unitPrice: 7, supplier: sup(2, '나공급') }), po(9, { unitPrice: '12.50' as any, supplier: sup(4, '다공급') }), po(5)]);
      expect(r).toEqual({ supplier: sup(4, '다공급'), unitPrice: 12.5, orderId: 9 });
    });

    it('이력이 없으면(빈 목록/undefined) null → 공란', () => {
      expect(pickLatestOrderDefaults([])).toBeNull();
      expect(pickLatestOrderDefaults(undefined)).toBeNull();
      expect(pickLatestOrderDefaults(null)).toBeNull();
    });

    it('취소된 발주는 기본값으로 쓰지 않고, 공급업체가 없거나 단가가 0 이하인 발주도 건너뛴다', () => {
      const r = pickLatestOrderDefaults([
        po(10, { status: 'CANCELLED', supplier: sup(9, '취소업체') }),
        po(9, { supplier: undefined }),
        po(8, { unitPrice: 0 }),
        po(7, { unitPrice: undefined }),
        po(6, { supplier: sup(3, '유효업체'), unitPrice: 3 }),
      ]);
      expect(r).toMatchObject({ orderId: 6, supplier: sup(3, '유효업체'), unitPrice: 3 });
      expect(pickLatestOrderDefaults([po(1, { status: 'CANCELLED' })])).toBeNull();
    });

    it('대기(PENDING)/입고(RECEIVED) 모두 이력으로 인정한다', () => {
      expect(pickLatestOrderDefaults([po(2, { status: 'PENDING' })])?.orderId).toBe(2);
    });
  });

  describe('resolveAutofill', () => {
    const empty = { supplier: null, unitPrice: 0, autofilled: false };
    const latest = { supplier: sup(4, '다공급'), unitPrice: 12.5, orderId: 9 };

    it('이력이 있으면 공급업체/단가를 그 값으로 채우고 autofilled=true(사용자 값은 덮어쓴다 — 새 품목을 골랐으므로)', () => {
      expect(resolveAutofill(empty, latest)).toEqual({ supplier: latest.supplier, unitPrice: 12.5, autofilled: true });
      expect(resolveAutofill({ supplier: sup(1, '수동'), unitPrice: 99, autofilled: false }, latest)).toEqual({ supplier: latest.supplier, unitPrice: 12.5, autofilled: true });
    });

    it('이력이 없고 이전 값이 자동 채움이었으면 지운다(이전 품목의 공급업체/단가가 남지 않게)', () => {
      expect(resolveAutofill({ supplier: latest.supplier, unitPrice: 12.5, autofilled: true }, null)).toEqual({ supplier: null, unitPrice: 0, autofilled: false });
    });

    it('이력이 없고 사용자가 직접 넣은 값이면 그대로 둔다', () => {
      const manual = { supplier: sup(1, '수동'), unitPrice: 99, autofilled: false };
      expect(resolveAutofill(manual, null)).toEqual(manual);
      expect(resolveAutofill(empty, null)).toEqual(empty);
    });
  });

  describe('suggestedQuantity / sortForShortage', () => {
    it('제안 수량은 부족 수량을 올림(발주 수량은 정수), 부족이 없으면 1', () => {
      expect(suggestedQuantity(1150)).toBe(1150);
      expect(suggestedQuantity(1149.2)).toBe(1150);
      expect(suggestedQuantity(0.3)).toBe(1);
      expect(suggestedQuantity(0)).toBe(1);
    });

    const row = (itemId: number, itemName: string, shortageQty: number): MaterialRequirementRow =>
      ({ itemId, itemCode: `C${itemId}`, itemName, categories: [], colors: [], consumptionPerUnit: 1, requiredQty: shortageQty, orderedQty: 0, shortageQty, lineCount: 1 });

    it('부족한 행이 위(부족량 큰 순), 나머지는 이름순, 원본 배열은 바뀌지 않는다', () => {
      const rows = [row(1, '다', 0), row(2, '가', 50), row(3, '나', 900), row(4, '라', 0), row(5, '마', 50)];
      const sorted = sortForShortage(rows);
      expect(sorted.map((r) => r.itemId)).toEqual([3, 2, 5, 1, 4]); // 900, 50(가), 50(마), 0(다), 0(라)
      expect(rows.map((r) => r.itemId)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
