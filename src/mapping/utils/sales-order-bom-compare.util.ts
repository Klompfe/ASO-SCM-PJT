import { normalizeForFuzzyMatch, isSimilarMaterialName } from '../../boms/utils/bom-name-normalize.util';

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 자재와 비교" — 순수 함수(DB 접근 없음).
// PR-198의 classifyBomDiff(엑셀 경로, 이름 exact-trim 매칭)와는 다른 매칭 키를 쓴다 —
// 여기서는 mapping-commit.service.ts commit()이 실제로 쓰는 매칭 키(PR-233 정규화 이름 +
// colorCode + spec)와 똑같이 "same"을 판정해야, 화면에 "갱신(same)"으로 보이는 행이
// 실제로 commit()이 자동으로 같은 자재로 처리할 행과 항상 일치한다.
const normalizeKeyPart = (v?: string | null): string => (v && v.trim()) || 'N/A';

export interface SalesOrderBomCompareExistingRow {
  bomItemId: number;
  itemName: string;
  englishName: string | null;
  category: string | null;
  colorCode: string | null;
  spec: string | null;
  consumption: number;
  requiredQty: number;
  unit: string | null;
  remarks: string | null;
  hasManualOverride: boolean;
  hasConfirmedUnitPrice: boolean;
  hasSubtypeAssignment: boolean;
  linkedPurchaseOrderCount: number;
  linkedReceivingCount: number;
  canDelete: boolean;
  blockedReason: string | null;
}

export interface SalesOrderBomCompareIncomingRow {
  itemName: string;
  englishName?: string | null;
  category?: string | null;
  colorCode?: string | null;
  spec?: string | null;
  consumption?: number | null;
  requiredQty?: number | null;
}

export type SalesOrderBomCompareRowType = 'same' | 'similar' | 'new' | 'existingOnly';

export interface SalesOrderBomCompareRow {
  type: SalesOrderBomCompareRowType;
  incomingIndex?: number;
  existing?: SalesOrderBomCompareExistingRow;
  incoming?: SalesOrderBomCompareIncomingRow;
}

// commit()이 실제로 쓰는 매칭 키(정규화 이름 + colorCode + spec, PR-233)와 동일 — 이
// 키로 맞으면 "same"(화면 기본 선택: 갱신). 그 외는 similar/new/existingOnly로 분류한다.
function matchesCommitKey(
  existing: SalesOrderBomCompareExistingRow,
  incoming: SalesOrderBomCompareIncomingRow,
): boolean {
  return (
    normalizeForFuzzyMatch(existing.itemName) === normalizeForFuzzyMatch(incoming.itemName) &&
    normalizeKeyPart(existing.colorCode) === normalizeKeyPart(incoming.colorCode) &&
    normalizeKeyPart(existing.spec) === normalizeKeyPart(incoming.spec)
  );
}

export function classifySalesOrderBomCompare(
  existingRows: SalesOrderBomCompareExistingRow[],
  incomingRows: SalesOrderBomCompareIncomingRow[],
): SalesOrderBomCompareRow[] {
  const rows: SalesOrderBomCompareRow[] = [];
  const matchedExistingIds = new Set<number>();
  const matchedIncoming = new Set<number>();

  incomingRows.forEach((incoming, incomingIndex) => {
    const match = existingRows.find((e) => !matchedExistingIds.has(e.bomItemId) && matchesCommitKey(e, incoming));
    if (!match) return;
    matchedExistingIds.add(match.bomItemId);
    matchedIncoming.add(incomingIndex);
    rows.push({ type: 'same', incomingIndex, existing: match, incoming });
  });

  const unmatchedExisting = existingRows.filter((e) => !matchedExistingIds.has(e.bomItemId));
  const unmatchedIncomingIndexes = incomingRows
    .map((_, i) => i)
    .filter((i) => !matchedIncoming.has(i));

  // "similar" 제안 — 1:1일 때만(모호하면 제안하지 않음), 같은 색상·구분 행끼리만.
  // isSimilarMaterialName은 정규화(normalizeForFuzzyMatch) 기준이라 꺾쇠/괄호 "안"
  // 내용이 다르면(예: 다데<면> vs 다데<실크>) 이미 서로 다르다고 판정한다(PR-233 원칙).
  const pairedExistingIds = new Set<number>();
  const pairedIncomingIndexes = new Set<number>();
  const similarPairs: { existing: SalesOrderBomCompareExistingRow; incomingIndex: number }[] = [];

  const categoryOf = (c: string | null | undefined) => c ?? null;

  for (const incomingIndex of unmatchedIncomingIndexes) {
    const incoming = incomingRows[incomingIndex];
    const forwardCandidates = unmatchedExisting.filter(
      (e) =>
        !pairedExistingIds.has(e.bomItemId) &&
        categoryOf(e.category) === categoryOf(incoming.category) &&
        normalizeKeyPart(e.colorCode) === normalizeKeyPart(incoming.colorCode) &&
        isSimilarMaterialName(e.itemName, incoming.itemName),
    );
    if (forwardCandidates.length !== 1) continue;
    const candidate = forwardCandidates[0];

    const backwardIndexes = unmatchedIncomingIndexes.filter(
      (i) =>
        !pairedIncomingIndexes.has(i) &&
        categoryOf(candidate.category) === categoryOf(incomingRows[i].category) &&
        normalizeKeyPart(candidate.colorCode) === normalizeKeyPart(incomingRows[i].colorCode) &&
        isSimilarMaterialName(candidate.itemName, incomingRows[i].itemName),
    );
    if (backwardIndexes.length !== 1) continue;

    similarPairs.push({ existing: candidate, incomingIndex });
    pairedExistingIds.add(candidate.bomItemId);
    pairedIncomingIndexes.add(incomingIndex);
  }

  for (const pair of similarPairs) {
    rows.push({ type: 'similar', incomingIndex: pair.incomingIndex, existing: pair.existing, incoming: incomingRows[pair.incomingIndex] });
  }
  for (const existing of unmatchedExisting) {
    if (!pairedExistingIds.has(existing.bomItemId)) rows.push({ type: 'existingOnly', existing });
  }
  for (const incomingIndex of unmatchedIncomingIndexes) {
    if (!pairedIncomingIndexes.has(incomingIndex)) rows.push({ type: 'new', incomingIndex, incoming: incomingRows[incomingIndex] });
  }

  return rows;
}
