import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import {
  NO_SUPPLIER,
  aggregateReceipts,
  describePackingFilters,
  flattenGroups,
  packingColumns,
  summarizeBySupplier,
  summarizeGroups,
  type PackingReceiptReportRow,
} from './packingReceiptReport';

const po = (id: number, supplier?: string) => ({ id, supplier: supplier ? { id, name: supplier } : null, item: { id: 1, name: '기본품목' } });
const receipts: PackingReceiptReportRow[] = [
  {
    id: 10, purchaseOrderId: 1, receivedDate: '2026-09-10', purchaseOrder: po(1, '가공급'),
    cartons: [
      // 같은 라벨/BK가 카톤 1,2,3에 걸쳐 4행으로 쪼개져 있다(카톤 1은 두 행).
      { id: 1, cartonNo: '1', itemName: '라벨', color: 'BK', qty: 100, weightKg: 0.1 },
      { id: 2, cartonNo: '1', itemName: '라벨', color: 'BK', qty: 50, weightKg: 0.2 },
      { id: 3, cartonNo: '2', itemName: '라벨', color: 'BK', qty: 30, weightKg: '0.3' as any },
      { id: 4, cartonNo: '3', itemName: '라벨', color: 'WH', qty: 10 },
      { id: 5, cartonNo: '3', itemName: '단추', color: 'WH', qty: 5, weightKg: 1 },
      // 품목명 없음 → 발주 품목명으로 대체, 색상 없음
      { id: 6, cartonNo: '4', qty: 7, weightKg: 2 },
    ],
  },
  {
    id: 11, purchaseOrderId: 2, receivedDate: '2026-09-20T00:00:00.000Z', remark: '2차', purchaseOrder: po(2, '나공급'),
    cartons: [{ id: 7, cartonNo: '1', itemName: '지퍼', color: 'BK', qty: 40, weightKg: 4 }],
  },
  {
    id: 12, purchaseOrderId: 3, receivedDate: null, purchaseOrder: po(3, '가공급'),
    cartons: [{ id: 8, cartonNo: '1', itemName: '지퍼', color: 'BK', qty: 60, weightKg: 6 }],
  },
  { id: 13, purchaseOrderId: 4, receivedDate: '2026-09-25', cartons: [] },
];

describe('포장내역 집계 (PR-118)', () => {
  const groups = aggregateReceipts(receipts);

  it('같은 품목/색상이 여러 카톤·여러 행으로 나뉘어 있어도 한 줄로 합산한다(수량·중량·카톤 수)', () => {
    const g = groups[0];
    const blk = g.lines.find((l) => l.itemName === '라벨' && l.color === 'BK')!;
    expect(blk).toEqual({ itemName: '라벨', color: 'BK', cartonCount: 2, qty: 180, weightKg: 0.6 }); // 0.1+0.2+0.3 부동소수 오차 없이 0.6
    expect(g.lines).toHaveLength(4); // 기본품목(무색) / 단추 WH / 라벨 BK / 라벨 WH
  });

  it('중량을 입력하지 않은 줄은 0이 아니라 null(미입력)이고 소계에서는 빠진다', () => {
    const g = groups[0];
    expect(g.lines.find((l) => l.itemName === '라벨' && l.color === 'WH')!.weightKg).toBeNull();
    expect(g.totalQty).toBe(100 + 50 + 30 + 10 + 5 + 7);
    expect(g.totalWeightKg).toBe(3.6); // 0.6 + 1 + 2
    expect(groups[3].totalWeightKg).toBeNull(); // 카톤 없는 입고
  });

  it('품목명이 없으면 발주 품목명으로, 카톤 수는 카톤 번호 중복 제거', () => {
    const g = groups[0];
    expect(g.lines.find((l) => l.itemName === '기본품목')).toMatchObject({ color: '', qty: 7, weightKg: 2 });
    expect(g.cartonCount).toBe(4); // 1,2,3,4
  });

  it('입고일은 YYYY-MM-DD로 자르고, 입력 순서(입고 순서)를 유지하며 공급업체 없으면 표시', () => {
    expect(groups.map((g) => g.receivedDate)).toEqual(['2026-09-10', '2026-09-20', '', '2026-09-25']);
    expect(groups.map((g) => g.receiptId)).toEqual([10, 11, 12, 13]);
    expect(groups[3].supplierName).toBe(NO_SUPPLIER);
  });

  it('전체 요약과 공급업체별 합계(같은 공급업체의 여러 입고가 합쳐진다)', () => {
    expect(summarizeGroups(groups)).toEqual({ receiptCount: 4, cartonCount: 4 + 1 + 1 + 0, totalQty: 202 + 40 + 60, totalWeightKg: 3.6 + 4 + 6 });
    expect(summarizeBySupplier(groups)).toEqual([
      { name: '가공급', receiptCount: 2, totalQty: 262, totalWeightKg: 9.6 },
      { name: '나공급', receiptCount: 1, totalQty: 40, totalWeightKg: 4 },
      { name: NO_SUPPLIER, receiptCount: 1, totalQty: 0, totalWeightKg: 0 },
    ]);
  });

  it('필터 설명', () => {
    expect(describePackingFilters({})).toBeUndefined();
    expect(describePackingFilters({ from: '2026-09-01', to: '2026-09-30' })).toBe('입고일: 2026-09-01 ~ 2026-09-30');
  });

  it('엑셀은 화면 집계 줄과 같은 순서·값이다(재파싱)', async () => {
    const flat = flattenGroups(groups);
    expect(flat).toHaveLength(4 + 1 + 1);
    const wb = await buildWorkbook(packingColumns, flat, '포장');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['포장'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['입고번호', '입고일', '발주번호', '공급업체', '품목', '색상', '카톤 수', '수량', '중량(kg)']);
    expect(p[1]).toEqual(['#10', '2026-09-10', '#1', '가공급', '기본품목', '', 1, 7, 2]);
    expect(p.find((r) => r[4] === '라벨' && r[5] === 'BK')).toEqual(['#10', '2026-09-10', '#1', '가공급', '라벨', 'BK', 2, 180, 0.6]);
    expect(p.find((r) => r[4] === '라벨' && r[5] === 'WH')).toEqual(['#10', '2026-09-10', '#1', '가공급', '라벨', 'WH', 1, 10, '']);
    expect(p[p.length - 1]).toEqual(['#12', '', '#3', '가공급', '지퍼', 'BK', 1, 60, 6]);
  });
});
