import { classifyCompositionStatus, type CompositionStatus } from './composition-update.util';
import { normalizeForFuzzyMatch, isSimilarMaterialName } from '../../boms/utils/bom-name-normalize.util';
import { findOuterFabricPair } from './outer-fabric-pair.util';

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
  // PR-246: 기존 행의 혼용률(없으면 null).
  composition?: string | null;
  // PR-250: 기존 행의 작지 수량(sheetQty) — 사전 점검이 "수량이 바뀌는지"를 판단하는 데 쓴다(읽기 전용 정보).
  sheetQty?: number | null;
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
  composition?: string | null;
}

export type SalesOrderBomCompareRowType = 'same' | 'similar' | 'new' | 'existingOnly';

export interface SalesOrderBomCompareRow {
  type: SalesOrderBomCompareRowType;
  incomingIndex?: number;
  existing?: SalesOrderBomCompareExistingRow;
  incoming?: SalesOrderBomCompareIncomingRow;
  // PR-246: 기존 행과 들어온 행이 둘 다 있을 때(same/similar)만 채워진다(선택 필드).
  existingComposition?: string | null;
  incomingComposition?: string | null;
  compositionStatus?: CompositionStatus;
  // PR-257: 겉감 짝(제안) — 엑셀 겉감 행과 작지 겉감 행을 한 쌍으로 제안한 similar 행. 화면 기본 선택은 "기존 행에 합치기".
  outerFabricPair?: boolean;
}

function withComposition(row: SalesOrderBomCompareRow): SalesOrderBomCompareRow {
  if (!row.existing || !row.incoming) return row;
  const existingComposition = row.existing.composition?.trim() || null;
  const incomingComposition = row.incoming.composition?.trim() || null;
  return {
    ...row,
    existingComposition,
    incomingComposition,
    compositionStatus: classifyCompositionStatus(existingComposition, incomingComposition),
  };
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
    rows.push(withComposition({ type: 'same', incomingIndex, existing: match, incoming }));
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

  // PR-257: 겉감 짝 — 기존 겉감 계열 행이 정확히 1개, 새 인식 겉감 계열 행도 정확히 1개일 때만, 아직 짝이 없는 그 둘을
  // "겉감 짝(제안)"으로 묶는다(구분·색상·규격이 달라도). 이미 same 으로 맞은 행이나 다른 행과 짝지어진 행은 건드리지 않는다.
  const outerPair = findOuterFabricPair(existingRows, incomingRows);
  let outerPairIncomingIndex: number | null = null;
  if (outerPair) {
    const existingRow = existingRows.find((e) => e.bomItemId === outerPair.existingBomItemId);
    const existingFree = !!existingRow && !matchedExistingIds.has(existingRow.bomItemId);
    const incomingFree = !matchedIncoming.has(outerPair.incomingIndex);
    const alreadyPairedTogether = similarPairs.some(
      (p) => p.existing.bomItemId === outerPair.existingBomItemId && p.incomingIndex === outerPair.incomingIndex,
    );
    const existingPairedElsewhere = similarPairs.some((p) => p.existing.bomItemId === outerPair.existingBomItemId) && !alreadyPairedTogether;
    const incomingPairedElsewhere = similarPairs.some((p) => p.incomingIndex === outerPair.incomingIndex) && !alreadyPairedTogether;
    if (existingFree && incomingFree && !existingPairedElsewhere && !incomingPairedElsewhere) {
      if (!alreadyPairedTogether && existingRow) {
        similarPairs.push({ existing: existingRow, incomingIndex: outerPair.incomingIndex });
        pairedExistingIds.add(existingRow.bomItemId);
        pairedIncomingIndexes.add(outerPair.incomingIndex);
      }
      outerPairIncomingIndex = outerPair.incomingIndex;
    }
  }

  for (const pair of similarPairs) {
    const row = withComposition({ type: 'similar', incomingIndex: pair.incomingIndex, existing: pair.existing, incoming: incomingRows[pair.incomingIndex] });
    rows.push(pair.incomingIndex === outerPairIncomingIndex ? { ...row, outerFabricPair: true } : row);
  }
  for (const existing of unmatchedExisting) {
    if (!pairedExistingIds.has(existing.bomItemId)) rows.push({ type: 'existingOnly', existing });
  }
  for (const incomingIndex of unmatchedIncomingIndexes) {
    if (!pairedIncomingIndexes.has(incomingIndex)) rows.push({ type: 'new', incomingIndex, incoming: incomingRows[incomingIndex] });
  }

  return rows;
}
