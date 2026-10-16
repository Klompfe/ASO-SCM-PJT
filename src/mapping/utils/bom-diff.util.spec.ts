import { classifyBomDiff, type BomDiffExistingRow, type BomDiffIncomingRow } from './bom-diff.util';

const existing = (overrides: Partial<BomDiffExistingRow>): BomDiffExistingRow => ({
  bomItemId: 1,
  itemName: '원단A',
  category: '겉감',
  colorCode: 'BK',
  spec: 'S',
  consumption: 2.7,
  linkedPoCount: 0,
  ...overrides,
});

const incoming = (overrides: Partial<BomDiffIncomingRow>): BomDiffIncomingRow => ({
  itemName: '원단A',
  category: '겉감',
  colorCode: 'BK',
  spec: 'S',
  consumption: 2.7,
  ...overrides,
});

describe('classifyBomDiff (PR-198)', () => {
  it('자재명·색상·규격·요척이 전부 같으면 SAME', () => {
    const { rows } = classifyBomDiff([existing({})], [incoming({})]);
    expect(rows).toEqual([{ type: 'SAME', existing: existing({}), incoming: incoming({}) }]);
  });

  it('자재명은 같은데 요척이 다르면 VALUE_DIFF(사례 1: 2.7 vs 2.9)', () => {
    const { rows } = classifyBomDiff(
      [existing({ itemName: '다데<실크>', consumption: 2.7 })],
      [incoming({ itemName: '다데<실크>', consumption: 2.9 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('VALUE_DIFF');
    expect(rows[0].existing?.consumption).toBe(2.7);
    expect(rows[0].incoming?.consumption).toBe(2.9);
  });

  it('자재명은 같은데 색상/규격이 다르면 VALUE_DIFF', () => {
    const { rows } = classifyBomDiff(
      [existing({ colorCode: 'BK' })],
      [incoming({ colorCode: 'WH' })],
    );
    expect(rows[0].type).toBe('VALUE_DIFF');
  });

  it('엑셀에만 있는 자재는 ONLY_NEW', () => {
    const { rows } = classifyBomDiff([], [incoming({ itemName: '새자재' })]);
    expect(rows).toEqual([{ type: 'ONLY_NEW', incoming: incoming({ itemName: '새자재' }) }]);
  });

  it('기존 BOM에만 있는 자재는 ONLY_EXISTING', () => {
    const { rows } = classifyBomDiff([existing({ itemName: '옛자재' })], []);
    expect(rows).toEqual([{ type: 'ONLY_EXISTING', existing: existing({ itemName: '옛자재' }) }]);
  });

  it('이름만 다르고 구분이 같은 1:1 후보는 SIMILAR 짝으로 제안한다(사례 2 재현)', () => {
    const existingRow = existing({ bomItemId: 10, itemName: 'DARK GREY DG (원단A)', category: '겉감' });
    const incomingRow = incoming({ itemName: '원단A', category: '겉감' });
    const { rows, similarPairs } = classifyBomDiff([existingRow], [incomingRow]);
    expect(rows).toEqual([]);
    expect(similarPairs).toEqual([{ existing: existingRow, incoming: incomingRow }]);
  });

  it('구분(category)이 다르면 이름이 비슷해도 SIMILAR로 묶지 않는다', () => {
    const existingRow = existing({ bomItemId: 10, itemName: 'DARK GREY DG (원단A)', category: '안감' });
    const incomingRow = incoming({ itemName: '원단A', category: '겉감' });
    const { rows, similarPairs } = classifyBomDiff([existingRow], [incomingRow]);
    expect(similarPairs).toEqual([]);
    expect(rows).toEqual([
      { type: 'ONLY_EXISTING', existing: existingRow },
      { type: 'ONLY_NEW', incoming: incomingRow },
    ]);
  });

  it('짝이 1:3처럼 애매하면 묶지 않고 ONLY_NEW/ONLY_EXISTING으로 남긴다', () => {
    const e1 = existing({ bomItemId: 10, itemName: '노방다시', category: '안감' });
    const e2 = existing({ bomItemId: 11, itemName: '노방대시', category: '안감' });
    const e3 = existing({ bomItemId: 12, itemName: '노방테잎', category: '안감' });
    const incomingRow = incoming({ itemName: '노방', category: '안감' });
    const { similarPairs, rows } = classifyBomDiff([e1, e2, e3], [incomingRow]);
    expect(similarPairs).toEqual([]);
    expect(rows.filter((r) => r.type === 'ONLY_EXISTING')).toHaveLength(3);
    expect(rows.filter((r) => r.type === 'ONLY_NEW')).toHaveLength(1);
  });

  it('BOM이 비어 있으면(둘 다) 행이 없다', () => {
    expect(classifyBomDiff([], [])).toEqual({ rows: [], similarPairs: [] });
  });
});
