// PR-246: 혼용률(BomItem.composition) 재저장 규칙 — 순수 함수(DB 접근 없음).
// 저장 시(mapping-commit.service.ts commit())와 저장 전 비교(compare)가 같은 판정을 쓰도록 한 곳에 둔다.
// 값은 입력·인식된 문자열 그대로 비교·저장한다(대소문자 변환·번역·정규화 없음, 앞뒤 공백 제거만).

export type CompositionStatus = 'same' | 'fillEmpty' | 'differs' | 'incomingEmpty';

export function cleanComposition(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function classifyCompositionStatus(existing: unknown, incoming: unknown): CompositionStatus {
  const inc = cleanComposition(incoming);
  if (inc == null) return 'incomingEmpty';
  const ex = cleanComposition(existing);
  if (ex == null) return 'fillEmpty';
  return ex === inc ? 'same' : 'differs';
}

export interface CompositionUpdateResult {
  status: CompositionStatus;
  // 저장해야 할 값. changed=false이면 기존 값 그대로.
  value: string | null;
  changed: boolean;
  // differs인데 덮어쓰기 표시가 없어 기존 값을 유지했다.
  keptDifferent: boolean;
}

// 기존 행에 대한 규칙: 비어 있음→채움 / 같음→변화 없음 / 다름→유지(overwrite=true일 때만 교체) /
// 들어온 값이 비어 있음→기존 값을 지우지 않음.
export function resolveCompositionUpdate(existing: unknown, incoming: unknown, overwrite: boolean): CompositionUpdateResult {
  const status = classifyCompositionStatus(existing, incoming);
  const ex = cleanComposition(existing);
  const inc = cleanComposition(incoming);
  if (status === 'fillEmpty') return { status, value: inc, changed: true, keptDifferent: false };
  if (status === 'differs') {
    return overwrite
      ? { status, value: inc, changed: true, keptDifferent: false }
      : { status, value: ex, changed: false, keptDifferent: true };
  }
  return { status, value: ex, changed: false, keptDifferent: false };
}
