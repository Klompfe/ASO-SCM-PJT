import { isOuterFabricCategory } from '../../sales-orders/utils/vision-guardrails.util';
import { classifyBomDiff, type BomDiffExistingRow, type BomDiffIncomingRow } from './bom-diff.util';

// PR-258: 겉감 행 일괄 보충 — 서버 판정(순수 함수, DB 접근 없음). 확신할 수 없으면 보충하지 않고 사유 코드 하나를 돌려준다(fail-closed).
// 입력: 스타일 등록 여부, 라이브 활성 BOM 의 행(없으면 BOM 없음), 엑셀에서 파싱한 BOM 행.
// 판정 순서가 곧 사유 우선순위다(위에서 먼저 걸린 것 하나만 반환).

export type OuterFabricSupplementReason =
  | 'INVALID_INPUT'
  | 'NOT_REGISTERED'
  | 'NO_BOM'
  | 'ALREADY_HAS_OUTER_FABRIC'
  | 'NO_OUTER_FABRIC_ROW'
  | 'MULTIPLE_OUTER_FABRIC_ROWS'
  | 'EMPTY_NAME'
  | 'OTHER_CHANGES';

export interface SupplementIncomingRow {
  itemName: unknown;
  category?: unknown;
  colorCode?: unknown;
  spec?: unknown;
  consumption?: unknown;
  composition?: unknown;
}

export interface SupplementJudgeInput {
  styleNo: unknown;
  registered: boolean;
  // null 이면 활성 BOM 없음. 행이 0개여도 NO_BOM.
  liveRows: BomDiffExistingRow[] | null;
  incomingRows: unknown;
}

export interface SupplementInfo {
  liveOuterFabricRows: number;
  existingRowCount: number;
  incomingRowCount: number;
  sameCount: number;
  similarPairCount: number; // 겉감과 무관한 행끼리의 유사 짝(정보). 판정에는 영향 없음(아래 가드 제외).
  newRowCount: number;
  valueDiffCount: number;
  onlyExistingCount: number;
}

export interface SupplementJudgement {
  eligible: boolean;
  reason?: OuterFabricSupplementReason;
  message: string;
  // eligible 일 때만: 입력 행 목록에서 추가할 겉감 행의 인덱스.
  outerRowIndex?: number;
  info: SupplementInfo;
}

export const SUPPLEMENT_MESSAGES: Record<OuterFabricSupplementReason | 'ELIGIBLE', string> = {
  ELIGIBLE: '겉감 행 1개를 보충할 수 있습니다(나머지 자재명세·스타일 정보는 바뀌지 않음).',
  INVALID_INPUT: '입력을 해석할 수 없어 보충하지 않았습니다.',
  NOT_REGISTERED: '등록되지 않은 스타일이라 보충하지 않았습니다.',
  NO_BOM: '자재명세(BOM)가 없거나 비어 있어 보충하지 않았습니다(스타일 정보가 바뀔 수 있는 경로라 일괄에서 제외).',
  ALREADY_HAS_OUTER_FABRIC: '이미 겉감 행이 있어 보충하지 않았습니다.',
  NO_OUTER_FABRIC_ROW: '이번 파일에 겉감 행이 없어 보충하지 않았습니다.',
  MULTIPLE_OUTER_FABRIC_ROWS: '이번 파일에 겉감 행이 2개 이상이라 보충하지 않았습니다(어느 행인지 확신할 수 없음).',
  EMPTY_NAME: '겉감 행의 자재명이 비어 있어 보충하지 않았습니다.',
  OTHER_CHANGES: '겉감 행 외에 새 행·값 다름·기존에만 있는 행이 있거나 파일이 기존 자재명세와 크게 달라 보충하지 않았습니다(다른 스타일의 파일일 수 있음).',
};

const EMPTY_INFO: SupplementInfo = {
  liveOuterFabricRows: 0, existingRowCount: 0, incomingRowCount: 0, sameCount: 0, similarPairCount: 0, newRowCount: 0, valueDiffCount: 0, onlyExistingCount: 0,
};

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function no(reason: OuterFabricSupplementReason, info: Partial<SupplementInfo> = {}): SupplementJudgement {
  return { eligible: false, reason, message: SUPPLEMENT_MESSAGES[reason], info: { ...EMPTY_INFO, ...info } };
}

export function judgeOuterFabricSupplement(input: SupplementJudgeInput): SupplementJudgement {
  // 입력 형식: 스타일 번호는 비어 있지 않은 문자열, 입력 행은 1개 이상의 배열이고 각 행은 자재명이 문자열인 객체.
  if (typeof input.styleNo !== 'string' || input.styleNo.trim() === '') return no('INVALID_INPUT');
  if (!Array.isArray(input.incomingRows) || input.incomingRows.length === 0) return no('INVALID_INPUT');
  const rows = input.incomingRows as SupplementIncomingRow[];
  if (rows.some((r) => r == null || typeof r !== 'object' || typeof r.itemName !== 'string')) return no('INVALID_INPUT', { incomingRowCount: rows.length });
  const base: Partial<SupplementInfo> = { incomingRowCount: rows.length };

  if (!input.registered) return no('NOT_REGISTERED', base);
  if (!input.liveRows || input.liveRows.length === 0) return no('NO_BOM', base);
  const live = input.liveRows;
  const liveOuter = live.filter((r) => isOuterFabricCategory(r.category)).length;
  const withLive: Partial<SupplementInfo> = { ...base, existingRowCount: live.length, liveOuterFabricRows: liveOuter };
  if (liveOuter > 0) return no('ALREADY_HAS_OUTER_FABRIC', withLive);

  const outerIdx = rows.map((r, i) => (isOuterFabricCategory(str(r.category)) ? i : -1)).filter((i) => i >= 0);
  if (outerIdx.length === 0) return no('NO_OUTER_FABRIC_ROW', withLive);
  if (outerIdx.length > 1) return no('MULTIPLE_OUTER_FABRIC_ROWS', withLive);
  const outerIndex = outerIdx[0];
  if ((rows[outerIndex].itemName as string).trim() === '') return no('EMPTY_NAME', withLive);

  // 같은 파일 가드: 기존 자재명세와 비교해 새 행은 그 겉감 행 1개뿐이어야 하고, 값 다름·기존에만 있음이 0 이어야 한다.
  const incomingForDiff: BomDiffIncomingRow[] = rows.map((r) => ({
    itemName: r.itemName as string,
    category: str(r.category),
    colorCode: str(r.colorCode),
    spec: str(r.spec),
    consumption: typeof r.consumption === 'number' && Number.isFinite(r.consumption) ? r.consumption : null,
  }));
  const { rows: diffRows, similarPairs } = classifyBomDiff(live, incomingForDiff);
  const sameCount = diffRows.filter((d) => d.type === 'SAME').length;
  const valueDiffCount = diffRows.filter((d) => d.type === 'VALUE_DIFF').length;
  const onlyExistingCount = diffRows.filter((d) => d.type === 'ONLY_EXISTING').length;
  const newRows = diffRows.filter((d) => d.type === 'ONLY_NEW');
  const info: SupplementInfo = {
    ...EMPTY_INFO, ...withLive, sameCount, similarPairCount: similarPairs.length, newRowCount: newRows.length, valueDiffCount, onlyExistingCount,
  };

  // 새 겉감 행이 유사 짝에 들어가면 제외 — 라이브에 겉감 행이 0개(위에서 확인)라 구분이 같은 기존 행이 없어 구조적으로 생기지 않지만 방어적으로 확인한다.
  const outerInSimilar = similarPairs.some((p) => p.incoming === incomingForDiff[outerIndex]);
  const onlyNewIsOuter = newRows.length === 1 && newRows[0].incoming === incomingForDiff[outerIndex];
  // 같음이 대부분이어야 한다: 같음이 기존 행의 절반 미만이면(대부분 유사 짝) 엉뚱한 파일로 본다.
  const mostlySame = sameCount * 2 >= live.length;
  if (outerInSimilar || !onlyNewIsOuter || valueDiffCount > 0 || onlyExistingCount > 0 || !mostlySame) return no('OTHER_CHANGES', info);

  return { eligible: true, message: SUPPLEMENT_MESSAGES.ELIGIBLE, outerRowIndex: outerIndex, info };
}
