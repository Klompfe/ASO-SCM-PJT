// PR-199: 반복(--runs) 간 같은 칸이 실행마다 다르게 읽히는 비율 — 불안정한 필드일수록
// 신뢰할 수 없다는 위험 신호다.
export interface InstabilityInput {
  fieldKey: string;
  valuesByRun: (string | number | null)[];
}

export interface InstabilityResult {
  fieldKey: string;
  distinctValueCount: number;
  // (서로 다른 값 종류 - 1) / 유효 실행 수. 전부 같으면 0.
  instabilityRate: number;
}

export function computeInstability(input: InstabilityInput): InstabilityResult {
  const nonNull = input.valuesByRun.filter((v) => v != null);
  const distinct = new Set(nonNull.map((v) => String(v)));
  const instabilityRate = nonNull.length > 0 ? Math.max(0, (distinct.size - 1) / nonNull.length) : 0;
  return { fieldKey: input.fieldKey, distinctValueCount: distinct.size, instabilityRate };
}

// 실행마다 값이 2종 이상 나온(= 불안정한) 필드만 골라 돌려준다(위험 필드 목록용).
export function identifyUnstableFields(inputs: InstabilityInput[]): InstabilityResult[] {
  return inputs.map(computeInstability).filter((r) => r.distinctValueCount > 1);
}
