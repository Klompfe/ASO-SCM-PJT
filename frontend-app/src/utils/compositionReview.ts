import type { AiBomItem } from '../api/salesOrders.service';

// PR-246: 혼용률(자재 행 단위) 저장 화면용 순수 로직 — 값은 입력된 문자열 그대로 다룬다
// (대소문자 변환·번역·정규화 없음, 앞뒤 공백 제거만).

// 오더개요 요약·"미기재" 경고의 대상 행(원단류). 작지의 소재 표 행은 구분이 "겉감"으로, 안감·배색
// 계열은 각각 해당 구분으로 들어온다. 단추·라벨 같은 부자재는 혼용률이 없는 게 정상이라 경고
// 대상에서 뺀다(값을 입력한 행은 구분과 상관없이 요약에 포함된다).
export const COMPOSITION_TARGET_CATEGORIES: ReadonlySet<string> = new Set([
  '겉감', '안감', '배색', '배색감', '퀼팅안감', '폴리트윌안감',
]);

export const isCompositionTargetCategory = (category: string | null | undefined): boolean =>
  COMPOSITION_TARGET_CATEGORIES.has((category ?? '').trim());

export const cleanComposition = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

export interface CompositionGroup {
  value: string;
  rowCount: number;
}

export interface CompositionSummary {
  groups: CompositionGroup[];
  // 대상 구분(원단류)인데 혼용률이 비어 있는 행 수.
  missingRows: number;
}

// 제외 체크된 행은 저장되지 않으므로 요약에서도 뺀다.
export function summarizeCompositions(
  bomItems: Pick<AiBomItem, 'category' | 'composition'>[],
  excludedIndexes: Set<number> = new Set(),
): CompositionSummary {
  const counts = new Map<string, number>();
  let missingRows = 0;
  bomItems.forEach((item, i) => {
    if (excludedIndexes.has(i)) return;
    const value = cleanComposition(item.composition);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    else if (isCompositionTargetCategory(item.category)) missingRows++;
  });
  return { groups: [...counts.entries()].map(([value, rowCount]) => ({ value, rowCount })), missingRows };
}

// 예: "COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)". 값이 없으면 빈 문자열.
export function formatCompositionSummary(summary: CompositionSummary): string {
  return summary.groups.map((g) => `${g.value} (${g.rowCount}행)`).join(' / ');
}
