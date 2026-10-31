import { describe, expect, it } from 'vitest';
import {
  formatRequirementQty,
  formatCountOrQty,
  looksLikeThreadOrTape,
  buildThreadTapeSuggestion,
  ceilWithEpsilon,
  ceilToInt,
  computeRawRowPackaging,
  formatBomItemQty,
  type PackagingRuleLike,
} from './materialRequirementDisplay';

// PR-175 실제 시드값과 동일한 규칙(현재 DB 기준 — PR-216 보고서에 암홀=100 불일치 기록).
const RULES: PackagingRuleLike[] = [
  { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
  { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 },
  { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
  { materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 },
];

describe('formatRequirementQty (PR-216, PR-218에서 비포장 폴백도 올림으로 변경)', () => {
  it('packaging이 있으면 정수+단위만 보여준다(소수 없음)', () => {
    expect(formatRequirementQty(123.456, { requiredPackages: 1, packagingUnitLabel: '콘' })).toBe('1콘');
  });
  it('packaging이 없으면 정수로 올림한다(PR-218 — 기존엔 소수 4자리였다)', () => {
    expect(formatRequirementQty(123.4567)).toBe('124');
  });
});

describe('formatCountOrQty (PR-216, PR-218에서 비포장 폴백도 올림으로 변경)', () => {
  it('packagingCount와 라벨이 있으면 그 정수를 쓴다', () => {
    expect(formatCountOrQty(3.2, 4, '롤')).toBe('4롤');
  });
  it('packagingCount가 없으면 정수로 올림한다(PR-218)', () => {
    expect(formatCountOrQty(3.2, undefined, undefined)).toBe('4');
  });
});

describe('looksLikeThreadOrTape (PR-216, 백엔드 packaging-subtype.util.ts 미러링)', () => {
  it('규칙 displayName이 포함되면 실/테이프로 본다', () => {
    expect(looksLikeThreadOrTape('테이프(TAPE) 다데', RULES)).toBe(true);
  });
  it('"실"이 단어 경계로 둘러싸이면 해당', () => {
    expect(looksLikeThreadOrTape('오바사 60S/3H 실', RULES)).toBe(true);
  });
  it('"확실" 같은 단어 속의 "실"은 제외', () => {
    expect(looksLikeThreadOrTape('확실한 자재', RULES)).toBe(false);
  });
  it('무관한 자재명은 false', () => {
    expect(looksLikeThreadOrTape('겉감(WOOL)', RULES)).toBe(false);
  });
});

describe('buildThreadTapeSuggestion (PR-216)', () => {
  it('정확히 하나만 매칭되면 그 종류를 추천한다', () => {
    expect(buildThreadTapeSuggestion('암홀 테이프', RULES)).toMatchObject({ materialSubType: 'AMHOL' });
  });
  it('두 개 이상 매칭되면(예: 자재명에 다데/암홀이 둘 다 포함) 추천하지 않는다', () => {
    expect(buildThreadTapeSuggestion('다데 암홀 겸용 테이프', RULES)).toBeNull();
  });
  it('하나도 매칭되지 않으면 null', () => {
    expect(buildThreadTapeSuggestion('지퍼<금속>', RULES)).toBeNull();
  });
});

describe('ceilWithEpsilon (PR-216)', () => {
  it('정확히 나누어지면 그 값 그대로(부동소수점 오차로 한 단위 더 올라가지 않음)', () => {
    expect(ceilWithEpsilon(2500, 2500)).toBe(1);
    expect(ceilWithEpsilon(5000, 2500)).toBe(2);
  });
  it('부동소수점 오차가 있는 경계값도 한 단위 더 올라가지 않는다', () => {
    const value = 0.1 + 0.2; // 0.30000000000000004
    expect(ceilWithEpsilon(value * 10000, 3000)).toBe(1); // 3000.0000000000005 → 1콘이어야 함
  });
  it('실제로 초과하면 다음 단위로 올림', () => {
    expect(ceilWithEpsilon(2500.5, 2500)).toBe(2);
  });
});

describe('computeRawRowPackaging (PR-216, MappingPreviewModal 전용)', () => {
  it('종류가 하나로 확정되면 정수 포장수량과 산식을 돌려준다', () => {
    const result = computeRawRowPackaging('암홀 테이프', 120, RULES);
    expect(result).toMatchObject({ status: 'DETERMINED', packages: 3, unitLabel: '롤' });
  });
  it('실/테이프로 보이지 않으면 NOT_APPLICABLE(일반 자재는 그대로 소수 표시)', () => {
    expect(computeRawRowPackaging('겉감(WOOL)', 120, RULES)).toEqual({ status: 'NOT_APPLICABLE' });
  });
  it('실/테이프로 보이지만 종류를 하나로 못 정하면 AMBIGUOUS 경고만(추측해서 계산하지 않음)', () => {
    const result = computeRawRowPackaging('테이프(TAPE) 10MM', 120, RULES);
    expect(result.status).toBe('AMBIGUOUS');
  });
  it('추론된 종류의 규칙이 없으면(데이터 누락) AMBIGUOUS', () => {
    const result = computeRawRowPackaging('실', 120, []);
    // rules가 비어 있으면 looksLikeThreadOrTape는 STANDALONE_SIL로 true, suggestion은 null(매칭 0건)
    expect(result.status).toBe('AMBIGUOUS');
  });
});

describe('ceilToInt (PR-218)', () => {
  it('소수는 올림한 정수로', () => {
    expect(ceilToInt(12.3)).toBe(13);
  });
  it('부동소수점 오차가 있는 정수 경계값은 한 단위 더 올라가지 않는다', () => {
    expect(ceilToInt(5000 + 1e-10)).toBe(5000);
  });
  it('이미 정수면 그대로', () => {
    expect(ceilToInt(7)).toBe(7);
  });
  it('0은 -0이 아니라 0으로 정규화된다(엑셀 재파싱 시 값 불일치 방지)', () => {
    expect(ceilToInt(0)).toBe(0);
    expect(Object.is(ceilToInt(0), -0)).toBe(false);
  });
});

describe('formatBomItemQty (PR-218, ItemsManager의 BOM 조회처럼 threadType/tapeType이 이미 지정된 화면 전용)', () => {
  it('종류가 지정돼 있고 규칙이 있으면(단위 M) 정수+포장단위', () => {
    const result = formatBomItemQty(1134.6, { subtype: 'AMHOL', itemName: '암홀 테이프', itemUnit: 'M' }, RULES);
    expect(result).toMatchObject({ kind: 'PACKAGED', text: '23롤' }); // ceil(1134.6/50)=23
  });
  it('코아사(2500M/콘) — 부동소수점 경계값도 한 단위 더 올라가지 않는다', () => {
    const result = formatBomItemQty(5000.0000001, { subtype: 'COA_SA', itemName: '코아사', itemUnit: 'M' }, RULES);
    expect(result).toMatchObject({ kind: 'PACKAGED', text: '2콘' });
  });
  it('종류 미지정 + 자재명이 실/테이프로 보이면 SUBTYPE_NEEDED 경고(추측해서 계산하지 않음)', () => {
    const result = formatBomItemQty(120, { subtype: null, itemName: '테이프(TAPE) 10MM', itemUnit: 'M' }, RULES);
    expect(result.kind).toBe('SUBTYPE_NEEDED');
  });
  it('종류 미지정 + 일반 자재명이면 정수로 올림(ROUNDED)', () => {
    const result = formatBomItemQty(12.3, { subtype: null, itemName: '겉감(WOOL)', itemUnit: 'Y' }, RULES);
    expect(result).toEqual({ kind: 'ROUNDED', text: '13', originalQty: 12.3 });
  });
  it('단위 EA도 정수로 올림(ROUNDED)', () => {
    const result = formatBomItemQty(4.2, { subtype: null, itemName: '버튼', itemUnit: 'EA' }, RULES);
    expect(result).toEqual({ kind: 'ROUNDED', text: '5', originalQty: 4.2 });
  });
  it('규칙이 미터(M) 기준인데 자재 단위가 다르면(예: Y) 환산하지 않고 UNIT_MISMATCH', () => {
    const result = formatBomItemQty(100, { subtype: 'DADE', itemName: '다데', itemUnit: 'Y' }, RULES);
    expect(result.kind).toBe('UNIT_MISMATCH');
  });
});
