// PR-239: "필요수량 직접 지정"(PR-231)은 항상 길이 단위(M 등) 값으로 해석되고 저장된다
// (resolveAppliedQuantity/material-requirements.util.ts 모두 manualRequiredQty를 그대로
// colorMeters/필요량에 더한다). 포장 규칙이 있는 행(실/테이프)에서 사용자가 "46콘"을
// 의도하고 46을 넣으면 46M로 저장돼 46÷2500 → 1콘이 되는 사고가 실사용에서 발생했다
// (사용자 보고, 합성 수치로 재구성: 포장 규칙 2500M/콘, 46콘 의도 → 1콘으로 저장됨).
// 해결: 입력 단위(길이/포장 수)를 명시적으로 고르게 하고, 포장 수로 입력하면
// "수 × 규칙길이"로 길이 값으로 환산해 기존 manualRequiredQty(길이 단위)에 저장한다 —
// 저장 스키마·계산 로직(ROUNDUP) 자체는 바꾸지 않는다.
export type ManualQtyInputMode = 'length' | 'packages';

export interface PackagingRuleContext {
  packagingUnitLabel: string;
  unitLengthM: number;
}

// 포장 규칙이 있으면 기본 입력 단위는 "포장 수"(사용자가 실제로 세는 단위) — 없으면 길이.
export function defaultManualQtyInputMode(context: PackagingRuleContext | null): ManualQtyInputMode {
  return context ? 'packages' : 'length';
}

export interface ManualQtyResolution {
  // manualRequiredQty에 저장할 값 — 항상 길이 단위(M). 포장 수 모드면 수×규칙길이.
  lengthQty: number;
  // 포장 수 모드일 때만 자동으로 기록할 사유 문구 — 길이 모드면 null(사용자 입력 사유만 쓴다).
  autoNote: string | null;
}

export function resolveManualQtyInput(
  rawValue: number,
  mode: ManualQtyInputMode,
  context: PackagingRuleContext | null,
): ManualQtyResolution {
  if (mode === 'packages' && context) {
    const lengthQty = rawValue * context.unitLengthM;
    return {
      lengthQty,
      autoNote: `${rawValue.toLocaleString('ko-KR')}${context.packagingUnitLabel} 기준(규칙 ${context.unitLengthM}M/${context.packagingUnitLabel})`,
    };
  }
  return { lengthQty: rawValue, autoNote: null };
}

const EPSILON = 1e-9;
const ceilWithEpsilon = (value: number, divisor: number): number => Math.ceil(value / divisor - EPSILON) || 0;

// 입력칸 아래 실시간 미리보기 — "→ 필요량 115,000M = 46콘"(포장 수 입력) 또는
// "→ 필요량 50,000M ≈ 20콘"(길이 입력, 참고 환산) 식으로 입력값이 어떻게 해석되는지
// 즉시 보여준다. context가 없으면(포장 규칙 없음) 길이만 보여준다.
export function describeManualQtyPreview(
  rawValue: number,
  mode: ManualQtyInputMode,
  context: PackagingRuleContext | null,
): string {
  const { lengthQty } = resolveManualQtyInput(rawValue, mode, context);
  const lengthText = `필요량 ${lengthQty.toLocaleString('ko-KR')}M`;
  if (!context) return `→ ${lengthText}`;
  const packages = ceilWithEpsilon(lengthQty, context.unitLengthM);
  return mode === 'packages'
    ? `→ ${lengthText} = ${rawValue.toLocaleString('ko-KR')}${context.packagingUnitLabel}`
    : `→ ${lengthText} ≈ ${packages}${context.packagingUnitLabel}`;
}

// 입력칸 옆 단위 라벨 — 마스터 단위(품목 Item.unit, 예: EA)가 아니라 "지금 선택한
// 입력 단위"를 보여준다(기존 버그: 포장 수를 입력하는데 옆에는 항상 마스터 단위가 떴다).
export function manualQtyInputUnitLabel(
  mode: ManualQtyInputMode,
  context: PackagingRuleContext | null,
  itemUnit: string | null | undefined,
): string {
  if (mode === 'packages' && context) return context.packagingUnitLabel;
  return itemUnit ?? '';
}
