import { describe, expect, it } from 'vitest';
import { buildColorQtyMap, resolveAppliedQuantity } from './appliedQuantity';
import { formatBomItemQty, ceilToInt, type PackagingRuleLike } from './materialRequirementDisplay';

const RULES: PackagingRuleLike[] = [
  { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
  { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사', packagingUnitLabel: '콘', unitLengthM: 4000 },
];

describe('resolveAppliedQuantity (PR-222)', () => {
  it('① 작지수량 760 yd(단위 일치) → 근거 sheet, qty 760', () => {
    const r = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: 760, sheetQtyUnit: 'yd', itemUnit: 'yd',
      colorCode: 'BL', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('sheet');
    expect(r.qty).toBe(760);
  });

  it('② 작지수량 없음 + 색상 수량 합계 499 + 요척 0.26 → 근거 color-qty, qty=129.74(정수 올림 전)', () => {
    const colorQtyMap = buildColorQtyMap([{ color: 'BL', qty: 499 }]);
    const r = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: null, sheetQtyUnit: null, itemUnit: 'yd',
      colorCode: 'BL', colorQtyMap,
    });
    expect(r.basis).toBe('color-qty');
    expect(r.qty).toBeCloseTo(129.74, 5);
    expect(ceilToInt(r.qty)).toBe(130);
  });

  it('③ 색상 없는 행(FREE/N/A/빈칸) → 총수량 × 요척, 근거 computed', () => {
    for (const colorCode of ['', 'FREE', 'N/A', 'free', '  ']) {
      const r = resolveAppliedQuantity({
        consumption: 0.26, totalQty: 3000, sheetQty: null, sheetQtyUnit: null, itemUnit: 'yd',
        colorCode, colorQtyMap: new Map(),
      });
      expect(r.basis).toBe('computed');
      expect(r.qty).toBeCloseTo(780, 5);
    }
  });

  it('④ 색상은 있는데 근거(작지수량/수량표) 없음 → unknown, qty 0', () => {
    const r = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: null, sheetQtyUnit: null, itemUnit: 'yd',
      colorCode: 'KH', colorQtyMap: buildColorQtyMap([{ color: 'BL', qty: 499 }]),
    });
    expect(r.basis).toBe('unknown');
    expect(r.qty).toBe(0);
  });

  it('⑤-a 실 130m + 코아사(2500m/콘, 합성 규칙) → 1콘', () => {
    const r = resolveAppliedQuantity({
      consumption: 130, totalQty: 1, sheetQty: null, sheetQtyUnit: null, itemUnit: 'm',
      colorCode: '', colorQtyMap: new Map(),
    });
    const display = formatBomItemQty(r.qty, { subtype: 'COA_SA', itemName: '코아사', itemUnit: 'm' }, RULES);
    expect(display.kind).toBe('PACKAGED');
    expect(display.text).toBe('1콘');
  });

  it('⑤-b 오바사(4000m/콘) 종류 미지정이면 경고(SUBTYPE_NEEDED)', () => {
    const r = resolveAppliedQuantity({
      consumption: 130, totalQty: 1, sheetQty: null, sheetQtyUnit: null, itemUnit: 'm',
      colorCode: '', colorQtyMap: new Map(),
    });
    const display = formatBomItemQty(r.qty, { subtype: null, itemName: '오바사', itemUnit: 'm' }, RULES);
    expect(display.kind).toBe('SUBTYPE_NEEDED');
  });

  it('⑥ mismatch(±5% 초과) 행은 작지 값과 계산값이 둘 다 result에 담긴다', () => {
    // 계산값 = 0.26 × 3000 = 780, 작지수량 760 → 차이 2.6% (5% 이하, mismatch 아님)
    const r1 = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: 760, sheetQtyUnit: 'yd', itemUnit: 'yd',
      colorCode: 'BL', colorQtyMap: new Map(),
    });
    expect(r1.mismatch).toBe(false);
    // 작지수량 600 vs 계산값 780 → 차이 23% (5% 초과, mismatch)
    const r2 = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: 600, sheetQtyUnit: 'yd', itemUnit: 'yd',
      colorCode: 'BL', colorQtyMap: new Map(),
    });
    expect(r2.basis).toBe('sheet');
    expect(r2.qty).toBe(600);
    expect(r2.computedQty).toBeCloseTo(780, 5);
    expect(r2.mismatch).toBe(true);
  });

  it('⑦ 작지수량 입력값을 바꾸면 적용 수량도 바뀐다(같은 함수를 다른 입력으로 다시 호출)', () => {
    const base = { consumption: 0.26, totalQty: 3000, sheetQtyUnit: 'yd', itemUnit: 'yd', colorCode: 'BL', colorQtyMap: new Map() };
    const before = resolveAppliedQuantity({ ...base, sheetQty: 760 });
    const after = resolveAppliedQuantity({ ...base, sheetQty: 800 });
    expect(before.qty).toBe(760);
    expect(after.qty).toBe(800);
  });

  it('단위가 다르면(작지수량 단위 ≠ item 단위) sheet 근거를 쓰지 않고 다음 우선순위로 넘어간다', () => {
    const r = resolveAppliedQuantity({
      consumption: 0.26, totalQty: 3000, sheetQty: 760, sheetQtyUnit: 'm', itemUnit: 'yd',
      colorCode: '', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('computed');
  });
});
