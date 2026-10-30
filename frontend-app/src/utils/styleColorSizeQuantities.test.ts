import { describe, expect, it } from 'vitest';
import { buildColorSizeQuantityTable } from './styleColorSizeQuantities';

describe('buildColorSizeQuantityTable (PR-212)', () => {
  it('행이 없으면 모든 목록이 비고 합계가 0이다(수량표 없음 판정에 쓰인다)', () => {
    const table = buildColorSizeQuantityTable([]);
    expect(table.colors).toEqual([]);
    expect(table.sizes).toEqual([]);
    expect(table.grandTotal).toBe(0);
  });

  it('색상/사이즈 등장 순서를 보존하고, 셀/합계를 정확히 계산한다', () => {
    const table = buildColorSizeQuantityTable([
      { color: 'BK', size: '55', qty: 260 },
      { color: 'BK', size: '66', qty: 250 },
      { color: 'BE', size: '55', qty: 240 },
      { color: 'BE', size: '66', qty: 230 },
    ]);
    expect(table.colors).toEqual(['BK', 'BE']);
    expect(table.sizes).toEqual(['55', '66']);
    expect(table.cellQty('BK', '55')).toBe(260);
    expect(table.cellQty('BE', '66')).toBe(230);
    expect(table.cellQty('BK', '77')).toBeNull();
    expect(table.totalByColor).toEqual({ BK: 510, BE: 470 });
    expect(table.totalBySize).toEqual({ '55': 500, '66': 480 });
    expect(table.grandTotal).toBe(980);
  });
});
