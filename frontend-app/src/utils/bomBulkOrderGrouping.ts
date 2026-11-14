// PR-238(사용자 요구): 자재명세 한 품번에서 고른 여러 자재를 업체별로 묶어 일괄 발주한다.
// PO 구조는 "품목 1개 × 스타일 1개 = PO 1건"(createBulk, 기존)이고, 서버에 전체를 한
// 트랜잭션으로 보내면 한 업체 실패가 다른 업체까지 롤백시킨다 — 그래서 "업체별 발주서"는
// 새 백엔드가 아니라, 기존 createPurchaseOrdersBulk를 업체별로 나눠 여러 번 호출하는
// 것으로 구현한다(업체마다 독립된 트랜잭션 1개, 그 안에서는 전체 성공 또는 전체 롤백).
import type { SupplierPrefillSource, PricePrefillSource } from './orderPrefill';

export type BulkOrderType = 'FIRM' | 'PROVISIONAL';

export interface BulkOrderRowInput {
  bomItemId: number;
  itemId: number;
  itemName: string;
  category: string;
  colorCode: string;
  unit: string | null;
  // PR-240: BOM 행 공급사/품목 마스터/최근 발주 우선순위로 이미 미리 채운 결과(호출하는
  // 쪽에서 orderPrefill.ts의 pickSupplierPrefill로 계산해 넘긴다) — null이면 공급사 미지정.
  candidateSupplierId: number | null;
  candidateSupplierSource?: SupplierPrefillSource | null;
  // 이 스타일에서 이 자재의 미입고(PENDING) 발주 건수.
  alreadyOrderedCount: number;
  // 필요수량(적용) 계산 결과 — null이면 근거 없음/극단 불일치 등으로 사람이 직접
  // 수량을 입력해야 생성 가능하다(기존 규칙, PR-226/231 그대로 재사용).
  suggestedQuantity: number | null;
  // PR-240: BOM 확정 단가/최근 발주 단가 우선순위로 이미 미리 채운 단가(pickPricePrefill).
  suggestedUnitPrice?: number | null;
  priceSource?: PricePrefillSource | null;
}

export interface BulkOrderRowDraft {
  bomItemId: number;
  itemId: number;
  itemName: string;
  category: string;
  colorCode: string;
  unit: string | null;
  supplierId: number | null;
  supplierSource: SupplierPrefillSource | null;
  quantity: number | null;
  unitPrice: number | null;
  priceSource: PricePrefillSource | null;
  orderType: BulkOrderType | null;
  excluded: boolean;
  alreadyOrderedCount: number;
  alreadyOrderedConfirmed: boolean;
}

export function buildInitialDrafts(rows: BulkOrderRowInput[]): BulkOrderRowDraft[] {
  return rows.map((r) => ({
    bomItemId: r.bomItemId,
    itemId: r.itemId,
    itemName: r.itemName,
    category: r.category,
    colorCode: r.colorCode,
    unit: r.unit,
    supplierId: r.candidateSupplierId,
    supplierSource: r.candidateSupplierId != null ? (r.candidateSupplierSource ?? null) : null,
    quantity: r.suggestedQuantity,
    unitPrice: r.suggestedUnitPrice ?? null,
    priceSource: r.suggestedUnitPrice != null ? (r.priceSource ?? null) : null,
    orderType: null,
    excluded: false,
    alreadyOrderedCount: r.alreadyOrderedCount,
    alreadyOrderedConfirmed: false,
  }));
}

export interface SupplierGroup {
  supplierId: number;
  rows: BulkOrderRowDraft[];
}

// 제외되지 않은 행만 분류한다. 공급업체가 없는 행은 "공급사 미지정" 쪽(unassigned)에
// 모인다 — 지시사항: "선택 전에는 생성 불가, 선택하면 해당 업체 표로 이동".
export function groupDraftsBySupplier(drafts: BulkOrderRowDraft[]): { groups: SupplierGroup[]; unassigned: BulkOrderRowDraft[] } {
  const included = drafts.filter((d) => !d.excluded);
  const unassigned = included.filter((d) => d.supplierId == null);
  const bySupplier = new Map<number, BulkOrderRowDraft[]>();
  for (const d of included) {
    if (d.supplierId == null) continue;
    const arr = bySupplier.get(d.supplierId) ?? [];
    arr.push(d);
    bySupplier.set(d.supplierId, arr);
  }
  const groups = [...bySupplier.entries()].map(([supplierId, rows]) => ({ supplierId, rows }));
  return { groups, unassigned };
}

// 가발주(PROVISIONAL)는 단가가 선택 입력(PR-173 정책, 기존 규칙 재사용) — 그 외(실발주/
// 미지정)는 단가가 있어야 한다. 수량은 기존 일괄발주(isBulkRowReady, purchaseOrderForm.ts)
// 와 같은 규칙(정수, 1 이상)으로 — 직접 import하지 않고 같은 조건을 복제했다
// (MultiStyleBulkOrder.tsx의 isBulkRowReady 사용과 같은 원칙, 이 파일은 공급사
// 그룹핑까지 함께 다뤄 그대로 재사용하기보다 복제가 더 단순했다). 이미 발주된
// 자재는 확인 체크 전까지 생성 불가.
export function isDraftReadyForCreate(d: BulkOrderRowDraft): boolean {
  if (d.excluded) return true;
  if (d.supplierId == null) return false;
  if (d.quantity == null || !Number.isInteger(d.quantity) || d.quantity < 1) return false;
  if (d.orderType !== 'PROVISIONAL' && (d.unitPrice == null || d.unitPrice <= 0)) return false;
  if (d.alreadyOrderedCount > 0 && !d.alreadyOrderedConfirmed) return false;
  return true;
}

export function canCreateBulkOrders(drafts: BulkOrderRowDraft[]): boolean {
  const included = drafts.filter((d) => !d.excluded);
  if (included.length === 0) return false;
  return included.every(isDraftReadyForCreate);
}

export function summarizeBulkOrders(drafts: BulkOrderRowDraft[]): { supplierCount: number; totalCount: number } {
  const { groups } = groupDraftsBySupplier(drafts);
  return { supplierCount: groups.length, totalCount: groups.reduce((s, g) => s + g.rows.length, 0) };
}

export interface BulkOrderCreateItem {
  supplierId: number;
  itemId: number;
  quantity: number;
  unitPrice?: number;
  orderType?: BulkOrderType;
  styleNo: string;
}

// 한 업체 분량만 담은 요청 배열 — 이 배열 단위로 createPurchaseOrdersBulk를 호출해야
// "업체별 독립 생성(한 업체 실패가 다른 업체에 영향 없음, 업체 내부는 전체 또는 전체
// 롤백)"이 성립한다(서버의 createBulk 자체가 요청 전체를 하나의 트랜잭션으로 묶으므로).
export function buildBulkOrderCreatePayload(group: SupplierGroup, styleNo: string): BulkOrderCreateItem[] {
  return group.rows.map((r) => ({
    supplierId: group.supplierId,
    itemId: r.itemId,
    quantity: r.quantity as number,
    unitPrice: r.unitPrice ?? undefined,
    orderType: r.orderType ?? undefined,
    styleNo,
  }));
}

export interface SupplierCreationResult {
  supplierId: number;
  success: boolean;
  createdIds: number[];
  reason?: string;
}

// 업체마다 createFn(=createPurchaseOrdersBulk)을 따로 호출한다 — 한 업체가 실패해도
// 나머지 업체는 계속 시도하고(독립), 실패한 업체는 그 호출 전체가 서버 트랜잭션으로
// 롤백된 상태로 남는다(createdIds가 비어 있음). 테스트에서 createFn을 교체해 이
// 독립성/롤백 결과 집계 로직을 DOM 없이 검증한다.
export async function createOrdersBySupplier(
  groups: SupplierGroup[],
  styleNo: string,
  createFn: (payload: BulkOrderCreateItem[]) => Promise<{ id: number }[]>,
): Promise<SupplierCreationResult[]> {
  const results: SupplierCreationResult[] = [];
  for (const group of groups) {
    try {
      const created = await createFn(buildBulkOrderCreatePayload(group, styleNo));
      results.push({ supplierId: group.supplierId, success: true, createdIds: created.map((c) => c.id) });
    } catch (err) {
      results.push({
        supplierId: group.supplierId,
        success: false,
        createdIds: [],
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
