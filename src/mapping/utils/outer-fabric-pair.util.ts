import { isOuterFabricCategory } from '../../sales-orders/utils/vision-guardrails.util';

// PR-257: 작지 저장 시 "겉감 짝" 규칙 — 순수 함수(DB 접근 없음).
// 엑셀로 보충한 겉감 행(구분 `겉감 OUT-SHELL`, 이름은 일반 라벨)과 작지가 인식한 겉감 행(구분 `겉감`, 이름은 소재명)은
// 이름·구분이 달라 기존 매칭(PR-233 정규화 이름 + 색상 + 규격, 비교 화면의 구분 완전 일치)에 걸리지 않아 겉감 행이 두 줄이 된다.
// 사람이 확인하는 비교 화면에서만 쓰며, 확신할 수 없으면 짝을 만들지 않는다(fail-closed):
// 기존 BOM 의 겉감 계열 행이 정확히 1개이고, 새 인식 행의 겉감 계열도 정확히 1개일 때만 한 쌍으로 본다.
// 겉감 계열 판정은 PR-255 와 같은 단어 경계 규칙(isOuterFabricCategory)이며 색상·규격은 비교하지 않는다.
export interface OuterPairExistingRow {
  bomItemId: number;
  category: string | null | undefined;
}
export interface OuterPairIncomingRow {
  category?: string | null;
}

export interface OuterFabricPair {
  existingBomItemId: number;
  incomingIndex: number;
}

export function findOuterFabricPair(
  existingRows: readonly OuterPairExistingRow[],
  incomingRows: readonly OuterPairIncomingRow[],
): OuterFabricPair | null {
  const existingOuter = existingRows.filter((r) => isOuterFabricCategory(r?.category));
  const incomingOuterIdx = incomingRows.map((r, i) => (isOuterFabricCategory(r?.category) ? i : -1)).filter((i) => i >= 0);
  if (existingOuter.length !== 1 || incomingOuterIdx.length !== 1) return null;
  return { existingBomItemId: existingOuter[0].bomItemId, incomingIndex: incomingOuterIdx[0] };
}
