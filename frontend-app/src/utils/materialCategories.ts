import type { MaterialCategory } from '../api/materialCategories.service';

// PR-183: 품목군 선택 화면이 쓰는 순수 로직. 프로젝트 테스트 환경은 DOM 상호작용을 자동화하지
// 않으므로(vitest 순수 함수 위주), 실제로 틀릴 수 있는 규칙만 여기로 뽑아 입출력으로 검증한다.

// 선택 칩에는 활성 품목군만 보여준다. 서버 정렬(sortOrder)을 그대로 따른다.
export function activeCategories(list: MaterialCategory[]): MaterialCategory[] {
  return list.filter((c) => c.isActive);
}

// 칩을 누르면 선택/해제. 중복은 만들지 않는다.
export function toggleCategoryId(selectedIds: number[], id: number): number[] {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

// 공급업체 목록 배지용: 연결된 품목군 이름들(없으면 빈 배열).
export function categoryNames(categories?: { name: string }[] | null): string[] {
  return (categories ?? []).map((c) => c.name);
}

// 이전 방식(주요품목 개별 품목)으로 등록된 업체의 안내 문구. 자동으로 품목군으로 바꾸지 않고
// 읽기 전용으로만 보여준다. 없으면 null.
export function legacyMainItemsNote(mainItems?: { name: string }[] | null): string | null {
  if (!mainItems || mainItems.length === 0) return null;
  return `(이전 방식으로 등록된 품목: ${mainItems.map((i) => i.name).join(', ')})`;
}

// 발주 폼 "이 품목군 취급 업체만 보기" 체크박스 상태.
// - 품목에 품목군이 없으면 체크박스 자체를 숨긴다(hidden).
// - 품목군이 있으면 기본 켜짐(on). 켜면 그 품목군을 취급하는 업체만, 끄면 전체 업체.
export type CategoryFilterState = { visible: false } | { visible: true; checked: boolean; categoryId: number };

export function categoryFilterState(itemCategoryId: number | null | undefined, checked: boolean): CategoryFilterState {
  if (itemCategoryId == null) return { visible: false };
  return { visible: true, checked, categoryId: itemCategoryId };
}

// 검색 요청에 실을 categoryId: 체크됐을 때만 실린다. 체크를 끄면 업체 검색은 전체 대상이다.
export function supplierSearchCategoryId(state: CategoryFilterState): number | undefined {
  return state.visible && state.checked ? state.categoryId : undefined;
}
