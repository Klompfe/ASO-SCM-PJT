import { classifyBrand, type BrandPrefixRuleLike } from '../../common/utils/brand-classifier.util';
import { ExportShipmentStatus } from '../entities/export-shipment.entity';

export const UNCLASSIFIED_BRAND = '미분류';

export type QtyByUnit = Record<string, number>;

export interface PerformanceShipment {
  id: number;
  sheetNo: string | null;
  invoiceDate: string | null;
  styleNos: string[];
  brands: string[];
  lineCount: number;
  qtyByUnit: QtyByUnit;
  amount: number;
  linesWithoutAmount: number;
}

export interface PerformanceBrand {
  brand: string;
  shipmentCount: number;
  lineCount: number;
  qtyByUnit: QtyByUnit;
  amount: number;
}

export interface ExportPerformance {
  totals: {
    shipmentCount: number;
    lineCount: number;
    qtyByUnit: QtyByUnit;
    amount: number;
    linesWithoutAmount: number;
  };
  byBrand: PerformanceBrand[];
  shipments: PerformanceShipment[];
}

interface ShipmentLike {
  id: number;
  status: ExportShipmentStatus | string;
  sheetNo?: string | null;
  invoiceDate?: Date | string | null;
  styleNos?: string[] | null;
  lines?: { styleNo: string; qty: unknown; unit?: string | null; amount?: unknown }[] | null;
}

// pg decimal은 문자열로 올 수 있어 Number()로 통일한다. 부동소수 오차를 없애려고 소수 4자리로 반올림.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number): number => Math.round(n * 10000) / 10000;

const toDay = (v?: Date | string | null): string | null => {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
};

const addQty = (target: QtyByUnit, unit: string, qty: number) => {
  target[unit] = round((target[unit] ?? 0) + qty);
};

// PR-119: 수출 실적표 집계. FINALIZED(확정) 문서만 실적으로 센다 — DRAFT/REVIEWED는 미확정이라
// 기간 안에 있어도 제외. 기간은 invoiceDate 기준(양끝 포함, 날짜가 없는 문서는 기간을 지정하면 제외).
//
// 브랜드는 헤더(styleNos)가 아니라 "라인" 단위로 매긴다 — 한 문서에 여러 브랜드 스타일이 섞여
// 있을 수 있어, 각 라인의 수량/금액을 그 라인 스타일의 브랜드에 귀속한다. 그래서 브랜드별
// 수량/금액 합은 전체 합과 일치하지만, 건수는 "그 브랜드 라인이 있는 문서 수"라 합이 전체 건수보다
// 클 수 있다(여러 브랜드가 섞인 문서는 각 브랜드에 한 번씩 센다).
//
// 수량은 라인 단위(unit)가 달라(YD/M/EA 등) 하나로 더하면 의미가 없으므로 단위별로 합산한다.
// 금액은 단가 미정인 라인(amount null)은 0으로 더하고 그 라인 수를 따로 알려준다.
export function aggregateExportPerformance(
  shipments: ShipmentLike[],
  rules: BrandPrefixRuleLike[],
  period: { from?: string; to?: string } = {},
): ExportPerformance {
  const included = shipments.filter((s) => {
    if (s.status !== ExportShipmentStatus.FINALIZED) return false;
    const day = toDay(s.invoiceDate);
    if (period.from || period.to) {
      if (!day) return false;
      if (period.from && day < period.from) return false;
      if (period.to && day > period.to) return false;
    }
    return true;
  });

  const totals: ExportPerformance['totals'] = { shipmentCount: included.length, lineCount: 0, qtyByUnit: {}, amount: 0, linesWithoutAmount: 0 };
  const brandMap = new Map<string, PerformanceBrand & { shipmentIds: Set<number> }>();
  const rows: PerformanceShipment[] = [];

  for (const s of included) {
    const row: PerformanceShipment = {
      id: s.id,
      sheetNo: s.sheetNo ?? null,
      invoiceDate: toDay(s.invoiceDate),
      styleNos: s.styleNos ?? [],
      brands: [],
      lineCount: 0,
      qtyByUnit: {},
      amount: 0,
      linesWithoutAmount: 0,
    };
    const rowBrands = new Set<string>();

    for (const line of s.lines ?? []) {
      const brand = classifyBrand(line.styleNo, rules) ?? UNCLASSIFIED_BRAND;
      const unit = (line.unit ?? '').trim() || '-';
      const qty = num(line.qty);
      const hasAmount = line.amount !== null && line.amount !== undefined && String(line.amount) !== '';
      const amount = hasAmount ? num(line.amount) : 0;

      const b = brandMap.get(brand) ?? { brand, shipmentCount: 0, lineCount: 0, qtyByUnit: {}, amount: 0, shipmentIds: new Set<number>() };
      b.shipmentIds.add(s.id);
      b.lineCount += 1;
      addQty(b.qtyByUnit, unit, qty);
      b.amount = round(b.amount + amount);
      brandMap.set(brand, b);

      rowBrands.add(brand);
      row.lineCount += 1;
      addQty(row.qtyByUnit, unit, qty);
      row.amount = round(row.amount + amount);
      if (!hasAmount) row.linesWithoutAmount += 1;

      totals.lineCount += 1;
      addQty(totals.qtyByUnit, unit, qty);
      totals.amount = round(totals.amount + amount);
      if (!hasAmount) totals.linesWithoutAmount += 1;
    }

    row.brands = [...rowBrands].sort();
    rows.push(row);
  }

  const byBrand = [...brandMap.values()]
    .map(({ shipmentIds, ...b }) => ({ ...b, shipmentCount: shipmentIds.size }))
    .sort((a, b) => {
      if (a.brand === UNCLASSIFIED_BRAND) return 1;
      if (b.brand === UNCLASSIFIED_BRAND) return -1;
      return b.amount - a.amount || b.shipmentCount - a.shipmentCount || a.brand.localeCompare(b.brand);
    });

  // 실적표 목록은 송장일 오래된 순(날짜 없는 문서는 맨 뒤), 같은 날은 id 순.
  rows.sort((a, b) => (a.invoiceDate ?? '9999').localeCompare(b.invoiceDate ?? '9999') || a.id - b.id);

  return { totals, byBrand, shipments: rows };
}
