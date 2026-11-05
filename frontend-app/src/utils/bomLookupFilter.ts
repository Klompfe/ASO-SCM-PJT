// PR-224: 자재·BOM 조회 화면(ItemsManager.tsx)에서 선택한 스타일의 BOM 자재 목록을
// 자재명/구분/색상으로 거르는 순수 함수. 서버 요청 없음 — 이미 불러온 bom.items에만
// 적용한다(계산·소요량 로직과는 무관).
export interface BomFilterableRow {
  category: string;
  colorCode: string;
  material?: { name: string } | null;
}

// 공백 제거 + 대소문자 무시 — 이 코드베이스의 기존 이름 비교 관례(normalizeMaterialName류)와 같다.
export function normalizeForFilter(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

export interface BomRowFilter {
  nameKeyword?: string;
  category?: string;
  colorCode?: string;
}

export function filterBomRows<T extends BomFilterableRow>(rows: T[], filter: BomRowFilter): T[] {
  const nameNorm = normalizeForFilter(filter.nameKeyword);
  return rows.filter((row) => {
    if (filter.category && row.category !== filter.category) return false;
    if (filter.colorCode && row.colorCode !== filter.colorCode) return false;
    if (nameNorm && !normalizeForFilter(row.material?.name).includes(nameNorm)) return false;
    return true;
  });
}

// 구분/색상 선택지 — 현재 불러온 행에 실제로 있는 값만(새 분류를 만들지 않는다), 빈 값 제외, 정렬.
export function distinctNonEmptySorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))).sort();
}
