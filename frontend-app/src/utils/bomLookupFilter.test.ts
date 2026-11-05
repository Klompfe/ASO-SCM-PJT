import { describe, it, expect } from 'vitest';
import { filterBomRows, distinctNonEmptySorted, normalizeForFilter } from './bomLookupFilter';

const row = (overrides: Partial<{ category: string; colorCode: string; material: { name: string } | null }> = {}) => ({
  category: '원단', colorCode: 'BL', material: { name: '겉감 원단' }, ...overrides,
});

describe('normalizeForFilter (PR-224)', () => {
  it('공백 제거 + 대소문자 무시', () => {
    expect(normalizeForFilter('  Kha KI  ')).toBe('khaki');
  });
  it('null/undefined는 빈 문자열', () => {
    expect(normalizeForFilter(null)).toBe('');
    expect(normalizeForFilter(undefined)).toBe('');
  });
});

describe('filterBomRows (PR-224)', () => {
  it('자재명 키워드는 부분 일치·대소문자·공백 무시', () => {
    const rows = [row({ material: { name: 'KHAKI 원단' } }), row({ material: { name: '안감' } })];
    expect(filterBomRows(rows, { nameKeyword: 'khaki' })).toHaveLength(1);
    expect(filterBomRows(rows, { nameKeyword: ' kh aki ' })).toHaveLength(1);
    expect(filterBomRows(rows, { nameKeyword: '없는이름' })).toHaveLength(0);
  });

  it('구분(category) 필터는 정확히 일치', () => {
    const rows = [row({ category: '원단' }), row({ category: '부자재' })];
    expect(filterBomRows(rows, { category: '부자재' })).toHaveLength(1);
  });

  it('색상(colorCode) 필터는 정확히 일치', () => {
    const rows = [row({ colorCode: 'BL' }), row({ colorCode: 'KH' })];
    expect(filterBomRows(rows, { colorCode: 'KH' })).toHaveLength(1);
  });

  it('여러 필터는 AND로 조합된다', () => {
    const rows = [
      row({ category: '원단', colorCode: 'BL', material: { name: 'KHAKI' } }),
      row({ category: '원단', colorCode: 'KH', material: { name: 'KHAKI' } }),
      row({ category: '부자재', colorCode: 'BL', material: { name: 'KHAKI' } }),
    ];
    expect(filterBomRows(rows, { category: '원단', colorCode: 'BL' })).toHaveLength(1);
  });

  it('필터가 전부 비어 있으면(기본/초기화) 전부 통과한다', () => {
    const rows = [row(), row(), row()];
    expect(filterBomRows(rows, {})).toHaveLength(3);
  });

  it('material이 null이어도 예외 없이 이름 없음으로 취급한다', () => {
    const rows = [row({ material: null })];
    expect(filterBomRows(rows, { nameKeyword: 'x' })).toHaveLength(0);
    expect(filterBomRows(rows, {})).toHaveLength(1);
  });
});

describe('distinctNonEmptySorted (PR-224) — 현재 데이터에 있는 값만, 새 분류를 만들지 않음', () => {
  it('중복 제거 + 빈값 제외 + 정렬', () => {
    expect(distinctNonEmptySorted(['부자재', '원단', '부자재', '', null, undefined, '원단'])).toEqual(['부자재', '원단']);
  });
  it('전부 비어 있으면 빈 배열', () => {
    expect(distinctNonEmptySorted(['', null, undefined])).toEqual([]);
  });
});
