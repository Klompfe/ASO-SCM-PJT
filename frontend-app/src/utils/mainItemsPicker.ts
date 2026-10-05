import type { SupplierMainItem } from '../api/suppliers.service';

// PR-171: SuppliersManager.tsx의 MainItemsPicker가 쓰는 순수 로직만 분리했다 —
// 이 프로젝트 테스트 환경은 jsdom/이벤트 시뮬레이션이 없어(renderToStaticMarkup만 사용)
// 검색 팝업 클릭→선택 같은 상호작용은 자동화 테스트로 검증할 수 없다. 대신 "중복 선택
// 방지"처럼 실제로 틀릴 수 있는 로직은 여기로 뽑아내 입출력만으로 테스트한다.

export function addMainItem(selected: SupplierMainItem[], picked: SupplierMainItem | null): SupplierMainItem[] {
  if (!picked) return selected;
  if (selected.some((i) => i.id === picked.id)) return selected;
  return [...selected, picked];
}

export function removeMainItem(selected: SupplierMainItem[], id: number): SupplierMainItem[] {
  return selected.filter((i) => i.id !== id);
}
