export interface RequirementBomItem {
  id: number;
  category?: string | null;
  colorCode?: string | null;
  consumption: unknown;
  material?: { id: number; code?: string | null; name: string } | null;
}

export interface MaterialRequirementRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  categories: string[];
  colors: string[];
  // 제품 1개당 소요량(요척). 같은 자재가 색상/규격별로 BOM 행이 여러 개면 합산한 값.
  consumptionPerUnit: number;
  // 필요 총수량 = 제품 1개당 소요량 × 작업지시 물량(targetQuantity)
  requiredQty: number;
  // 이 자재로 이미 발주한 수량(취소 제외, 전체 발주 합계 — 발주는 작업지시/스타일에 연결돼 있지 않다)
  orderedQty: number;
  // 부족 수량 = max(0, 필요 총수량 - 이미 발주 수량)
  shortageQty: number;
  lineCount: number;
}

// pg decimal은 문자열로 올 수 있어 Number()로 통일한다. 소수 4자리로 반올림해 부동소수 오차(0.1*3 등)를 없앤다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

// BOM 전개: 자재별 필요 총수량 = consumption(제품 1개당) × targetQuantity. 기존 재고 차감 로직
// (work-orders.service.ts: Number(bomItem.consumption) * wo.targetQuantity)과 같은 식이다.
// BomItem.requiredQty(저장값)는 BOM 등록 당시 시트의 총 오더수량으로 계산된 스냅샷이라
// (section-parser: consumption × totalQty) 이 작업지시 물량과 무관하므로 쓰지 않는다.
//
// 같은 자재(Item)가 BOM에 여러 행(색상/규격 다름)으로 있으면 자재 기준으로 합쳐서 계산한다 —
// 발주 수량은 자재 단위로 잡혀 있어, 행마다 비교하면 같은 발주량이 중복 차감되기 때문이다.
export function calculateMaterialRequirements(
  targetQuantity: number,
  bomItems: RequirementBomItem[],
  orderedByItemId: Map<number, number>,
): MaterialRequirementRow[] {
  const target = num(targetQuantity);
  const map = new Map<number, MaterialRequirementRow>();

  for (const bi of [...bomItems].sort((a, b) => a.id - b.id)) {
    if (!bi.material) continue;
    const perUnit = num(bi.consumption);
    const cur =
      map.get(bi.material.id) ??
      {
        itemId: bi.material.id,
        itemCode: bi.material.code ?? '',
        itemName: bi.material.name,
        categories: [],
        colors: [],
        consumptionPerUnit: 0,
        requiredQty: 0,
        orderedQty: 0,
        shortageQty: 0,
        lineCount: 0,
      };
    cur.consumptionPerUnit = round4(cur.consumptionPerUnit + perUnit);
    cur.requiredQty = round4(cur.requiredQty + perUnit * target);
    cur.lineCount += 1;
    const category = (bi.category ?? '').trim();
    if (category && !cur.categories.includes(category)) cur.categories.push(category);
    const color = (bi.colorCode ?? '').trim();
    if (color && !cur.colors.includes(color)) cur.colors.push(color);
    map.set(bi.material.id, cur);
  }

  for (const row of map.values()) {
    row.orderedQty = round4(num(orderedByItemId.get(row.itemId)));
    row.shortageQty = Math.max(0, round4(row.requiredQty - row.orderedQty));
  }
  return [...map.values()];
}
