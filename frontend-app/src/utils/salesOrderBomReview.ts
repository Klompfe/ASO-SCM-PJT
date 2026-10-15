import type { AiBomItem, AiSalesOrderResult } from '../api/salesOrders.service';

// PR-197: 작지 AI 분석 결과의 "2) 자재명세" 표를 저장 전에 사람이 고치고/빼고 할 수
// 있게 하는 순수 함수들. updateOverviewField/setBomItemSubType(salesOrderOverviewEdit.ts)과
// 같은 방식(불변, index 기반)이되, 이 파일은 "자재명세 검토" 영역만 다룬다.

// 행 하나의 필드(자재명/규격/소요량 등)를 직접 수정한다. "제외" 여부는 여기서
// 다루지 않는다(AiBomItem/커밋 페이로드에 excluded 필드를 넣지 않기 위해 컴포넌트가
// 별도의 Set<number>로 들고 있다가 저장 직전에만 걸러낸다 — buildCommitResult 참고).
export function updateBomItemField<K extends keyof AiBomItem>(
  results: AiSalesOrderResult[],
  resultIndex: number,
  bomIndex: number,
  field: K,
  value: AiBomItem[K],
): AiSalesOrderResult[] {
  return results.map((r, ri) => {
    if (ri !== resultIndex) return r;
    return { ...r, bomItems: r.bomItems.map((b, bi) => (bi !== bomIndex ? b : { ...b, [field]: value })) };
  });
}

// 제외 체크된 행을 뺀 저장용 bomItems — 화면 표시용 results 상태 자체는 건드리지 않아
// 체크 해제로 되돌릴 수 있다(저장 직전에만 적용).
export function buildCommitBomItems(bomItems: AiBomItem[], excludedIndexes: Set<number>): AiBomItem[] {
  return bomItems.filter((_, i) => !excludedIndexes.has(i));
}

export function buildCommitResult(result: AiSalesOrderResult, excludedIndexes: Set<number>): AiSalesOrderResult {
  return { ...result, bomItems: buildCommitBomItems(result.bomItems, excludedIndexes) };
}

// 자재명을 비우면 저장할 수 없다 — 커밋 직전(제외 필터링 후) bomItems에 적용한다.
export function hasBlankMaterialName(bomItems: Pick<AiBomItem, 'itemName'>[]): boolean {
  return bomItems.some((b) => !b.itemName.trim());
}

// 자재명 비교용 정규화(공백 접기·trim·대소문자 무시) — "자재 마스터에 없는 새 이름"
// 배지와 중복행 판별(이름이 서로 다른지) 양쪽에서 같은 기준을 쓴다.
export function normalizeMaterialName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// "자재 마스터에 없는 새 이름" — 저장 시 새 Item이 만들어지는 행. existingNormalizedNames는
// 호출자가 GET /items 결과를 normalizeMaterialName으로 미리 정규화해 넘긴다.
export function isNewMaterialName(itemName: string | null | undefined, existingNormalizedNames: Set<string>): boolean {
  const n = normalizeMaterialName(itemName);
  if (!n) return false;
  return !existingNormalizedNames.has(n);
}

// "요척 × 수량이 작지의 출고량(필요량)과 다름" — AI가 requiredQty를 읽었을 때만
// 비교한다(없으면 비교 안 함, 값은 절대 바꾸지 않는다). 1% 넘게 다르면 의심.
export function hasRequiredQtyMismatch(
  item: Pick<AiBomItem, 'consumption' | 'requiredQty'>,
  totalQty: number | null | undefined,
): boolean {
  if (item.requiredQty == null || item.consumption == null || totalQty == null || totalQty <= 0) return false;
  const expected = item.consumption * totalQty;
  if (expected === 0) return false;
  return Math.abs(expected - item.requiredQty) / Math.abs(expected) > 0.01;
}

// "같은 구분·같은 소요량 중복" — ① 같은 category 안에서 소요량이 완전히 같은 행이
// 3개 이상이거나, ② 이름만 다르고 규격·소요량이 모두 같은 행(2개 이상, 이름이
// 서로 달라야 함 — 이름까지 같은 단순 반복 행은 이 배지의 대상이 아니다).
export function computeDuplicateLookingRows(bomItems: Pick<AiBomItem, 'itemName' | 'category' | 'spec' | 'consumption'>[]): boolean[] {
  const flags = new Array(bomItems.length).fill(false);

  const byCategoryConsumption = new Map<string, number[]>();
  bomItems.forEach((item, i) => {
    if (item.consumption == null) return;
    const key = `${item.category ?? ''}\u0000${item.consumption}`;
    byCategoryConsumption.set(key, [...(byCategoryConsumption.get(key) ?? []), i]);
  });
  for (const indices of byCategoryConsumption.values()) {
    if (indices.length >= 3) indices.forEach((i) => { flags[i] = true; });
  }

  const bySpecConsumption = new Map<string, number[]>();
  bomItems.forEach((item, i) => {
    if (item.consumption == null) return;
    const key = `${item.spec ?? ''}\u0000${item.consumption}`;
    bySpecConsumption.set(key, [...(bySpecConsumption.get(key) ?? []), i]);
  });
  for (const indices of bySpecConsumption.values()) {
    if (indices.length < 2) continue;
    const names = new Set(indices.map((i) => normalizeMaterialName(bomItems[i].itemName)));
    if (names.size >= 2) indices.forEach((i) => { flags[i] = true; });
  }

  return flags;
}

export interface BomRowBadges {
  isNewMaterial: boolean;
  requiredQtyMismatch: boolean;
  duplicateLooking: boolean;
}

export function computeBomRowBadges(
  bomItems: AiBomItem[],
  totalQty: number | null | undefined,
  existingNormalizedNames: Set<string>,
): BomRowBadges[] {
  const duplicateFlags = computeDuplicateLookingRows(bomItems);
  return bomItems.map((item, i) => ({
    isNewMaterial: isNewMaterialName(item.itemName, existingNormalizedNames),
    requiredQtyMismatch: hasRequiredQtyMismatch(item, totalQty),
    duplicateLooking: duplicateFlags[i],
  }));
}
