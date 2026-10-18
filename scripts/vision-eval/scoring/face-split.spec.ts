import { mergeFaceColorSplits } from './face-split';
import type { BomMatchResult } from './bom-match';
import type { GoldenBomItem, AiBomItemLike } from '../types';

const golden = (overrides: Partial<GoldenBomItem>): GoldenBomItem => ({
  itemName: '겉감(가짜코드-001)',
  consumption: 1.5,
  unit: 'YD',
  isLabelZone: false,
  ...overrides,
});

const extra = (overrides: Partial<AiBomItemLike>): BomMatchResult => ({
  type: 'EXTRA_OTHER',
  ai: { itemName: '가짜코드-001', consumption: 1.5, colorCode: 'RED', ...overrides },
});

describe('mergeFaceColorSplits (PR-199b — PILOT-2에서 확인한 겉감 색상 분할, 가짜 데이터)', () => {
  it('겉감 MISSING + 색상 다른 EXTRA 2건 이상 → FACE_SPLIT_BY_COLOR 1건으로 묶는다', () => {
    const g = golden({});
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: g },
      extra({ colorCode: 'RED' }),
      extra({ colorCode: 'BLUE' }),
    ];
    const { results: merged, faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(1);
    expect(merged).toEqual([{ type: 'FACE_SPLIT_BY_COLOR', golden: g, ai: results[1].ai }]);
  });

  it('값이 null(미추출)인 색상 행도 후보로 포함한다', () => {
    const g = golden({});
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: g },
      extra({ colorCode: 'RED', consumption: undefined as any }),
      extra({ colorCode: 'BLUE' }),
    ];
    const { faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(1);
  });

  it('겉감이 아닌 MISSING은 건드리지 않는다', () => {
    const g = golden({ itemName: '오바사' });
    const results: BomMatchResult[] = [{ type: 'MISSING', golden: g }, extra({ colorCode: 'RED' }), extra({ colorCode: 'BLUE' })];
    const { results: merged, faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(0);
    expect(merged).toEqual(results);
  });

  it('색상 다른 후보가 1개뿐이면 묶지 않는다(색상 "분할"로 보기엔 부족)', () => {
    const g = golden({});
    const results: BomMatchResult[] = [{ type: 'MISSING', golden: g }, extra({ colorCode: 'RED' })];
    const { faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(0);
  });

  it('값이 허용오차를 넘게 다른 행은 후보에서 빠진다', () => {
    const g = golden({ consumption: 1.5 });
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: g },
      extra({ colorCode: 'RED', consumption: 1.5 }),
      extra({ colorCode: 'BLUE', consumption: 99 }),
    ];
    const { faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(0); // 후보 1개뿐이라 묶지 않음
  });

  it('영문 표기("OUT-SHELL")도 겉감으로 인식한다', () => {
    const g = golden({ itemName: 'FABRIC(가짜)\nOUT-SHELL' });
    const results: BomMatchResult[] = [{ type: 'MISSING', golden: g }, extra({ colorCode: 'RED' }), extra({ colorCode: 'BLUE' })];
    const { faceSplitCount } = mergeFaceColorSplits(results);
    expect(faceSplitCount).toBe(1);
  });
});
