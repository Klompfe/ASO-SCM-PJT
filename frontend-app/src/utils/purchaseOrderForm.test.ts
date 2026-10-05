import { describe, it, expect } from 'vitest';
import { pickLatestOrderDefaults, resolveAutofill, sortForShortage, suggestedQuantity, isUnitPriceRequired } from './purchaseOrderForm';
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

  // PR-173: CMT 계약 건은 단가가 당장 필요 없다(수출선적서류 작성 시점에만 필요).
  describe('isUnitPriceRequired', () => {
    it('productionType이 CMT면 단가가 필요 없다(false)', () => {
      expect(isUnitPriceRequired('CMT')).toBe(false);
    });

    it('productionType이 FOB면 단가가 필요하다(true, 기존 동작 유지)', () => {
      expect(isUnitPriceRequired('FOB')).toBe(true);
    });

    it('productionType을 모르면(null — BOM 미연결/조회 실패 등) 안전하게 필수로 본다(true)', () => {
      expect(isUnitPriceRequired(null)).toBe(true);
    });
  });
});

// PR-177: 자재별 수정 대상 발주 선택 — 미입고만, 가장 최근 것 하나, 건수 집계.
import { buildEditableOrderByItem } from './purchaseOrderForm';

describe('buildEditableOrderByItem (PR-177)', () => {
  const o = (id: number, itemId: number, status: string) => ({ id, itemId, status });

  it('미입고 발주가 없는 자재는 맵에 없다(→ 신규 발주하기)', () => {
    const m = buildEditableOrderByItem([o(1, 10, 'RECEIVED'), o(2, 10, 'CANCELLED')]);
    expect(m.has(10)).toBe(false);
  });

  it('미입고 발주가 하나면 그 발주를 고른다', () => {
    const m = buildEditableOrderByItem([o(5, 10, 'PENDING'), o(6, 10, 'RECEIVED')]);
    expect(m.get(10)?.order.id).toBe(5);
    expect(m.get(10)?.pendingCount).toBe(1);
  });

  it('미입고 발주가 여러 건이면 가장 최근(id 최대) 하나를 고르고 건수를 함께 돌려준다', () => {
    const m = buildEditableOrderByItem([o(3, 10, 'PENDING'), o(9, 10, 'PENDING'), o(7, 10, 'PENDING'), o(12, 10, 'RECEIVED')]);
    expect(m.get(10)?.order.id).toBe(9);
    expect(m.get(10)?.pendingCount).toBe(3);
  });
});

// PR-176: 색상/사이즈 라인 합계 계산.
import { sumPurchaseOrderLines, isLineTotalMismatch, resolveBulkSupplierId, isBulkRowReady } from './purchaseOrderForm';

describe('purchaseOrderForm 라인 합계 (PR-176)', () => {
  it('라인 합계는 qty 합이고, 라인이 없으면 0이다', () => {
    expect(sumPurchaseOrderLines([{ qty: 10 }, { qty: 5 }])).toBe(15);
    expect(sumPurchaseOrderLines([])).toBe(0);
  });

  it('라인이 있고 합계가 총수량과 다르면 불일치, 같으면 일치, 라인이 없으면 불일치 아님', () => {
    expect(isLineTotalMismatch(30, [{ qty: 10 }, { qty: 20 }])).toBe(false);
    expect(isLineTotalMismatch(50, [{ qty: 10 }, { qty: 20 }])).toBe(true);
    expect(isLineTotalMismatch(50, [])).toBe(false);
  });
});

// PR-179: 일괄발주 — 공급업체 자동 선택은 후보 1곳일 때만, 커밋 가능 조건은 세 값 모두 있을 때만.
describe('일괄발주 보조 규칙 (PR-179)', () => {
  it('후보 공급업체가 정확히 하나면 그 id, 여럿이거나 없으면 null(추측하지 않음)', () => {
    expect(resolveBulkSupplierId([4, 4, 4])).toBe(4);
    expect(resolveBulkSupplierId([4, 9])).toBeNull();
    expect(resolveBulkSupplierId([])).toBeNull();
  });

  it('공급업체·정수 수량·양수 단가가 모두 있어야 커밋 가능하다', () => {
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: 2 })).toBe(true);
    expect(isBulkRowReady({ supplierId: null, quantity: 3, unitPrice: 2 })).toBe(false);
    expect(isBulkRowReady({ supplierId: 1, quantity: 2.5, unitPrice: 2 })).toBe(false);
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: null })).toBe(false);
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: 0 })).toBe(false);
  });
});
