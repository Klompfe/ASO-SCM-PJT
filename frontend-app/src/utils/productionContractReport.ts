import type { ProductionContract } from '../api/productionContracts.service';
import type { ExcelColumn } from './excelExport';

export const PRICE_STATUS_LABELS: Record<string, string> = { CONFIRMED: '단가 확정', PENDING_CMT_INVOICE: '확정 대기' };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface ProductionContractSummary {
  total: number;
  confirmed: number;
  pending: number;
  confirmedQty: number;
  pendingQty: number;
}

// 미확정(PENDING_CMT_INVOICE) 외의 모든 상태는 확정으로 본다 — 상태값은 두 가지뿐이다.
export const summarizeContracts = (contracts: ProductionContract[]): ProductionContractSummary => {
  const s: ProductionContractSummary = { total: contracts.length, confirmed: 0, pending: 0, confirmedQty: 0, pendingQty: 0 };
  for (const c of contracts) {
    if (c.priceStatus === 'PENDING_CMT_INVOICE') { s.pending += 1; s.pendingQty += num(c.quantity); }
    else { s.confirmed += 1; s.confirmedQty += num(c.quantity); }
  }
  return s;
};

export const priceTextOf = (c: ProductionContract): string =>
  c.priceStatus === 'PENDING_CMT_INVOICE' || c.cmtPrice === null || c.cmtPrice === undefined ? '확정 대기' : String(num(c.cmtPrice));

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export const productionContractColumns: ExcelColumn<ProductionContract>[] = [
  { header: '스타일번호', accessor: (c) => c.styleNo },
  { header: '제조사', accessor: (c) => c.manufacturer?.name ?? `#${c.manufacturerId}` },
  { header: '계약일', accessor: (c) => day(c.contractDate) },
  { header: '수량', accessor: (c) => num(c.quantity) },
  { header: '단가', accessor: (c) => (priceTextOf(c) === '확정 대기' ? '확정 대기' : num(c.cmtPrice)) },
  { header: '단가 상태', accessor: (c) => PRICE_STATUS_LABELS[c.priceStatus] ?? c.priceStatus },
];

export const describeContractFilters = (f: { from?: string; to?: string }): string | undefined =>
  f.from || f.to ? `계약일: ${f.from || '처음'} ~ ${f.to || '현재'}` : undefined;
