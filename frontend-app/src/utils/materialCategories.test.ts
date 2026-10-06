import { describe, it, expect } from 'vitest';
import {
  activeCategories,
  toggleCategoryId,
  categoryNames,
  legacyMainItemsNote,
  categoryFilterState,
  supplierSearchCategoryId,
} from './materialCategories';

describe('품목군 선택 칩 — activeCategories', () => {
  it('비활성 품목군은 칩 목록에서 뺀다(서버 정렬 순서 유지)', () => {
    const list = [
      { id: 1, name: '겉감', sortOrder: 1, isActive: true },
      { id: 9, name: '옛 품목군', sortOrder: 2, isActive: false },
      { id: 3, name: '실', sortOrder: 3, isActive: true },
    ];
    expect(activeCategories(list).map((c) => c.name)).toEqual(['겉감', '실']);
  });
});

describe('품목군 칩 — toggleCategoryId', () => {
  it('없으면 추가, 있으면 해제한다(여러 개 선택 가능)', () => {
    expect(toggleCategoryId([], 1)).toEqual([1]);
    expect(toggleCategoryId([1], 3)).toEqual([1, 3]);
    expect(toggleCategoryId([1, 3], 1)).toEqual([3]);
  });
});

describe('공급업체 배지 / 이전 방식 주요품목 안내', () => {
  it('categoryNames는 품목군이 없으면 빈 배열을 준다', () => {
    expect(categoryNames(undefined)).toEqual([]);
    expect(categoryNames([{ name: '실' }, { name: '라벨' }])).toEqual(['실', '라벨']);
  });

  it('legacy mainItems가 없으면 안내 문구를 만들지 않는다', () => {
    expect(legacyMainItemsNote([])).toBeNull();
    expect(legacyMainItemsNote(undefined)).toBeNull();
  });

  it('legacy mainItems가 있으면 읽기 전용 회색 문구로 이름을 나열한다', () => {
    expect(legacyMainItemsNote([{ name: '원단A' }, { name: '원단B' }])).toBe('(이전 방식으로 등록된 품목: 원단A, 원단B)');
  });
});

describe('발주 폼 "이 품목군 취급 업체만 보기"', () => {
  it('품목에 품목군이 없으면 체크박스를 숨기고 검색에 필터를 싣지 않는다', () => {
    const state = categoryFilterState(null, true);
    expect(state).toEqual({ visible: false });
    expect(supplierSearchCategoryId(state)).toBeUndefined();
  });

  it('품목군이 있으면 보이고, 기본(체크 on)일 때 그 품목군 id로 검색한다', () => {
    const state = categoryFilterState(3, true);
    expect(state).toEqual({ visible: true, checked: true, categoryId: 3 });
    expect(supplierSearchCategoryId(state)).toBe(3);
  });

  it('체크를 끄면(off) 필터 없이 전체 업체를 대상으로 한다', () => {
    const state = categoryFilterState(3, false);
    expect(state.visible).toBe(true);
    expect(supplierSearchCategoryId(state)).toBeUndefined();
  });

  it('품목군 id가 0이어도(null/undefined가 아니면) 보인다', () => {
    expect(categoryFilterState(0, true).visible).toBe(true);
  });
});
