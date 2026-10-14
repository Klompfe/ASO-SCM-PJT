import { describe, it, expect } from 'vitest';
import { buildInitialChosenStyleNo, resolveStyleLinkTargets, filterUnlinkedRows } from './unlinkedPurchaseOrders';
import type { UnlinkedPurchaseOrderRow } from '../api/purchaseOrders.service';

const row = (overrides: Partial<UnlinkedPurchaseOrderRow>): UnlinkedPurchaseOrderRow => ({
  poId: 1, itemId: 1, itemCode: 'IT-1', itemName: '자재', quantity: 10, status: 'PENDING',
  supplierName: null, createdAt: '2026-01-01', candidateStyles: [], attribution: 'ORPHAN',
  ...overrides,
});

describe('buildInitialChosenStyleNo (PR-196)', () => {
  it('AUTO 행만 후보 스타일을 미리 채운다', () => {
    const rows = [
      row({ poId: 1, attribution: 'AUTO', candidateStyles: [{ styleNo: 'A', styleName: null }] }),
      row({ poId: 2, attribution: 'AMBIGUOUS', candidateStyles: [{ styleNo: 'A', styleName: null }, { styleNo: 'B', styleName: null }] }),
      row({ poId: 3, attribution: 'ORPHAN', candidateStyles: [] }),
    ];
    const result = buildInitialChosenStyleNo(rows);
    expect(result.get(1)).toBe('A');
    expect(result.has(2)).toBe(false);
    expect(result.has(3)).toBe(false);
  });
});

describe('resolveStyleLinkTargets (PR-196) — 체크 안 한 행은 저장 호출에 포함되지 않는다', () => {
  it('체크됐고 스타일도 지정된 행만 targets에 들어간다', () => {
    const chosen = new Map([[1, 'A'], [2, 'B']]);
    const result = resolveStyleLinkTargets(new Set([1]), chosen);
    expect(result.targets).toEqual([{ poId: 1, styleNo: 'A' }]);
    expect(result.hasIncompleteSelection).toBe(false);
  });

  it('체크 안 된 행은 chosenStyleNo에 값이 있어도 targets에서 빠진다', () => {
    const chosen = new Map([[1, 'A'], [2, 'B'], [3, 'C']]);
    const result = resolveStyleLinkTargets(new Set([1, 3]), chosen);
    expect(result.targets.map((t) => t.poId).sort()).toEqual([1, 3]);
    expect(result.targets.some((t) => t.poId === 2)).toBe(false);
  });

  it('체크는 됐는데 스타일이 지정 안 된 행이 있으면 hasIncompleteSelection=true(아무것도 저장하지 않아야 함을 알림)', () => {
    const chosen = new Map([[1, 'A']]);
    const result = resolveStyleLinkTargets(new Set([1, 2]), chosen);
    expect(result.hasIncompleteSelection).toBe(true);
  });

  it('선택이 비어 있으면 targets도 비고 hasIncompleteSelection=false', () => {
    const result = resolveStyleLinkTargets(new Set(), new Map());
    expect(result.targets).toEqual([]);
    expect(result.hasIncompleteSelection).toBe(false);
  });
});

describe('filterUnlinkedRows (PR-196)', () => {
  const rows = [
    row({ poId: 1, itemName: '폴리원단', itemCode: 'FAB-1', status: 'PENDING', attribution: 'AUTO' }),
    row({ poId: 2, itemName: '코아사', itemCode: 'THR-1', status: 'RECEIVED', attribution: 'AMBIGUOUS' }),
  ];

  it('품목명/코드로 검색한다(대소문자 무시)', () => {
    expect(filterUnlinkedRows(rows, { itemKeyword: '폴리' }).map((r) => r.poId)).toEqual([1]);
    expect(filterUnlinkedRows(rows, { itemKeyword: 'fab-1' }).map((r) => r.poId)).toEqual([1]);
  });

  it('상태로 거른다', () => {
    expect(filterUnlinkedRows(rows, { status: 'RECEIVED' }).map((r) => r.poId)).toEqual([2]);
  });

  it('귀속 종류로 거른다', () => {
    expect(filterUnlinkedRows(rows, { attribution: 'AMBIGUOUS' }).map((r) => r.poId)).toEqual([2]);
  });

  it('조건이 없으면 전체를 돌려준다', () => {
    expect(filterUnlinkedRows(rows, {})).toHaveLength(2);
  });
});
