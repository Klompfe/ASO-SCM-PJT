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
