// PR-182: INVOICE 라인 USD 단가 확정 — 원시 후보값을 그대로 쓸 때와, 미터단가 →
// 콘/롤단가 환산 옵션을 쓸 때 입력란/근거 코멘트가 어떻게 채워지는지를 순수 함수로
// 뽑아 DOM 없이 테스트한다(기존 updateOverviewField 등과 같은 원칙).
export interface PriceEditorSelection {
  unitPriceUsdInput: string;
  candidateId: number | null;
  priceBasisNote: string | null;
}

// 환산이 필요 없는(또는 적용되지 않는) 후보를 그대로 쓴다 — 근거 코멘트는 없다(기존 PR-157 동작).
export function selectRawCandidate(priceUsdMin: number, candidateId: number): PriceEditorSelection {
  return { unitPriceUsdInput: String(priceUsdMin), candidateId, priceBasisNote: null };
}

// 콘/롤단가 환산 옵션을 쓴다 — 근거 코멘트(검산용 식)를 함께 남긴다.
export function selectConvertedOption(
  candidateId: number,
  option: { unitPriceUsd: number; formula: string; displayName: string },
): PriceEditorSelection {
  return {
    unitPriceUsdInput: String(option.unitPriceUsd),
    candidateId,
    priceBasisNote: `미도 단가표 ${option.formula}(${option.displayName})`,
  };
}

// 입력란을 사람이 직접 고치면 후보 선택이 풀린다 — 실제로 쓴 값과 출처가 항상 일치하게 한다(PR-157 원칙).
export function clearSelection(unitPriceUsdInput: string): PriceEditorSelection {
  return { unitPriceUsdInput, candidateId: null, priceBasisNote: null };
}

export type PriceSource = 'MIDO_PRICE_TABLE' | 'MANUAL';

export function resolveSource(candidateId: number | null): PriceSource {
  return candidateId != null ? 'MIDO_PRICE_TABLE' : 'MANUAL';
}
