import { describe, it, expect } from 'vitest';
import {
  updateBomItemField,
  buildCommitBomItems,
  buildCommitResult,
  hasBlankMaterialName,
  normalizeMaterialName,
  isNewMaterialName,
  hasRequiredQtyMismatch,
  computeDuplicateLookingRows,
  computeBomRowBadges,
} from './salesOrderBomReview';
import type { AiBomItem, AiSalesOrderResult } from '../api/salesOrders.service';

const bomItem = (overrides: Partial<AiBomItem> = {}): AiBomItem => ({
  category: '부자재', itemName: '자재', spec: null, colorCode: null, consumption: 1,
  requiredQty: null, supplier: null, remarks: null, ...overrides,
});

const buildResult = (bomItems: AiBomItem[]): AiSalesOrderResult => ({
  overview: {
    styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null,
    factory: null, buyer: null, totalQty: 100, targetRdd: null, documentDate: null,
  },
  bomItems,
  sizeSpecs: [],
  workNotes: null,
});

describe('updateBomItemField (PR-197)', () => {
  it('지정한 행의 필드만 바뀌고 다른 행/결과는 그대로다', () => {
    const results = [buildResult([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })])];
    const next = updateBomItemField(results, 0, 1, 'itemName', 'B-수정');
    expect(next[0].bomItems[0].itemName).toBe('A');
    expect(next[0].bomItems[1].itemName).toBe('B-수정');
    expect(next).not.toBe(results);
  });

  it('소요량(consumption)도 수정할 수 있다', () => {
    const results = [buildResult([bomItem({ consumption: 2.7 })])];
    const next = updateBomItemField(results, 0, 0, 'consumption', 2.9);
    expect(next[0].bomItems[0].consumption).toBe(2.9);
  });
});

describe('buildCommitBomItems / buildCommitResult (PR-197) — 제외 체크된 행은 저장 요청에서 빠진다', () => {
  it('제외된 인덱스는 결과 배열에서 빠진다', () => {
    const items = [bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' }), bomItem({ itemName: 'C' })];
    const result = buildCommitBomItems(items, new Set([1]));
    expect(result.map((i) => i.itemName)).toEqual(['A', 'C']);
  });

  it('제외 해제하면(빈 Set) 전부 그대로 포함된다(복원)', () => {
    const items = [bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })];
    expect(buildCommitBomItems(items, new Set())).toHaveLength(2);
  });

  it('buildCommitResult는 overview 등 다른 필드는 그대로 두고 bomItems만 거른다', () => {
    const result = buildResult([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })]);
    const committed = buildCommitResult(result, new Set([0]));
    expect(committed.bomItems.map((i) => i.itemName)).toEqual(['B']);
    expect(committed.overview.styleNo).toBe('S');
  });
});

describe('hasBlankMaterialName (PR-197) — 자재명을 비우면 저장 불가', () => {
  it('자재명이 비어 있으면(공백만 포함) true', () => {
    expect(hasBlankMaterialName([bomItem({ itemName: '' }), bomItem({ itemName: 'A' })])).toBe(true);
    expect(hasBlankMaterialName([bomItem({ itemName: '   ' })])).toBe(true);
  });

  it('전부 채워져 있으면 false', () => {
    expect(hasBlankMaterialName([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })])).toBe(false);
  });

  it('제외된 행을 먼저 거른 뒤 검사하면 빈 이름이 제외돼 통과한다', () => {
    const items = [bomItem({ itemName: '' }), bomItem({ itemName: 'B' })];
    const filtered = buildCommitBomItems(items, new Set([0]));
    expect(hasBlankMaterialName(filtered)).toBe(false);
  });
});

describe('normalizeMaterialName / isNewMaterialName (PR-197)', () => {
  it('공백·대소문자를 무시하고 비교한다', () => {
    expect(normalizeMaterialName('  스판사   테스트  ')).toBe('스판사 테스트');
    expect(normalizeMaterialName('ABC')).toBe('abc');
  });

  it('자재 마스터에 있으면(정규화 후 일치) 새 이름이 아니다', () => {
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    expect(isNewMaterialName('스쿠이사', existing)).toBe(false);
    expect(isNewMaterialName(' 스쿠이사 ', existing)).toBe(false);
  });

  it('자재 마스터에 없으면 새 이름이다', () => {
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    expect(isNewMaterialName('스팽사', existing)).toBe(true);
  });

  it('이름이 비어 있으면 새 이름으로 보지 않는다(저장 불가는 별도 처리)', () => {
    expect(isNewMaterialName('', new Set())).toBe(false);
    expect(isNewMaterialName(null, new Set())).toBe(false);
  });
});

describe('hasRequiredQtyMismatch (PR-197) — 요척 오인식 교차검증(값은 바꾸지 않음)', () => {
  it('요척 2.7 × 총수량 980 = 2,646인데 requiredQty가 2,842로 다르면(7.4% 차이) 의심 표시', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2842 }, 980)).toBe(true);
  });

  it('값이 1% 이내로 같으면 의심하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2646 }, 980)).toBe(false);
  });

  it('requiredQty를 AI가 못 읽었으면(null) 비교하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: null }, 980)).toBe(false);
  });

  it('총수량이 없으면 비교하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2842 }, null)).toBe(false);
  });
});

describe('computeDuplicateLookingRows (PR-197) — 스쿠이사·스판사·스팽사 19,600 사례(익명 데이터로 재현)', () => {
  it('같은 구분 안에서 소요량이 완전히 같은 행이 3개 이상이면 전부 표시한다', () => {
    const items = [
      bomItem({ itemName: '스쿠이사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '스판사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '스팽사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '다른자재', category: '부자재', consumption: 500 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([true, true, true, false]);
  });

  it('이름만 다르고 규격·소요량이 모두 같은 행(2개)도 표시한다', () => {
    const items = [
      bomItem({ itemName: '다데', category: 'X', spec: '50M', consumption: 2646 }),
      bomItem({ itemName: '다이렉트선', category: 'Y', spec: '50M', consumption: 2646 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([true, true]);
  });

  it('이름까지 완전히 같은 단순 반복 행은(2개뿐이면) 표시하지 않는다 — 이 배지는 "이름이 다른데 값이 같은" 경우만', () => {
    const items = [
      bomItem({ itemName: '같은자재', category: 'X', spec: '50M', consumption: 100 }),
      bomItem({ itemName: '같은자재', category: 'X', spec: '50M', consumption: 100 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([false, false]);
  });

  it('소요량이 다르면 표시하지 않는다', () => {
    const items = [
      bomItem({ itemName: 'A', category: 'X', consumption: 100 }),
      bomItem({ itemName: 'B', category: 'X', consumption: 200 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([false, false]);
  });
});

describe('computeBomRowBadges (PR-197) — 통합', () => {
  it('세 배지를 행마다 계산해 돌려준다', () => {
    const items = [
      bomItem({ itemName: '스쿠이사', category: 'X', consumption: 19600, requiredQty: 19600 }),
      bomItem({ itemName: '스판사', category: 'X', consumption: 19600, requiredQty: 19600 }),
      bomItem({ itemName: '스팽사', category: 'X', consumption: 19600, requiredQty: 19600 }),
    ];
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    const badges = computeBomRowBadges(items, 1, existing);
    expect(badges[0]).toEqual({ isNewMaterial: false, requiredQtyMismatch: false, duplicateLooking: true });
    expect(badges[1].isNewMaterial).toBe(true);
    expect(badges[2].isNewMaterial).toBe(true);
  });
});
