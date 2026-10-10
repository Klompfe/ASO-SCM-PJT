import type { PurchaseOrder } from '../api/purchaseOrders.service';
import type { MaterialRequirementRow } from './bomRequirementReport';

export interface SupplierRef {
  id: number;
  code: string;
  name: string;
}

export interface LatestOrderDefaults {
  supplier: SupplierRef;
  unitPrice: number;
  orderId: number;
}

// pg decimal은 문자열로 올 수 있어 Number()로 통일한다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 품목을 고르면 그 품목의 "가장 최근 발주"에서 공급업체/단가를 미리 채워 준다. 서버가 id 내림차순으로 주지만 순서에
// 의존하지 않고 직접 정렬한다. 취소(CANCELLED)된 발주는 실제로 거래하지 않은 값이라 기본값으로 쓰지 않고, 공급업체가
// 없거나 단가가 0 이하인 발주도 건너뛴다. 조건에 맞는 이력이 없으면 null(공란).
export function pickLatestOrderDefaults(orders: PurchaseOrder[] | null | undefined): LatestOrderDefaults | null {
  const usable = (orders ?? [])
    .filter((o) => o.status !== 'CANCELLED' && o.supplier && num(o.unitPrice) > 0)
    .sort((a, b) => b.id - a.id);
  const latest = usable[0];
  if (!latest || !latest.supplier) return null;
  return { supplier: latest.supplier, unitPrice: num(latest.unitPrice), orderId: latest.id };
}

export interface AutofillState {
  supplier: SupplierRef | null;
  unitPrice: number;
  // 마지막 값이 사용자가 아니라 자동 채움으로 들어간 것인지 — 다른 품목으로 바꿨을 때 이전 품목의 자동값이 남지 않게 한다.
  autofilled: boolean;
}

// 품목 선택 직후의 공급업체/단가 상태를 계산한다.
//  - 최근 발주 이력이 있으면 그 값으로 덮어쓰고 autofilled=true(이후 수정 가능, 수정하면 autofilled=false로 바꿔 준다).
//  - 이력이 없으면: 이전 값이 자동 채움이었다면 지우고(다른 품목의 값이 남지 않게), 사용자가 직접 넣은 값이면 그대로 둔다.
export function resolveAutofill(prev: AutofillState, latest: LatestOrderDefaults | null): AutofillState {
  if (latest) return { supplier: latest.supplier, unitPrice: latest.unitPrice, autofilled: true };
  if (prev.autofilled) return { supplier: null, unitPrice: 0, autofilled: false };
  return prev;
}

// "이 자재로 발주하기" 제안 수량: 부족 수량을 올림(발주 수량은 정수), 부족이 없으면 1.
export const suggestedQuantity = (shortageQty: number): number => (shortageQty > 0 ? Math.max(1, Math.ceil(shortageQty)) : 1);

// PR-173: CMT 계약 건의 원부자재 발주는 단가가 당장 필요 없다(수출선적서류 작성
// 시점에만 필요) — 생산유형을 모르거나(BOM 미연결 등) FOB면 기존처럼 필수로 본다
// (안전한 기본값: "모름"을 "필수 없음"으로 섣불리 완화하지 않는다).
export const isUnitPriceRequired = (productionType: 'CMT' | 'FOB' | null): boolean => productionType !== 'CMT';

// 부족 자재 표: 부족 수량이 있는 행을 부족량 큰 순으로 위에, 나머지는 이름순.
export function sortForShortage(rows: MaterialRequirementRow[]): MaterialRequirementRow[] {
  return [...rows].sort((a, b) => {
    const as = a.shortageQty > 0 ? 1 : 0;
    const bs = b.shortageQty > 0 ? 1 : 0;
    if (as !== bs) return bs - as;
    if (as === 1 && a.shortageQty !== b.shortageQty) return b.shortageQty - a.shortageQty;
    return a.itemName.localeCompare(b.itemName);
  });
}

// PR-177: 자재(itemId)별로 "수정하기" 대상이 되는 발주 = 미입고(PENDING) 중 가장 최근(id 최대).
// 입고/취소된 발주는 수정 대상이 아니므로 제외한다. 여러 건이면 가장 최근 것 하나만 고른다
// (화면 버튼을 한 번에 한 대상으로 두기 위함 — 나머지는 발주 목록에서 본다).
export function buildEditableOrderByItem<T extends { id: number; itemId: number; status: string }>(
  orders: T[],
): Map<number, { order: T; pendingCount: number }> {
  const map = new Map<number, { order: T; pendingCount: number }>();
  for (const o of orders) {
    if (o.status !== 'PENDING') continue;
    const cur = map.get(o.itemId);
    if (!cur) map.set(o.itemId, { order: o, pendingCount: 1 });
    else map.set(o.itemId, { order: o.id > cur.order.id ? o : cur.order, pendingCount: cur.pendingCount + 1 });
  }
  return map;
}

// PR-176: 색상/사이즈 라인 합계(정수 수량). 라인이 없으면 0.
export const sumPurchaseOrderLines = (lines: { qty: number }[]): number =>
  lines.reduce((sum, l) => sum + (Number.isFinite(Number(l.qty)) ? Number(l.qty) : 0), 0);

// 라인 합계와 총수량이 다른지. 라인이 없으면 비교할 게 없으므로 false.
export const isLineTotalMismatch = (quantity: number, lines: { qty: number }[]): boolean =>
  lines.length > 0 && sumPurchaseOrderLines(lines) !== Number(quantity);

// PR-179: 일괄발주 미리보기의 공급업체 자동 선택 — 이력상 후보가 정확히 하나일 때만 고른다.
// 후보가 여럿이거나 없으면 추측하지 않고 null(사람이 고른다).
export function resolveBulkSupplierId(candidateSupplierIds: number[]): number | null {
  const unique = [...new Set(candidateSupplierIds)];
  return unique.length === 1 ? unique[0] : null;
}

// PR-185 B/B-2: 스타일 연결 트랙에서 자재를 고르면 수량을 부족분으로 미리 채운다.
// 실/테이프(packaging)는 콘/롤 단위로, 종류 미지정(conversionWarning)이면 추측해서
// 미터값을 넣지 않고 경고만 보여준다(요구사항: "추측 금지"). 부족분이 0이면 비워 둔다.
export interface StyleQuantitySuggestion {
  quantity: number | null;
  unitLabel: string | null;
  summary: string;
  note: string | null;
}

const fmtQty = (n: number): string => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
const SUFFICIENT_NOTE = '소요량 충족 — 추가 발주는 수량을 직접 입력하세요.';

export function suggestStyleLinkedQuantity(row: MaterialRequirementRow): StyleQuantitySuggestion {
  if (row.packaging) {
    const { requiredPackages, shortagePackages, packagingUnitLabel } = row.packaging;
    return {
      quantity: shortagePackages > 0 ? shortagePackages : null,
      unitLabel: packagingUnitLabel,
      summary: `소요 ${fmtQty(row.requiredQty)}m(${requiredPackages}${packagingUnitLabel}) / 기발주 ${fmtQty(row.orderedQty)}${packagingUnitLabel} / 부족 ${shortagePackages}${packagingUnitLabel}`,
      note: shortagePackages > 0 ? null : SUFFICIENT_NOTE,
    };
  }
  if (row.conversionWarning) {
    return { quantity: null, unitLabel: null, summary: `소요 ${fmtQty(row.requiredQty)}m`, note: row.conversionWarning };
  }
  const shortage = Math.max(0, row.requiredQty - row.orderedQty);
  return {
    quantity: shortage > 0 ? Math.ceil(shortage) : null,
    unitLabel: null,
    summary: `소요 ${fmtQty(row.requiredQty)} / 기발주 ${fmtQty(row.orderedQty)} / 부족 ${fmtQty(row.shortageQty)}`,
    note: shortage > 0 ? null : SUFFICIENT_NOTE,
  };
}

// PR-187 C: "이 자재로 발주하기"(스타일 미연결 경로)의 수량 제안 — PR-185 B의
// suggestStyleLinkedQuantity와 같은 원칙(종류 미지정 실/테이프는 미터 수량을 추측해서
// 채우지 않는다, 콘/롤 환산이 있으면 그 부족분)을 따른다. 일반 자재(packaging/
// conversionWarning 둘 다 없음)는 기존 suggestedQuantity(ceil 또는 최소 1)를 그대로 쓴다
// — 이 경로의 원래 동작을 바꾸지 않기 위함. 항상 number | null을 돌려줘(undefined 없음)
// 호출자가 quantityInput을 매번 명시적으로 설정하게 해서 이전 품목의 수량이 남지 않는다.
export function suggestUnlinkedQuantity(row: MaterialRequirementRow): number | null {
  if (row.packaging) {
    return row.packaging.shortagePackages > 0 ? row.packaging.shortagePackages : null;
  }
  if (row.conversionWarning) return null;
  return suggestedQuantity(row.shortageQty);
}

// PR-185 A: 목록/배지용 — 스타일 연결 여부 라벨.
export const trackBadgeLabel = (styleNo: string | null | undefined): string => (styleNo ? styleNo : '미연결');

// PR-185 B: 수량 입력은 기본값 없이 시작해 필수로 바뀐다 — 0 이하/빈 값은 오류.
export function isQuantityFilled(input: string): boolean {
  const n = Number(input);
  return input.trim() !== '' && Number.isFinite(n) && n > 0;
}

// 일괄발주 행을 커밋해도 되는지: 공급업체·정수 수량(1 이상)이 있어야 하고, 단가는
// unitPriceRequired가 true일 때만 필요(0 초과)하다.
// MERGE-2: PR-173이 CMT 발주를 단가 없이 허용하면서, 일괄발주에서만 CMT 건이 단가
// 때문에 막히는 불일치가 있었다 — 가발주(orderType === 'PROVISIONAL')는 CMT 건이라
// 호출하는 쪽이 unitPriceRequired=false를 넘긴다. FOB/미지정은 기존대로 단가 필수.
export function isBulkRowReady(
  row: { supplierId: number | null; quantity: number; unitPrice: number | null },
  unitPriceRequired: boolean = true,
): boolean {
  const unitPriceOk = unitPriceRequired ? row.unitPrice != null && row.unitPrice > 0 : true;
  return row.supplierId != null && Number.isInteger(row.quantity) && row.quantity >= 1 && unitPriceOk;
}
