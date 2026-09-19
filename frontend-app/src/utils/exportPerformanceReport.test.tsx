import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import { describePerformanceFilters, formatQtyByUnit, hasPerformanceData, performanceColumns } from './exportPerformanceReport';
import type { ExportPerformanceShipment } from '../api/exportShipments.service';

const rows: ExportPerformanceShipment[] = [
  { id: 1, sheetNo: 'S1', invoiceDate: '2026-09-10', styleNos: ['BF1', 'LB1'], brands: ['라베', '빈폴'], buyers: ['A무역', 'B상사'], lineCount: 3, qtyByUnit: { EA: 10, YD: 150 }, amount: 1530, linesWithoutAmount: 0 },
  { id: 2, sheetNo: null, invoiceDate: null, styleNos: [], brands: [], buyers: [], lineCount: 1, qtyByUnit: {}, amount: 0, linesWithoutAmount: 1 },
];

describe('수출 실적표 화면 유틸 (PR-119)', () => {
  it('수량은 단위별로 큰 순서대로 표시하고, 단위 없음(-)은 숫자만, 0/빈 값은 "-"', () => {
    expect(formatQtyByUnit({ EA: 10, YD: 1500.5 })).toBe('1,500.5 YD / 10 EA');
    expect(formatQtyByUnit({ '-': 3 })).toBe('3');
    expect(formatQtyByUnit({ YD: 0 })).toBe('-');
    expect(formatQtyByUnit({})).toBe('-');
    expect(formatQtyByUnit(undefined)).toBe('-');
  });

  it('부제는 기간(또는 전체 기간)과 "확정 문서만 집계" 안내를 항상 포함한다', () => {
    expect(describePerformanceFilters({})).toBe('INVOICE 일자: 전체 기간 / 확정(FINALIZED) 문서만 집계');
    expect(describePerformanceFilters({ from: '2026-09-01', to: '2026-09-30' })).toBe('INVOICE 일자: 2026-09-01 ~ 2026-09-30 / 확정(FINALIZED) 문서만 집계');
    expect(describePerformanceFilters({ to: '2026-09-30' })).toContain('처음 ~ 2026-09-30');
  });

  it('엑셀은 서버가 집계한 문서 목록과 그대로 일치한다(재파싱)', async () => {
    const wb = await buildWorkbook(performanceColumns, rows, '실적');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['실적'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['INVOICE 일자', '문서번호', '스타일번호', '브랜드', '거래처', '수량', '금액', '단가 미정 라인 수']);
    expect(p[1]).toEqual(['2026-09-10', 'S1', 'BF1, LB1', '라베, 빈폴', 'A무역, B상사', '150 YD / 10 EA', 1530, 0]);
    expect(p[2]).toEqual(['', '', '', '', '', '-', 0, 1]);
  });

  it('데이터 유무 판정', () => {
    expect(hasPerformanceData(null)).toBe(false);
    expect(hasPerformanceData({ totals: { shipmentCount: 0, lineCount: 0, qtyByUnit: {}, amount: 0, linesWithoutAmount: 0 }, byBrand: [], byBuyer: [], shipments: [], excludedNotFinalized: 0 })).toBe(false);
    expect(hasPerformanceData({ totals: { shipmentCount: 1, lineCount: 1, qtyByUnit: {}, amount: 0, linesWithoutAmount: 0 }, byBrand: [], byBuyer: [], shipments: rows, excludedNotFinalized: 0 })).toBe(true);
  });
});
