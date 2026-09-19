export interface DuplicateBomItem {
  id: number;
  materialId: number | null;
  materialCode: string;
  materialName: string;
  category: string;
  colorCode: string;
  spec: string;
  consumption: number;
}

export interface DuplicateBom {
  id: number;
  bomNo: string;
  version: string;
  isActive: boolean;
  itemCount: number;
  items: DuplicateBomItem[];
}

export interface DuplicateBomStyle {
  styleNo: string;
  bomCount: number;
  activeCount: number;
  identical: boolean;
  // 이름(줄바꿈/공백 정규화)+소요량이 같으면 true — identical=false인데 이것만 true이면 자재 마스터 레코드만 다른 중복.
  sameByName: boolean;
  needsReview: boolean;
  boms: DuplicateBom[];
}

const round4 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
};

// 서버의 pickActiveBom과 같은 규칙: 활성 BOM 중 가장 최신(id 최대), 활성이 없으면 전체 중 최신.
// 화면의 라디오 버튼 초기 선택 = 지금 실제로 쓰이고 있는 BOM.
export const currentBomId = (style: DuplicateBomStyle): number => {
  const active = style.boms.filter((b) => b.isActive);
  const pool = active.length > 0 ? active : style.boms;
  return pool.reduce((latest, b) => (b.id > latest.id ? b : latest)).id;
};

// 저장 버튼 활성 조건: 선택한 BOM이 이미 "유일한 활성 BOM"이면 바꿀 게 없다.
export const isSelectionUnchanged = (style: DuplicateBomStyle, selectedId: number): boolean =>
  style.activeCount === 1 && style.boms.some((b) => b.id === selectedId && b.isActive);

export const normalizeName = (name: string): string => (name ?? '').replace(/\s+/g, ' ').trim();

export type DiffMode = 'record' | 'name';

// record: (자재 레코드 id, 소요량) 기준 / name: (정규화한 자재 이름, 소요량) 기준
const rowKeyOf = (mode: DiffMode) => (i: DuplicateBomItem) =>
  `${mode === 'name' ? normalizeName(i.materialName) : (i.materialId ?? 'null')}|${round4(i.consumption)}`;

// 나란히 비교할 때 강조할 행: (자재, 소요량) 조합이 다른 BOM 전부에 똑같이 있으면 "공통", 하나라도 빠져 있으면 "차이".
// 같은 조합이 한 BOM 안에 여러 번 나오면(색상별 행 등) 개수까지 맞아야 공통으로 본다.
export const markDifferences = (boms: DuplicateBom[], mode: DiffMode = 'record'): Map<number, Set<number>> => {
  const rowKey = rowKeyOf(mode);
  const counts = boms.map((b) => {
    const m = new Map<string, number>();
    for (const i of b.items) m.set(rowKey(i), (m.get(rowKey(i)) ?? 0) + 1);
    return m;
  });
  const result = new Map<number, Set<number>>(); // bomId -> 차이가 나는 item id 집합
  boms.forEach((b, idx) => {
    const seen = new Map<string, number>();
    const diff = new Set<number>();
    for (const i of b.items) {
      const k = rowKey(i);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      const inAllOthers = counts.every((c, j) => j === idx || (c.get(k) ?? 0) >= n);
      if (!inAllOthers) diff.add(i.id);
    }
    result.set(b.id, diff);
  });
  return result;
};

export interface BomDifferenceSummary {
  bomId: number;
  itemCount: number;
  consumptionSum: number;
  differingItemCount: number;
}

export const summarizeBoms = (style: DuplicateBomStyle): BomDifferenceSummary[] => {
  const marks = markDifferences(style.boms, 'name');
  return style.boms.map((b) => ({
    bomId: b.id,
    itemCount: b.itemCount,
    consumptionSum: round4(b.items.reduce((a, i) => a + Number(i.consumption), 0)),
    differingItemCount: marks.get(b.id)?.size ?? 0,
  }));
};

export const splitByReview = (styles: DuplicateBomStyle[]) => ({
  needsReview: styles.filter((s) => s.needsReview),
  identical: styles.filter((s) => !s.needsReview),
});
