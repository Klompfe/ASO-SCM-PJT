// PR-249: 기존 스타일의 오더개요 병합 규칙 — 순수 함수(DB 접근 없음).
// 비어 있음→채움 / 같음→변화 없음 / 다름→기존 유지(충돌 알림) / 들어온 값이 비어 있음→기존 값 보존.
// 사용자가 비교 화면에서 항목별로 "새 값 사용"을 고른 필드(overwrite)만 다른 값으로 교체한다.
// 값은 가공하지 않는다(trim·대소문자 변환 없이 문자열은 그대로 비교, 숫자는 값 비교, 날짜는 YYYY-MM-DD 비교).

// 허용 필드(화이트리스트) — 공장·CMT단가는 기존 보류 규칙(mergeOverview)이 따로 처리하므로 여기 없다.
export const ORDER_OVERVIEW_FIELDS = ['totalQty', 'buyer', 'styleName', 'brand', 'itemType', 'productionType', 'targetRdd'] as const;
export type OrderOverviewField = (typeof ORDER_OVERVIEW_FIELDS)[number];

export type OrderOverviewStatus = 'same' | 'fillEmpty' | 'differs' | 'incomingEmpty';

export interface OrderOverviewConflict {
  field: OrderOverviewField;
  existing: string | number | null;
  incoming: string | number | null;
}

export interface OrderOverviewCompareRow extends OrderOverviewConflict {
  status: OrderOverviewStatus;
}

type Normalized = { kind: 'empty' } | { kind: 'value'; key: string; display: string | number };

function normalize(field: OrderOverviewField, v: unknown): Normalized {
  if (v == null) return { kind: 'empty' };
  if (field === 'totalQty') {
    const n = Number(v);
    // 0 / 음수 / NaN 은 "못 읽음"(PR-211 규칙과 같은 기준)
    return Number.isFinite(n) && n > 0 ? { kind: 'value', key: String(n), display: n } : { kind: 'empty' };
  }
  if (field === 'targetRdd') {
    const iso = v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : String(v).slice(0, 10);
    return iso.trim() === '' ? { kind: 'empty' } : { kind: 'value', key: iso, display: iso };
  }
  const s = String(v);
  return s.trim() === '' ? { kind: 'empty' } : { kind: 'value', key: s, display: s };
}

export function classifyOrderOverviewField(field: OrderOverviewField, existing: unknown, incoming: unknown): OrderOverviewCompareRow {
  const ex = normalize(field, existing);
  const inc = normalize(field, incoming);
  const exDisplay = ex.kind === 'value' ? ex.display : null;
  const incDisplay = inc.kind === 'value' ? inc.display : null;
  let status: OrderOverviewStatus;
  if (inc.kind === 'empty') status = 'incomingEmpty';
  else if (ex.kind === 'empty') status = 'fillEmpty';
  else status = ex.key === inc.key ? 'same' : 'differs';
  return { field, existing: exDisplay, incoming: incDisplay, status };
}

export function compareOrderOverview(existing: Record<string, unknown>, incoming: Record<string, unknown>): OrderOverviewCompareRow[] {
  return ORDER_OVERVIEW_FIELDS.map((f) => classifyOrderOverviewField(f, existing[f], incoming[f]));
}

export const ORDER_OVERVIEW_FIELD_LABELS: Record<OrderOverviewField, string> = {
  totalQty: '총수량',
  buyer: '바이어',
  styleName: '스타일명',
  brand: '브랜드',
  itemType: '품목',
  productionType: '임가공 구분',
  targetRdd: '납기',
};
