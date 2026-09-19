import type { ExportPerformance, ExportPerformanceShipment } from '../api/exportShipments.service';
import type { ExcelColumn } from './excelExport';

const fmtNum = (n: number): string => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

// 수량은 단위(YD/EA 등)가 달라 하나로 더할 수 없어 "1,000 YD / 200 EA"처럼 단위별로 보여준다.
// 단위 순서는 수량 큰 순 → 단위명 순으로 고정한다.
export const formatQtyByUnit = (qtyByUnit: Record<string, number> | undefined | null): string => {
  const entries = Object.entries(qtyByUnit ?? {}).filter(([, q]) => Number(q) !== 0);
  if (entries.length === 0) return '-';
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([unit, qty]) => (unit === '-' ? fmtNum(qty) : `${fmtNum(qty)} ${unit}`))
    .join(' / ');
};

export const describePerformanceFilters = (f: { from?: string; to?: string }): string => {
  const period = f.from || f.to ? `INVOICE 일자: ${f.from || '처음'} ~ ${f.to || '현재'}` : 'INVOICE 일자: 전체 기간';
  return `${period} / 확정(FINALIZED) 문서만 집계`;
};

// 엑셀은 문서 목록(실적 상세)을 내보낸다. 한 문서에 스타일/브랜드가 여럿이면 쉼표로 이어 붙인다.
export const performanceColumns: ExcelColumn<ExportPerformanceShipment>[] = [
  { header: 'INVOICE 일자', accessor: (s) => s.invoiceDate ?? '' },
  { header: '문서번호', accessor: (s) => s.sheetNo ?? '' },
  { header: '스타일번호', accessor: (s) => s.styleNos.join(', ') },
  { header: '브랜드', accessor: (s) => s.brands.join(', ') },
  { header: '수량', accessor: (s) => formatQtyByUnit(s.qtyByUnit) },
  { header: '금액', accessor: (s) => s.amount },
  { header: '단가 미정 라인 수', accessor: (s) => s.linesWithoutAmount },
];

export const hasPerformanceData = (p: ExportPerformance | null): boolean => !!p && p.totals.shipmentCount > 0;
