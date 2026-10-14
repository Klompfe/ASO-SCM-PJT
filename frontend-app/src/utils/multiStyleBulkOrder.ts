import type { MaterialRequirementRow } from './bomRequirementReport';
import { suggestStyleLinkedQuantity, resolveBulkSupplierId, type StyleQuantitySuggestion } from './purchaseOrderForm';

// PR-194: 여러 스타일 묶음 일괄발주 — 1단계(다스타일 소요량 조회 응답)의 스타일 1건.
export interface MultiStyleRequirementResult {
  styleNo: string;
  styleName: string | null;
  totalQty: number;
  targetRdd: string | null;
  rows: MaterialRequirementRow[];
  error?: string;
}

export interface MaterialSubTypeRuleLike {
  materialSubType: string;
  displayName: string;
}

// 실/테이프 종류 코드(COA_SA/DADE 등)를 규칙 테이블의 displayName으로 바꾼다 — 백엔드
// src/common/utils/packaging-subtype.util.ts의 materialSubTypeLabel과 같은 규칙(프론트/백엔드가
// 별도 TS 프로젝트라 그대로 import할 수 없어 작은 순수 함수만 미러링한다). 규칙에 없는
// 코드는(데이터 누락) 추측하지 않고 코드 자체를 그대로 돌려준다.
export function materialSubTypeLabel(materialSubType: string | null | undefined, rules: MaterialSubTypeRuleLike[]): string | null {
  if (!materialSubType) return null;
  return rules.find((r) => r.materialSubType === materialSubType)?.displayName ?? materialSubType;
}

export const UNCATEGORIZED_LABEL = '미분류';

// 품목군 키 규칙: ① Item.category(MaterialCategory) 이름 → ② 없으면 BOM 구분(categories[0]) → ③ 없으면 '미분류'.
export function resolveCategoryGroupKey(row: Pick<MaterialRequirementRow, 'itemCategoryName' | 'categories'>): string {
  return row.itemCategoryName || row.categories[0] || UNCATEGORIZED_LABEL;
}

// "이미 같은 스타일·품목에 미입고(PENDING, 수정 가능한) 발주가 있는지" — 단일 스타일
// 화면(buildEditableOrderByItem, itemId만으로 키)과 달리 여러 스타일을 섞으므로
// styleNo+itemId 복합 키가 필요하다.
export function buildEditablePendingKey(styleNo: string, itemId: number): string {
  return `${styleNo}\u0000${itemId}`;
}

export function buildEditableOrderByStyleItem<T extends { itemId: number; styleNo?: string | null; status: string }>(
  orders: T[],
): Set<string> {
  const set = new Set<string>();
  for (const o of orders) {
    if (o.status !== 'PENDING' || !o.styleNo) continue;
    set.add(buildEditablePendingKey(o.styleNo, o.itemId));
  }
  return set;
}

export interface MultiStyleBulkRow {
  styleNo: string;
  styleName: string | null;
  requiredQty: number;
  orderedQty: number;
  shortageQty: number;
  suggestion: StyleQuantitySuggestion;
  hasEditablePending: boolean;
}

export interface MultiStyleBulkItemGroup {
  itemId: number;
  itemCode: string;
  itemName: string;
  materialSubTypeLabel: string | null;
  rows: MultiStyleBulkRow[];
}

export interface MultiStyleBulkCategoryGroup {
  key: string;
  items: MultiStyleBulkItemGroup[];
}

// 여러 스타일의 소요량 결과를 품목군 → 품목 → 스타일별 행으로 묶는다. 에러난 스타일(BOM
// 없음/스타일 없음 등)은 행 생성에서 제외한다 — 화면이 스타일별 에러 문구를 따로 보여준다.
export function groupMultiStyleRequirements(
  results: MultiStyleRequirementResult[],
  packagingRules: MaterialSubTypeRuleLike[],
  editablePendingKeys: Set<string>,
): MultiStyleBulkCategoryGroup[] {
  const categoryMap = new Map<string, Map<number, MultiStyleBulkItemGroup>>();
  for (const result of results) {
    if (result.error) continue;
    for (const row of result.rows) {
      const categoryKey = resolveCategoryGroupKey(row);
      const itemMap = categoryMap.get(categoryKey) ?? new Map<number, MultiStyleBulkItemGroup>();
      const itemGroup: MultiStyleBulkItemGroup =
        itemMap.get(row.itemId) ?? {
          itemId: row.itemId,
          itemCode: row.itemCode,
          itemName: row.itemName,
          materialSubTypeLabel: materialSubTypeLabel(row.materialSubType, packagingRules),
          rows: [],
        };
      itemGroup.rows.push({
        styleNo: result.styleNo,
        styleName: result.styleName,
        requiredQty: row.requiredQty,
        orderedQty: row.orderedQty,
        shortageQty: row.shortageQty,
        suggestion: suggestStyleLinkedQuantity(row),
        hasEditablePending: editablePendingKeys.has(buildEditablePendingKey(result.styleNo, row.itemId)),
      });
      itemMap.set(row.itemId, itemGroup);
      categoryMap.set(categoryKey, itemMap);
    }
  }
  return [...categoryMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([key, itemMap]) => ({
      key,
      items: [...itemMap.values()].sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    }));
}

// "품목군 전체 일괄 지정" — 그 품목군에 속한 모든 품목의 이력 후보 공급업체를 합쳐
// 정확히 하나일 때만 자동으로 고른다(품목별 resolveBulkSupplierId와 같은 원칙 — 후보가
// 여럿이거나 없으면 추측하지 않고 null).
export function resolveGroupBulkSupplierId(candidateSupplierIdsPerItem: number[][]): number | null {
  return resolveBulkSupplierId(candidateSupplierIdsPerItem.flat());
}

// 백엔드 POST /purchase-orders/bulk의 100건 제한(건드리지 않음) — 화면은 그 전에
// 미리 막고 안내한다("100건 이하로 나눠 주세요").
export const BULK_CREATE_MAX = 100;
export const BULK_CREATE_LIMIT_MESSAGE = `한 번에 최대 ${BULK_CREATE_MAX}건까지 생성할 수 있습니다 — ${BULK_CREATE_MAX}건 이하로 나눠 주세요.`;
export function exceedsBulkCreateLimit(count: number): boolean {
  return count > BULK_CREATE_MAX;
}

// PR-194 보완: 발주·입고·출고 현황에서 체크한 스타일번호를 선택 목록에 한 번만 채워
// 넣는다 — 이미 골라 둔 스타일은 중복 추가하지 않고, 새 스타일은 overview 없이
// styleNo만 있는 최소 형태로 뒤에 덧붙인다(목록 구성·발주 요청은 styleNo만 사용).
export function mergePrefillStyleNos<T extends { styleNo: string }>(
  current: T[],
  prefillStyleNos: string[],
  makeMinimal: (styleNo: string) => T,
): T[] {
  const existing = new Set(current.map((s) => s.styleNo));
  const additions = prefillStyleNos.filter((styleNo) => !existing.has(styleNo)).map(makeMinimal);
  return additions.length > 0 ? [...current, ...additions] : current;
}
