import { describe, expect, it } from 'vitest';
import { buildColorQtyMap, resolveAppliedQuantity, formatLotBreakdown, sheetQtyLooksLikeTotalQtyMisread } from './appliedQuantity';
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

// PR-226(사용자 확정): 계산값(색상수량표/총수량×요척)이 있으면 그 값을 적용한다 —
// 작지 수량(sheetQty)은 1순위가 아니라 대조·대체 근거다. 배경: 작지 출고량 칸이
// LOT 여러 줄로 나뉘어 있었는데 인식이 한 줄만 읽어 실제보다 적은 값을 작지수량으로
// 잡았고, 그 값을 1순위로 쓰면 다른 자재(전부 계산값 적용)와 기준이 달라져 틀린
// 결과가 나왔다 — 계산값이 있으면 계산값을 쓰고 작지 값은 비교만 하도록 바꾼다.
describe('resolveAppliedQuantity (PR-226) — 계산값 우선, 작지 값은 대조·대체 근거', () => {
  it('① 색상×사이즈 수량표로 계산값이 있고 작지 값도 있으면(5% 이내) 계산값을 적용하고 mismatch는 false다', () => {
    const colorQtyMap = buildColorQtyMap([{ color: 'KH', qty: 758 }]);
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1518, sheetQty: 760, sheetQtyUnit: 'Y', itemUnit: 'Y',
      colorCode: 'KH', colorQtyMap,
    });
    expect(r.basis).toBe('color-qty');
    expect(r.qty).toBe(758); // 계산값 적용(작지 760이 아님)
    expect(r.sheetQty).toBe(760); // 대조용으로는 그대로 보관
    expect(r.mismatch).toBe(false);
  });

  it('② 계산값과 작지 값 차이가 ±5% 넘으면 계산값을 적용하고 mismatch:true — 사용자가 보고한 실제 버그 재현(LOT 한 줄만 인식된 499)', () => {
    const colorQtyMap = buildColorQtyMap([{ color: 'KH', qty: 758 }]);
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1518, sheetQty: 499, sheetQtyUnit: 'Y', itemUnit: 'Y',
      colorCode: 'KH', colorQtyMap,
    });
    expect(r.basis).toBe('color-qty');
    expect(r.qty).toBe(758); // PR-222 시절과 달리 더 이상 작지 값(499)을 쓰지 않는다
    expect(r.sheetQty).toBe(499);
    expect(r.mismatch).toBe(true);
  });

  it('공통 색상 행(총수량×요척 계산값)도 같은 규칙 — 작지 값과 차이가 크면 mismatch지만 계산값을 적용한다', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1000, sheetQty: 500, sheetQtyUnit: 'Y', itemUnit: 'Y',
      colorCode: '', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('computed');
    expect(r.qty).toBe(1000);
    expect(r.sheetQty).toBe(500);
    expect(r.mismatch).toBe(true);
  });

  it('③ 계산값이 없는 행(수량표에 그 색상이 없음)은 여전히 작지 값을 적용한다(기존 PR-220 동작 유지)', () => {
    const colorQtyMap = buildColorQtyMap([{ color: 'BL', qty: 760 }]); // KH는 수량표에 없음
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1518, sheetQty: 758, sheetQtyUnit: 'Y', itemUnit: 'Y',
      colorCode: 'KH', colorQtyMap,
    });
    expect(r.basis).toBe('sheet');
    expect(r.qty).toBe(758);
  });

  it('④ 색상은 있고 계산값도 작지 값도 없으면 기존대로 unknown이다(화면은 needsColorQty로 표시)', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1518, sheetQty: null, sheetQtyUnit: null, itemUnit: 'Y',
      colorCode: 'KH', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('unknown');
  });

  it('⑤ 색상 없는 행(FREE/N/A/빈칸)은 작지 값이 있어도 총수량×요척을 적용한다', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.0, totalQty: 1518, sheetQty: 1200, sheetQtyUnit: 'Y', itemUnit: 'Y',
      colorCode: 'FREE', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('computed');
    expect(r.qty).toBe(1518);
  });
});

describe('formatLotBreakdown (PR-226) — LOT 내역 표시 문자열', () => {
  it('LOT 2줄이면 "LOT1 a + LOT2 b = 합" 형태를 만든다', () => {
    expect(formatLotBreakdown([499, 259])).toBe('LOT1 499 + LOT2 259 = 758');
  });

  it('LOT 1줄뿐이면(합산할 필요 없음) null', () => {
    expect(formatLotBreakdown([758])).toBeNull();
  });

  it('없거나 배열이 아니면 null', () => {
    expect(formatLotBreakdown(null)).toBeNull();
    expect(formatLotBreakdown(undefined)).toBeNull();
  });
});

// PR-226 추가 지시(사용자가 작지 원본으로 확인한 사실, 합성 값으로 재현): 요척 1.52,
// 총수량 499, LOT 2줄 317.54/442.54(합계 760.08). 계산값 499×1.52=758.48, 차이 약 0.2%
// → 일치. 처음에 보였던 "작지수량 499"는 LOT 값이 아니라 총수량과 같은 숫자였다 —
// 출고량 칸이 아닌 칸을 읽었을 가능성이 크므로, mismatch일 때 작지 값이 총수량과
// 정확히 같으면 그 사실을 표시한다(소수 오차 허용 안 함).
describe('sheetQtyLooksLikeTotalQtyMisread (PR-226 추가) — 순수 함수', () => {
  it('mismatch가 없으면 항상 false', () => {
    expect(sheetQtyLooksLikeTotalQtyMisread(499, 499, false)).toBe(false);
  });
  it('mismatch가 있고 작지 값이 총수량과 정확히 같으면 true', () => {
    expect(sheetQtyLooksLikeTotalQtyMisread(499, 499, true)).toBe(true);
  });
  it('mismatch가 있어도 작지 값이 총수량과 다르면(500 vs 499) false', () => {
    expect(sheetQtyLooksLikeTotalQtyMisread(499, 500, true)).toBe(false);
  });
});

describe('resolveAppliedQuantity (PR-226 추가) — 총수량 오독 방어 통합', () => {
  it('정상 케이스: LOT 합산 760.08(작지수량) vs 계산값 758.48(차이 0.2%) → mismatch 없음, 오독 표시도 없음', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.52, totalQty: 499, sheetQty: 760.08, sheetQtyUnit: 'YD', itemUnit: 'YD',
      colorCode: '', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('computed');
    expect(r.qty).toBeCloseTo(758.48, 2);
    expect(r.mismatch).toBe(false);
    expect(r.sheetQtyLooksLikeTotalQtyMisread).toBe(false);
  });

  it('오독 케이스: 작지 값 499(총수량과 정확히 같음) vs 계산값 758.48(차이 34%) → mismatch + 총수량 오독 표시, 적용은 그대로 계산값', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.52, totalQty: 499, sheetQty: 499, sheetQtyUnit: 'YD', itemUnit: 'YD',
      colorCode: '', colorQtyMap: new Map(),
    });
    expect(r.basis).toBe('computed');
    expect(r.qty).toBeCloseTo(758.48, 2); // 자동으로 버리지 않고 계산값을 그대로 적용
    expect(r.mismatch).toBe(true);
    expect(r.sheetQtyLooksLikeTotalQtyMisread).toBe(true);
  });

  it('작지 값이 총수량과 다르면(500 ≠ 499) mismatch여도 총수량 오독 표시는 붙지 않는다', () => {
    const r = resolveAppliedQuantity({
      consumption: 1.52, totalQty: 499, sheetQty: 500, sheetQtyUnit: 'YD', itemUnit: 'YD',
      colorCode: '', colorQtyMap: new Map(),
    });
    expect(r.mismatch).toBe(true);
    expect(r.sheetQtyLooksLikeTotalQtyMisread).toBe(false);
  });
});
