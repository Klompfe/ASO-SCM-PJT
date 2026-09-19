import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import {
  NO_SUPPLIER_LABEL,
  amountOf,
  describePurchaseOrderFilters,
  purchaseOrderColumns,
  summarizeBySupplier,
  summarizeByStatus,
} from './purchaseOrderReport';
import type { PurchaseOrder } from '../api/purchaseOrders.service';

const mk = (id: number, supplierId: number | undefined, status: string, quantity: unknown, unitPrice: unknown, extra: any = {}): PurchaseOrder =>
  ({
    id, itemId: 1, item: { id: 1, code: 'I1', name: '원단A' }, quantity, unitPrice, status, supplierId,
    supplier: supplierId ? { id: supplierId, code: `S${supplierId}`, name: supplierId === 1 ? '가공급' : '나공급' } : undefined,
    createdAt: '2026-09-10T03:00:00.000Z', ...extra,
  }) as unknown as PurchaseOrder;

const data = [
  mk(1, 1, 'PENDING', 10, '100.5'),
  mk(2, 1, 'RECEIVED', 5, 200),
  mk(3, 2, 'RECEIVED', 3, 1000, { notes: '급행' }),
  mk(4, 2, 'CANCELLED', 100, 50),
  mk(5, undefined, 'PENDING', 2, undefined),
];

describe('발주 현황표 집계 (PR-116)', () => {
  it('금액은 수량×단가(문자열 decimal 허용, 단가 없음은 0)', () => {
    expect(amountOf(data[0])).toBe(1005);
    expect(amountOf(data[4])).toBe(0);
  });

  it('상태별 건수·금액을 항상 대기/입고완료/취소 순서로 집계한다(없는 상태는 0)', () => {
    expect(summarizeByStatus(data)).toEqual([
      { status: 'PENDING', count: 2, amount: 1005 },
      { status: 'RECEIVED', count: 2, amount: 4000 },
      { status: 'CANCELLED', count: 1, amount: 5000 },
    ]);
    expect(summarizeByStatus([]).map((s) => [s.count, s.amount])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('공급업체별 합계는 취소를 제외하고 금액 큰 순, 공급업체 없는 발주는 별도 행', () => {
    expect(summarizeBySupplier(data)).toEqual([
      { supplierId: 2, name: '나공급', count: 1, amount: 3000 },
      { supplierId: 1, name: '가공급', count: 2, amount: 2005 },
      { supplierId: null, name: NO_SUPPLIER_LABEL, count: 1, amount: 0 },
    ]);
  });

  it('필터 설명은 값이 있는 조건만 포함한다', () => {
    expect(describePurchaseOrderFilters({})).toBeUndefined();
    expect(describePurchaseOrderFilters({ startDate: '2026-09-01', supplierName: '가공급', status: 'PENDING' })).toBe(
      '발주일: 2026-09-01 ~ 현재 / 공급업체: 가공급 / 상태: 대기',
    );
  });

  it('엑셀 워크북이 화면 데이터와 일치한다(재파싱)', async () => {
    const wb = await buildWorkbook(purchaseOrderColumns, data, '발주');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['발주'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['발주번호', '발주일', '품목', '수량', '단가', '금액', '공급업체', '상태', '비고']);
    expect(p[1]).toEqual(['#1', '2026-09-10', '원단A', 10, 100.5, 1005, '가공급', '대기', '']);
    expect(p[3]).toEqual(['#3', '2026-09-10', '원단A', 3, 1000, 3000, '나공급', '입고완료', '급행']);
    expect(p[5]).toEqual(['#5', '2026-09-10', '원단A', 2, '', 0, '', '대기', '']);
  });
});
