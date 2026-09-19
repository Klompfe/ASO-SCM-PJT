import type { PurchaseOrder } from '../api/purchaseOrders.service';
import type { ExcelColumn } from './excelExport';

export const PO_STATUS_LABELS: Record<string, string> = { PENDING: '대기', RECEIVED: '입고완료', CANCELLED: '취소' };
export const PO_STATUS_ORDER = ['PENDING', 'RECEIVED', 'CANCELLED'] as const;
export const NO_SUPPLIER_LABEL = '(공급업체 없음)';

// pg decimal은 문자열로 올 수 있어 Number()로 통일하고, 비정상 값/미입력 단가는 0으로 본다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const amountOf = (po: PurchaseOrder): number => num(po.quantity) * num(po.unitPrice);

export interface StatusSummary { status: string; count: number; amount: number }
export interface SupplierSummary { supplierId: number | null; name: string; count: number; amount: number }

export const summarizeByStatus = (orders: PurchaseOrder[]): StatusSummary[] =>
  PO_STATUS_ORDER.map((status) => {
    const rows = orders.filter((o) => o.status === status);
    return { status, count: rows.length, amount: rows.reduce((a, o) => a + amountOf(o), 0) };
  });

// 공급업체별 "발주 금액" 합계는 취소된 발주를 제외한다(취소분은 실제 발주 금액이 아니므로).
// 상태별 표에는 취소 금액이 따로 보이므로 정보는 사라지지 않는다. 금액 큰 순 정렬.
export const summarizeBySupplier = (orders: PurchaseOrder[]): SupplierSummary[] => {
  const map = new Map<string, SupplierSummary>();
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    const supplierId = o.supplierId ?? null;
    const key = supplierId === null ? 'none' : String(supplierId);
    const cur = map.get(key) ?? { supplierId, name: o.supplier?.name ?? (supplierId === null ? NO_SUPPLIER_LABEL : `#${supplierId}`), count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amountOf(o);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
};

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export const purchaseOrderColumns: ExcelColumn<PurchaseOrder>[] = [
  { header: '발주번호', accessor: (o) => `#${o.id}` },
  { header: '발주일', accessor: (o) => day(o.createdAt) },
  { header: '품목', accessor: (o) => o.item?.name ?? `#${o.itemId}` },
  { header: '수량', accessor: (o) => num(o.quantity) },
  { header: '단가', accessor: (o) => (o.unitPrice === null || o.unitPrice === undefined ? '' : num(o.unitPrice)) },
  { header: '금액', accessor: (o) => amountOf(o) },
  { header: '공급업체', accessor: (o) => o.supplier?.name ?? '' },
  { header: '상태', accessor: (o) => PO_STATUS_LABELS[o.status] ?? o.status },
  { header: '비고', accessor: (o) => o.notes ?? '' },
];

export const describePurchaseOrderFilters = (f: { supplierName?: string; status?: string; startDate?: string; endDate?: string }): string | undefined => {
  const parts: string[] = [];
  if (f.startDate || f.endDate) parts.push(`발주일: ${f.startDate || '처음'} ~ ${f.endDate || '현재'}`);
  if (f.supplierName) parts.push(`공급업체: ${f.supplierName}`);
  if (f.status) parts.push(`상태: ${PO_STATUS_LABELS[f.status] ?? f.status}`);
  return parts.length ? parts.join(' / ') : undefined;
};
