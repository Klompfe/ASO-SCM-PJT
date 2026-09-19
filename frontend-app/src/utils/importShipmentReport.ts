import type { ImportShipment } from '../api/importShipments.service';
import type { ExcelColumn } from './excelExport';

export const STATUS_LABELS: Record<string, string> = { PENDING_CLEARANCE: '통관대기', CLEARED: '통관완료' };

// pg decimal은 문자열로 올 수 있어 Number()로 통일하고, null/비정상 값은 0으로 본다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const totalQtyOf = (s: ImportShipment): number => (s.lines ?? []).reduce((a, l) => a + num(l.qty), 0);
export const totalAmountOf = (s: ImportShipment): number => (s.lines ?? []).reduce((a, l) => a + num(l.amount), 0);
// 금액이 하나도 입력되지 않은 문서는 0이 아니라 "미입력"으로 구분해 보여준다.
export const hasAmount = (s: ImportShipment): boolean => (s.lines ?? []).some((l) => l.amount !== null && l.amount !== undefined);

export interface ImportShipmentSummary {
  total: number;
  pending: number;
  cleared: number;
  pendingQty: number;
  clearedQty: number;
  pendingAmount: number;
  clearedAmount: number;
  totalAmount: number;
}

export const summarizeShipments = (shipments: ImportShipment[]): ImportShipmentSummary => {
  const sum: ImportShipmentSummary = {
    total: shipments.length, pending: 0, cleared: 0, pendingQty: 0, clearedQty: 0,
    pendingAmount: 0, clearedAmount: 0, totalAmount: 0,
  };
  for (const s of shipments) {
    const qty = totalQtyOf(s);
    const amount = totalAmountOf(s);
    if (s.status === 'CLEARED') { sum.cleared += 1; sum.clearedQty += qty; sum.clearedAmount += amount; }
    else { sum.pending += 1; sum.pendingQty += qty; sum.pendingAmount += amount; }
    sum.totalAmount += amount;
  }
  return sum;
};

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export const importShipmentColumns: ExcelColumn<ImportShipment>[] = [
  { header: '스타일번호', accessor: (s) => s.styleNo },
  { header: '브랜드', accessor: (s) => s.brand ?? '' },
  { header: 'INVOICE 번호', accessor: (s) => s.invoiceNo ?? '' },
  { header: 'INVOICE 일자', accessor: (s) => day(s.invoiceDate) },
  { header: '상태', accessor: (s) => STATUS_LABELS[s.status] ?? s.status },
  { header: '통관일', accessor: (s) => day(s.clearedAt) },
  { header: '수량', accessor: (s) => totalQtyOf(s) },
  { header: '금액', accessor: (s) => (hasAmount(s) ? totalAmountOf(s) : '') },
];

export const describeImportFilters = (f: Record<string, string | undefined>): string | undefined => {
  const labels: Record<string, string> = { styleNo: '스타일번호', materialName: '품목', sheetNo: 'INVOICE', brand: '브랜드' };
  const parts = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${labels[k] ?? k}: ${v}`);
  return parts.length ? `검색조건 — ${parts.join(', ')}` : undefined;
};
