import { describe, it, expect } from 'vitest';
import { pickLatestOrderDefaults, resolveAutofill, sortForShortage, suggestedQuantity, isUnitPriceRequired, suggestStyleLinkedQuantity, suggestUnlinkedQuantity, trackBadgeLabel, isQuantityFilled } from './purchaseOrderForm';
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

  // MERGE-2: PR-173이 CMT 발주를 단가 없이 허용하면서, 일괄발주에서만 CMT 건이 막히던
  // 불일치를 고쳤다 — 호출하는 쪽이 unitPriceRequired=false를 넘기면 단가 없이도 ready.
  it('unitPriceRequired=false(가발주/CMT)면 단가 없이도 준비 완료다 — FOB/미지정은 여전히 단가 필수', () => {
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: null }, false)).toBe(true);
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: 0 }, false)).toBe(true);
    expect(isBulkRowReady({ supplierId: null, quantity: 3, unitPrice: null }, false)).toBe(false); // 공급업체는 여전히 필수
    expect(isBulkRowReady({ supplierId: 1, quantity: 2.5, unitPrice: null }, false)).toBe(false); // 수량은 여전히 정수 필수
    expect(isBulkRowReady({ supplierId: 1, quantity: 3, unitPrice: null }, true)).toBe(false); // 기본값(true)은 기존과 동일
  });
});

// PR-185: 스타일 연결 트랙 — 자재를 고르면 수량을 부족분(콘/롤 환산 포함)으로 미리 채운다.
describe('suggestStyleLinkedQuantity', () => {
  const baseRow = (over: Partial<MaterialRequirementRow> = {}): MaterialRequirementRow => ({
    itemId: 1, itemCode: 'M1', itemName: '자재', categories: [], colors: [],
    consumptionPerUnit: 1, requiredQty: 100, orderedQty: 30, unlinkedOrderedQty: 0, shortageQty: 70, lineCount: 1,
    ...over,
  });

  it('일반 자재는 부족분(올림)을 그대로 제안하고 단위 라벨은 없다', () => {
    const r = suggestStyleLinkedQuantity(baseRow({ requiredQty: 100.2, orderedQty: 30, shortageQty: 70.2 }));
    expect(r.quantity).toBe(71);
    expect(r.unitLabel).toBeNull();
    expect(r.note).toBeNull();
  });

  it('부족분이 0이면 수량을 비우고 "소요량 충족" 안내를 준다', () => {
    const r = suggestStyleLinkedQuantity(baseRow({ requiredQty: 100, orderedQty: 150, shortageQty: 0 }));
    expect(r.quantity).toBeNull();
    expect(r.note).toContain('소요량 충족');
  });

  it('실/테이프(packaging)는 shortagePackages를 콘/롤 단위로 제안한다', () => {
    const r = suggestStyleLinkedQuantity(baseRow({
      packaging: { packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76, shortagePackages: 26, conversionFormula: 'x' },
    }));
    expect(r.quantity).toBe(26);
    expect(r.unitLabel).toBe('콘');
    expect(r.summary).toContain('콘');
  });

  it('packaging이 있어도 shortagePackages가 0이면 비우고 안내한다', () => {
    const r = suggestStyleLinkedQuantity(baseRow({
      packaging: { packagingUnitLabel: '롤', unitLengthM: 50, requiredPackages: 3, shortagePackages: 0, conversionFormula: 'x' },
    }));
    expect(r.quantity).toBeNull();
    expect(r.note).toContain('소요량 충족');
  });

  it('종류 미지정(conversionWarning)이면 미터값을 넣지 않고 경고만 준다(추측 금지)', () => {
    const r = suggestStyleLinkedQuantity(baseRow({ conversionWarning: '실/테이프 종류 미지정 — 선택해 주세요' }));
    expect(r.quantity).toBeNull();
    expect(r.unitLabel).toBeNull();
    expect(r.note).toBe('실/테이프 종류 미지정 — 선택해 주세요');
  });
});

// PR-187 C: "이 자재로 발주하기"(스타일 미연결 경로)도 경고/콘·롤 행에서는 미터 수량을
// 추측해서 채우지 않는다. 핵심 회귀 포인트: 어떤 행이든 number | null을 돌려줘(undefined
// 없음) 호출자가 quantityInput을 매번 명시적으로 덮어쓰게 해서 이전 품목의 수량이 안 남는다.
describe('suggestUnlinkedQuantity (PR-187 C)', () => {
  const baseRow = (over: Partial<MaterialRequirementRow> = {}): MaterialRequirementRow => ({
    itemId: 1, itemCode: 'M1', itemName: '자재', categories: [], colors: [],
    consumptionPerUnit: 1, requiredQty: 100, orderedQty: 30, unlinkedOrderedQty: 0, shortageQty: 70, lineCount: 1,
    ...over,
  });

  it('경고 행(conversionWarning)은 수량이 비어야 한다(null)', () => {
    expect(suggestUnlinkedQuantity(baseRow({ conversionWarning: '실/테이프 종류 미지정 — 선택해 주세요' }))).toBeNull();
  });

  it('packaging이 있으면 shortagePackages를 제안하고, 0이면 비운다', () => {
    expect(suggestUnlinkedQuantity(baseRow({
      packaging: { packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76, shortagePackages: 26, conversionFormula: 'x' },
    }))).toBe(26);
    expect(suggestUnlinkedQuantity(baseRow({
      packaging: { packagingUnitLabel: '롤', unitLengthM: 50, requiredPackages: 3, shortagePackages: 0, conversionFormula: 'x' },
    }))).toBeNull();
  });

  it('일반 자재는 기존 suggestedQuantity(ceil 또는 최소 1)와 동일하게 동작한다(이 경로의 기존 동작 유지)', () => {
    expect(suggestUnlinkedQuantity(baseRow({ shortageQty: 70.2 }))).toBe(suggestedQuantity(70.2));
    expect(suggestUnlinkedQuantity(baseRow({ shortageQty: 0 }))).toBe(suggestedQuantity(0));
  });

  it('어떤 행이든 undefined가 아니라 number | null을 돌려준다 — 이전 품목의 quantityInput이 남지 않는 전제', () => {
    const rows = [
      baseRow({ conversionWarning: '경고' }),
      baseRow({ packaging: { packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 1, shortagePackages: 0, conversionFormula: 'x' } }),
      baseRow({ shortageQty: 5 }),
    ];
    for (const row of rows) {
      const result = suggestUnlinkedQuantity(row);
      expect(result === null || typeof result === 'number').toBe(true);
    }
  });
});

describe('trackBadgeLabel / isQuantityFilled', () => {
  it('styleNo가 있으면 그대로, 없으면 "미연결"', () => {
    expect(trackBadgeLabel('MB62SLM103Z')).toBe('MB62SLM103Z');
    expect(trackBadgeLabel(null)).toBe('미연결');
    expect(trackBadgeLabel(undefined)).toBe('미연결');
  });

  it('수량은 빈 값/0 이하면 유효하지 않다(기본값 1 제거 회귀 확인)', () => {
    expect(isQuantityFilled('')).toBe(false);
    expect(isQuantityFilled('0')).toBe(false);
    expect(isQuantityFilled('-1')).toBe(false);
    expect(isQuantityFilled('abc')).toBe(false);
    expect(isQuantityFilled('5')).toBe(true);
  });
});
