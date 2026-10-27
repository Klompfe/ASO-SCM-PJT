import { isSimilarMaterialName } from '../../boms/utils/bom-name-normalize.util';

// PR-198: 엑셀 업로드 저장 전 "기존 BOM과 비교" 분류 — 순수 함수(DB 접근 없음).
// mapping-commit.service.ts의 커밋 시 매칭 키((자재명 exact, colorCode/spec
// normalizeKeyPart))와 달리, 여기서는 "같은 행"을 자재명(trim) exact로만 먼저 찾고
// 요척/규격/색상 중 하나라도 다르면 VALUE_DIFF로 분류한다 — 그래야 "같은 자재인데
// 요척만 틀림"(사례 1: 2.7 vs 2.9)을 하나의 행으로 보여주고 OVERWRITE로 고칠 수 있다.
const normalizeKeyPart = (v?: string | null): string => (v && v.trim()) || 'N/A';

export interface BomDiffExistingRow {
  bomItemId: number;
  itemName: string;
  category: string | null;
  colorCode: string | null;
  spec: string | null;
  consumption: number;
  linkedPoCount: number;
}

export interface BomDiffIncomingRow {
  itemName: string;
  category?: string | null;
  colorCode?: string | null;
  spec?: string | null;
  consumption?: number | null;
}

export type BomDiffRowType = 'SAME' | 'VALUE_DIFF' | 'ONLY_NEW' | 'ONLY_EXISTING';

export interface BomDiffRow {
  type: BomDiffRowType;
  existing?: BomDiffExistingRow;
  incoming?: BomDiffIncomingRow;
}

// 제안일 뿐 — 자동 확정하지 않는다. 사람이 화면에서 REPLACE를 고를 때만 적용된다.
export interface BomSimilarPair {
  existing: BomDiffExistingRow;
  incoming: BomDiffIncomingRow;
}

export interface BomDiffClassification {
  rows: BomDiffRow[];
  similarPairs: BomSimilarPair[];
}

export function classifyBomDiff(
  existingRows: BomDiffExistingRow[],
  incomingRows: BomDiffIncomingRow[],
): BomDiffClassification {
  const rows: BomDiffRow[] = [];
  const matchedExistingIds = new Set<number>();
  const matchedIncoming = new Set<BomDiffIncomingRow>();

  for (const incoming of incomingRows) {
    const existingMatch = existingRows.find(
      (e) => !matchedExistingIds.has(e.bomItemId) && e.itemName.trim() === incoming.itemName.trim(),
    );
    if (!existingMatch) continue;
    matchedExistingIds.add(existingMatch.bomItemId);
    matchedIncoming.add(incoming);

    const sameConsumption = Number(existingMatch.consumption) === Number(incoming.consumption ?? 0);
    const sameSpec = normalizeKeyPart(existingMatch.spec) === normalizeKeyPart(incoming.spec);
    const sameColor = normalizeKeyPart(existingMatch.colorCode) === normalizeKeyPart(incoming.colorCode);
    rows.push({
      type: sameConsumption && sameSpec && sameColor ? 'SAME' : 'VALUE_DIFF',
      existing: existingMatch,
      incoming,
    });
  }

  const unmatchedExisting = existingRows.filter((e) => !matchedExistingIds.has(e.bomItemId));
  const unmatchedIncoming = incomingRows.filter((i) => !matchedIncoming.has(i));

  // SIMILAR 제안 — 양쪽 다 후보가 정확히 1개일 때만(1:1) 짝으로 묶는다. 그렇지
  // 않으면(예: 1개 ↔ 3개) 묶지 않고 각각 ONLY_NEW/ONLY_EXISTING으로 남긴다.
  const pairedExistingIds = new Set<number>();
  const pairedIncoming = new Set<BomDiffIncomingRow>();
  const similarPairs: BomSimilarPair[] = [];

  const categoryOf = (c: string | null | undefined) => c ?? null;

  for (const incoming of unmatchedIncoming) {
    const forwardCandidates = unmatchedExisting.filter(
      (e) =>
        !pairedExistingIds.has(e.bomItemId) &&
        categoryOf(e.category) === categoryOf(incoming.category) &&
        isSimilarMaterialName(e.itemName, incoming.itemName),
    );
    if (forwardCandidates.length !== 1) continue;
    const candidate = forwardCandidates[0];

    const backwardCandidates = unmatchedIncoming.filter(
      (i) =>
        !pairedIncoming.has(i) &&
        categoryOf(candidate.category) === categoryOf(i.category) &&
        isSimilarMaterialName(candidate.itemName, i.itemName),
    );
    if (backwardCandidates.length !== 1) continue;

    similarPairs.push({ existing: candidate, incoming });
    pairedExistingIds.add(candidate.bomItemId);
    pairedIncoming.add(incoming);
  }

  for (const existing of unmatchedExisting) {
    if (!pairedExistingIds.has(existing.bomItemId)) rows.push({ type: 'ONLY_EXISTING', existing });
  }
  for (const incoming of unmatchedIncoming) {
    if (!pairedIncoming.has(incoming)) rows.push({ type: 'ONLY_NEW', incoming });
  }

  return { rows, similarPairs };
}
