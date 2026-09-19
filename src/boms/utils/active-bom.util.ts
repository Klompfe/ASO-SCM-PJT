// PR-121: 한 스타일에 Bom이 여러 건일 때 "어느 것을 쓸지" 규칙과 중복 BOM 내용 비교.
//
// 규칙: isActive=true인 BOM 중 가장 최신(id가 가장 큰 것). 활성 BOM이 하나도 없으면(수동 조작 등으로
// 생길 수 있는 비정상 상태) 보고서가 "BOM 없음"으로 잘못 보이지 않도록 전체 중 가장 최신으로 대체한다.
// isActive 값이 없는 객체(undefined)는 활성으로 본다 — 이전 동작(항상 최신 id)과 같은 결과를 유지하기 위함.
export function pickActiveBom<T extends { id: number; isActive?: boolean | null }>(boms: T[]): T | null {
  if (!boms || boms.length === 0) return null;
  const active = boms.filter((b) => b.isActive !== false);
  const pool = active.length > 0 ? active : boms;
  return pool.reduce((latest, b) => (b.id > latest.id ? b : latest));
}

export interface ComparableBomItem {
  // 자재를 구분하는 키 — 기본은 Item id, 이름 기준 비교 때는 정규화한 이름을 넣는다.
  materialId?: number | string | null;
  consumption: unknown;
}

// 이름 기준 비교용: 줄바꿈(\n/\r\n)·연속 공백 차이만 있는 이름을 같은 자재로 본다. 실제 운영 데이터에서 같은 자재가
// 커밋 시점에 따라 줄바꿈 표기만 다른 별도 Item 레코드로 여러 번 등록된 경우가 확인됐다(MB6YSLM115Z).
export const normalizeMaterialName = (name: string | null | undefined): string => (name ?? '').replace(/\s+/g, ' ').trim();

const round4 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
};

// BOM 한 건의 "품목/소요량 조합" 지문 — 자재별 소요량 행을 정렬해 이어 붙인다. 행 순서·id·색상/규격 표기 같은
// 부수 차이는 무시하고 (자재, 제품 1개당 소요량) 조합만 비교한다.
export function bomContentSignature(items: ComparableBomItem[]): string {
  return items
    .map((i) => `${i.materialId ?? 'null'}|${round4(i.consumption)}`)
    .sort()
    .join(';');
}

// 여러 BOM의 품목/소요량 조합이 전부 같으면 true(=검토가 필요 없는 완전 중복).
export function areBomContentsIdentical(boms: { items: ComparableBomItem[] }[]): boolean {
  if (boms.length < 2) return true;
  const first = bomContentSignature(boms[0].items);
  return boms.every((b) => bomContentSignature(b.items) === first);
}
