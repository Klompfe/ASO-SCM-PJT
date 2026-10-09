import { classifyPackagingUnit } from '../../export-shipments/utils/meter-price-conversion.util';

export interface RequirementBomItem {
  id: number;
  category?: string | null;
  colorCode?: string | null;
  consumption: unknown;
  material?: { id: number; code?: string | null; name: string; unit?: string | null } | null;
  // PR-185 B-2: 실(threadType)/테이프(tapeType) 종류 — 콘/롤 환산에 쓴다. BOM 행에 값이
  // 없으면(미지정) 추측하지 않고 환산하지 않는다.
  threadType?: string | null;
  tapeType?: string | null;
}

// PR-185 B-2: material_packaging_unit_rules(PR-175) 한 행 — materialSubType → 포장단위/단위길이.
export interface PackagingUnitRuleLike {
  materialSubType: string;
  packagingUnitLabel: string;
  unitLengthM: number;
}

export interface PackagingConversion {
  packagingUnitLabel: string;
  unitLengthM: number;
  // 색상별로 ceil(필요미터 ÷ 단위길이) 한 뒤 합산한 값(단순 전체 합산 올림과 다를 수 있음).
  requiredPackages: number;
  shortagePackages: number;
  conversionFormula: string;
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
  // PR-185 B: 이 자재로 "같은 styleNo에 연결된" 발주(취소 제외) 수량 합. 기존에는 그
  // 자재의 모든 발주 합계였다 — 스타일별 부족분이 서로 섞이던 문제를 고치기 위해
  // 호출자가 styleNo로 미리 걸러진 맵을 넘긴다(이 함수는 집계만 한다).
  orderedQty: number;
  // PR-185 B: 같은 자재의 "스타일 미연결" 발주(취소 제외) 수량 합 — 참고 표시용이며
  // shortageQty 계산에서 차감하지 않는다(어느 스타일 몫인지 몰라 자동 배정하지 않음).
  unlinkedOrderedQty: number;
  // 부족 수량 = max(0, 필요 총수량 - orderedQty)
  shortageQty: number;
  lineCount: number;
  // PR-185 B-2: 실/테이프 자재(Item.unit이 콘/롤로 표기된 경우)만 채워진다. 종류 미지정이거나
  // 규칙 테이블에 없으면 대신 conversionWarning만 채워진다(추측해서 환산하지 않음).
  packaging?: PackagingConversion;
  conversionWarning?: string;
}

// pg decimal은 문자열로 올 수 있어 Number()로 통일한다. 소수 4자리로 반올림해 부동소수 오차(0.1*3 등)를 없앤다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const MISSING_SUBTYPE_WARNING = '실/테이프 종류 미지정 — 선택해 주세요';

interface WorkingRow extends MaterialRequirementRow {
  colorMeters: Map<string, number>;
  subtype: string | null | undefined; // undefined = 아직 안 봄
  subtypeMixed: boolean;
  unit: string | null;
}

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
  opts?: { unlinkedByItemId?: Map<number, number>; packagingRules?: PackagingUnitRuleLike[] },
): MaterialRequirementRow[] {
  const target = num(targetQuantity);
  const map = new Map<number, WorkingRow>();

  for (const bi of [...bomItems].sort((a, b) => a.id - b.id)) {
    if (!bi.material) continue;
    const perUnit = num(bi.consumption);
    const cur: WorkingRow =
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
        unlinkedOrderedQty: 0,
        shortageQty: 0,
        lineCount: 0,
        colorMeters: new Map(),
        subtype: undefined,
        subtypeMixed: false,
        unit: bi.material.unit ?? null,
      };
    cur.consumptionPerUnit = round4(cur.consumptionPerUnit + perUnit);
    cur.requiredQty = round4(cur.requiredQty + perUnit * target);
    cur.lineCount += 1;
    const category = (bi.category ?? '').trim();
    if (category && !cur.categories.includes(category)) cur.categories.push(category);
    const color = (bi.colorCode ?? '').trim();
    if (color && !cur.colors.includes(color)) cur.colors.push(color);

    // 색상별 올림(ceil)을 위해 색상별 필요 미터를 따로 누적한다(색상 구분 없는 행은 '-' 하나로 취급).
    const colorKey = color || '-';
    cur.colorMeters.set(colorKey, round4((cur.colorMeters.get(colorKey) ?? 0) + perUnit * target));

    const subtype = bi.threadType ?? bi.tapeType ?? null;
    if (cur.subtype === undefined) cur.subtype = subtype;
    else if (cur.subtype !== subtype) cur.subtypeMixed = true;

    map.set(bi.material.id, cur);
  }

  const rules = opts?.packagingRules ?? [];
  const result: MaterialRequirementRow[] = [];
  for (const row of map.values()) {
    row.orderedQty = round4(num(orderedByItemId.get(row.itemId)));
    row.unlinkedOrderedQty = round4(num(opts?.unlinkedByItemId?.get(row.itemId)));
    row.shortageQty = Math.max(0, round4(row.requiredQty - row.orderedQty));

    const packagingCategory = classifyPackagingUnit(row.unit);
    if (packagingCategory) {
      const subtype = row.subtypeMixed ? null : row.subtype;
      const rule = subtype ? rules.find((r) => r.materialSubType === subtype) : undefined;
      if (!subtype || !rule) {
        // 종류 미지정이거나(subtype 없음) 종류는 있는데 규칙 테이블에 없는 경우 — 둘 다
        // 추측해서 환산하지 않고 같은 경고만 돌려준다(요구사항 B-2).
        row.conversionWarning = MISSING_SUBTYPE_WARNING;
      } else {
        const unitLengthM = Number(rule.unitLengthM);
        const label = rule.packagingUnitLabel;
        let requiredPackages = 0;
        const parts: string[] = [];
        for (const [color, meters] of row.colorMeters.entries()) {
          const packages = Math.ceil(meters / unitLengthM);
          requiredPackages += packages;
          parts.push(`${color}: ${meters.toLocaleString('ko-KR')}m→${packages}${label}`);
        }
        const shortagePackages = Math.max(0, requiredPackages - row.orderedQty);
        const conversionFormula =
          row.colorMeters.size > 1
            ? `색상별 ${parts.join(', ')} = 합계 ${requiredPackages}${label}`
            : `${row.requiredQty.toLocaleString('ko-KR')}m ÷ ${unitLengthM}m/${label} = ${round2(row.requiredQty / unitLengthM)} → ${requiredPackages}${label}`;
        row.packaging = { packagingUnitLabel: label, unitLengthM, requiredPackages, shortagePackages, conversionFormula };
      }
    }

    const { colorMeters: _colorMeters, subtype: _subtype, subtypeMixed: _subtypeMixed, unit: _unit, ...clean } = row;
    result.push(clean);
  }
  return result;
}
