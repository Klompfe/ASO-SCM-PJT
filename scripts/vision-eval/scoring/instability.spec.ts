import { computeInstability, identifyUnstableFields } from './instability';

describe('computeInstability (PR-199)', () => {
  it('모든 실행에서 값이 같으면 불안정도 0', () => {
    expect(computeInstability({ fieldKey: 'A', valuesByRun: [2.7, 2.7, 2.7] })).toEqual({
      fieldKey: 'A', distinctValueCount: 1, instabilityRate: 0,
    });
  });

  it('3번 중 1번만 다르면 종류 2개, 비율 1/3(실사례: 요척이 2.7/2.7/2.9로 흔들림)', () => {
    const result = computeInstability({ fieldKey: 'A', valuesByRun: [2.7, 2.7, 2.9] });
    expect(result.distinctValueCount).toBe(2);
    expect(result.instabilityRate).toBeCloseTo(1 / 3);
  });

  it('null은 유효 실행에서 제외한다', () => {
    const result = computeInstability({ fieldKey: 'A', valuesByRun: [2.7, null, 2.7] });
    expect(result.distinctValueCount).toBe(1);
    expect(result.instabilityRate).toBe(0);
  });
});

describe('identifyUnstableFields (PR-199) — 위험 필드 목록', () => {
  it('값이 2종 이상 나온 필드만 골라낸다', () => {
    const result = identifyUnstableFields([
      { fieldKey: '안정필드', valuesByRun: [1, 1, 1] },
      { fieldKey: '불안정필드', valuesByRun: [2.7, 2.9, 2.7] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].fieldKey).toBe('불안정필드');
  });
});
