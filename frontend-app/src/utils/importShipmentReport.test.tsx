import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildWorkbook } from './excelExport';
import { describeImportFilters, hasAmount, importShipmentColumns, summarizeShipments, totalAmountOf, totalQtyOf } from './importShipmentReport';
import { ImportShipmentReportTable } from '../components/ImportShipmentReportTable';
import type { ImportShipment } from '../api/importShipments.service';

const mk = (id: number, styleNo: string, status: string, lines: any[], extra: any = {}): ImportShipment =>
  ({ id, styleNo, status, lines, invoiceNo: `INV-${id}`, invoiceDate: '2026-07-18T00:00:00.000Z', ...extra }) as ImportShipment;

const data = [
  mk(1, 'BF6821C52', 'PENDING_CLEARANCE', [{ qty: 10, amount: '100.5' }, { qty: 5, amount: 50 }], { brand: 'BF', pod: 'INCHEON , KOREA', etd: '2026-07-19', eta: '2026-07-24T00:00:00.000Z' }),
  mk(2, 'LB69SLM101A', 'CLEARED', [{ qty: 20, amount: 200 }], { brand: 'LB', clearedAt: '2026-07-20T00:00:00.000Z', pod: 'INCHEON , KOREA', etd: '2026-07-15' }),
  mk(3, 'DR0H6D01', 'PENDING_CLEARANCE', [{ qty: 7, amount: null }], { brand: null }),
];

describe('수입/통관 현황표 (PR-114)', () => {
  it('상태별 건수/수량/금액을 집계한다(문자열 decimal, null 금액 포함)', () => {
    expect(summarizeShipments(data)).toEqual({
      total: 3, pending: 2, cleared: 1, pendingQty: 22, clearedQty: 20,
      pendingAmount: 150.5, clearedAmount: 200, totalAmount: 350.5,
    });
    expect(summarizeShipments([])).toMatchObject({ total: 0, pending: 0, cleared: 0, totalAmount: 0 });
  });

  it('금액 미입력 문서는 0과 구분된다', () => {
    expect(hasAmount(data[2])).toBe(false);
    expect(totalAmountOf(data[2])).toBe(0);
    expect(totalQtyOf(data[0])).toBe(15);
  });

  it('검색조건 설명은 값이 있는 것만 포함한다', () => {
    expect(describeImportFilters({ styleNo: 'BF', brand: 'BF', sheetNo: undefined })).toBe('검색조건 — 스타일번호: BF, 브랜드: BF');
    expect(describeImportFilters({})).toBeUndefined();
  });

  it('엑셀 워크북은 화면 데이터와 일치한다(재파싱 비교, 브랜드 포함)', async () => {
    const wb = await buildWorkbook(importShipmentColumns, data, '수입');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['수입'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['스타일번호', '브랜드', 'INVOICE 번호', 'INVOICE 일자', 'POD(도착항)', 'ETD', 'ETA', '상태', '통관일', '수량', '금액']);
    expect(p[1]).toEqual(['BF6821C52', 'BF', 'INV-1', '2026-07-18', 'INCHEON , KOREA', '2026-07-19', '2026-07-24', '통관대기', '', 15, 150.5]);
    expect(p[2]).toEqual(['LB69SLM101A', 'LB', 'INV-2', '2026-07-18', 'INCHEON , KOREA', '2026-07-15', '', '통관완료', '2026-07-20', 20, 200]);
    expect(p[3]).toEqual(['DR0H6D01', '', 'INV-3', '2026-07-18', '', '', '', '통관대기', '', 7, '']);
  });

  it('인쇄용 표는 모든 행과 상태 라벨을 렌더링한다', () => {
    const html = renderToStaticMarkup(createElement(ImportShipmentReportTable, { shipments: data }));
    for (const t of ['BF6821C52', 'LB69SLM101A', 'DR0H6D01', '통관대기', '통관완료', 'POD(도착항)', 'ETD', 'ETA', 'INCHEON , KOREA', '2026-07-19', '2026-07-24']) expect(html).toContain(t);
  });
});
