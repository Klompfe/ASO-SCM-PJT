import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import {
  describeContractFilters,
  priceTextOf,
  productionContractColumns,
  summarizeContracts,
} from './productionContractReport';
import type { ProductionContract } from '../api/productionContracts.service';

const mk = (id: number, styleNo: string, pending: boolean, qty: unknown, cmtPrice: unknown, contractDate = '2026-09-15'): ProductionContract =>
  ({
    id, styleNo, manufacturerId: 1, manufacturer: { id: 1, name: '태일비나', code: 'TV' },
    priceSource: pending ? 'CMT_INVOICE' : 'PRE_AGREED',
    priceStatus: pending ? 'PENDING_CMT_INVOICE' : 'CONFIRMED',
    cmtPrice, quantity: qty, contractDate, note: null, createdAt: '', updatedAt: '',
  }) as unknown as ProductionContract;

const data = [
  mk(1, 'A1', false, 1000, '12.50'),
  mk(2, 'B2', true, '500', null, '2026-09-20'),
  mk(3, 'C3', true, 250, null),
  mk(4, 'D4', false, 40, 3),
];

describe('생산계약 현황 보고서 (PR-115)', () => {
  it('확정/미확정 건수와 수량을 집계한다(문자열 decimal 포함)', () => {
    expect(summarizeContracts(data)).toEqual({ total: 4, confirmed: 2, pending: 2, confirmedQty: 1040, pendingQty: 750 });
    expect(summarizeContracts([])).toEqual({ total: 0, confirmed: 0, pending: 0, confirmedQty: 0, pendingQty: 0 });
  });

  it('비정상 수량은 0으로 취급한다', () => {
    expect(summarizeContracts([mk(9, 'X', true, 'abc', null)]).pendingQty).toBe(0);
  });

  it('단가 표시: 미확정은 "확정 대기", 확정은 cmtPrice', () => {
    expect(priceTextOf(data[0])).toBe('12.5');
    expect(priceTextOf(data[1])).toBe('확정 대기');
  });

  it('기간 설명은 값이 있을 때만 만든다', () => {
    expect(describeContractFilters({})).toBeUndefined();
    expect(describeContractFilters({ from: '2026-09-01', to: '2026-09-30' })).toBe('계약일: 2026-09-01 ~ 2026-09-30');
    expect(describeContractFilters({ from: '2026-09-01' })).toBe('계약일: 2026-09-01 ~ 현재');
  });

  it('엑셀 워크북이 화면 데이터와 일치한다(재파싱)', async () => {
    const wb = await buildWorkbook(productionContractColumns, data, '생산계약');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['생산계약'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['스타일번호', '제조사', '계약일', '수량', '단가', '단가 상태']);
    expect(p[1]).toEqual(['A1', '태일비나', '2026-09-15', 1000, 12.5, '단가 확정']);
    expect(p[2]).toEqual(['B2', '태일비나', '2026-09-20', 500, '확정 대기', '확정 대기']);
  });
});
