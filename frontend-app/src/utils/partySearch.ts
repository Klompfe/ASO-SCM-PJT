// PR-245: 고객사(바이어)·공급업체 관리 목록의 텍스트 조회. 목록이 이미 전체 로드되므로 화면에서 걸러내고
// (추가 API 호출 없음), 서버 LOWER() 비교가 필요 없다. 두 화면이 같은 함수를 쓴다.
import type { Buyer } from '../api/buyers.service';
import type { Supplier } from '../api/suppliers.service';

export const NO_RESULT_MESSAGE = '검색 결과가 없습니다. 검색어를 지우면 전체 목록이 보입니다';
export const DUPLICATE_NAME_MESSAGE = '이미 등록된 이름입니다';

// 앞뒤 공백 제거 + 대소문자 무시 + 연속 공백은 하나로.
export function normalizeSearchText(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

// 빈 검색어(공백만 포함)는 전체 목록(같은 배열)을 그대로 돌려준다 — 목록을 막지 않는다.
// 검색 대상 필드 중 하나라도 검색어를 부분 일치로 포함하면 남긴다. 원래 순서를 유지한다.
export function filterByText<T>(
  items: readonly T[],
  query: string | null | undefined,
  fieldsOf: (item: T) => (string | null | undefined)[],
): T[] {
  const q = normalizeSearchText(query);
  if (!q) return items as T[];
  return items.filter((item) => fieldsOf(item).some((f) => normalizeSearchText(f).includes(q)));
}

// 화면에 보이는 텍스트 필드 전부.
export const buyerSearchFields = (b: Buyer): (string | null | undefined)[] => [
  b.name, b.code, b.brandCode, b.contactPerson, b.contactPhone, b.email, b.country, b.address,
];

export const supplierSearchFields = (s: Supplier): (string | null | undefined)[] => [
  s.name, s.code, s.abbrCode, s.businessNumber, s.contactPhone, s.email, s.address,
  ...(s.categories ?? []).map((c) => c.name),
];

export function formatResultCount(total: number, shown: number, query: string | null | undefined): string {
  return normalizeSearchText(query) ? `전체 ${total}건 중 ${shown}건` : `전체 ${total}건`;
}

// 등록 폼 중복 안내: 정규화(공백·대소문자) 기준으로 같은 이름이 이미 있으면 그 항목. 부분 일치는 아님.
export function findDuplicateName<T extends { id: number; name: string }>(
  name: string | null | undefined,
  items: readonly T[],
  excludeId?: number,
): T | null {
  const n = normalizeSearchText(name);
  if (!n) return null;
  return items.find((i) => i.id !== excludeId && normalizeSearchText(i.name) === n) ?? null;
}
