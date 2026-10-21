import type { AiBomItem, AiOverview, AiWarning } from '../api/salesOrders.service';

// PR-200: 서버(vision.service.ts applyGuardrails)가 overview/bomItem에 붙인 경고를
// 화면에서 다루기 위한 순수 함수들 — 값 변경은 기존 updateOverviewField/
// updateBomItemField(salesOrderOverviewEdit.ts / salesOrderBomReview.ts)를 그대로
// 재사용한다(이 파일은 "무엇을 보여줄지"만 계산한다).

export function findWarning(warnings: AiWarning[] | null | undefined, code: string): AiWarning | undefined {
  return (warnings ?? []).find((w) => w.code === code);
}

export function hasWarning(warnings: AiWarning[] | null | undefined, code: string): boolean {
  return findWarning(warnings, code) != null;
}

// 사용자가 확정한 유일한 저장 차단 규칙 — 끝 글자가 숫자로 읽힌 스타일번호는 사람이
// 영문자로 고치기 전에는 저장할 수 없다. 그 외 경고는 저장을 막지 않는다.
export function shouldBlockSaveForStyleNo(overview: Pick<AiOverview, 'warnings'>): boolean {
  return hasWarning(overview.warnings, 'STYLE_NO_LAST_DIGIT');
}

export interface WarningSummary {
  totalCount: number;
  byCode: Record<string, number>;
}

// 상단 "확인 필요 N건(경고 종류별)" 요약 — overview 경고 + 모든 bomItems 경고를 합쳐 센다.
export function summarizeWarnings(
  results: { overview: Pick<AiOverview, 'warnings'>; bomItems: Pick<AiBomItem, 'warnings'>[] }[],
): WarningSummary {
  const byCode: Record<string, number> = {};
  let totalCount = 0;
  const count = (warnings: AiWarning[] | null | undefined) => {
    for (const w of warnings ?? []) {
      byCode[w.code] = (byCode[w.code] ?? 0) + 1;
      totalCount += 1;
    }
  };
  for (const r of results) {
    count(r.overview.warnings);
    for (const item of r.bomItems) count(item.warnings);
  }
  return { totalCount, byCode };
}

// POSSIBLE_DUPLICATE 경고의 suggestions(행 인덱스를 문자열로 담아 둔 목록)를 실제 인덱스
// 그룹으로 복원한다. 같은 그룹이 묶인 행마다 반복돼 있으므로 중복 그룹은 제거한다.
export function groupDuplicateIndexes(bomItems: Pick<AiBomItem, 'warnings'>[]): number[][] {
  const seen = new Set<string>();
  const groups: number[][] = [];
  for (const item of bomItems) {
    const warning = findWarning(item.warnings, 'POSSIBLE_DUPLICATE');
    if (!warning?.suggestions || warning.suggestions.length === 0) continue;
    const key = warning.suggestions.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(warning.suggestions.map(Number));
  }
  return groups;
}

// "이 행만 남기기" — 묶음에서 keepIndex만 빼고 나머지를 제외 대상에 추가한다(기존
// excludedBomIndexes Set에 더하기만 함, 자동 적용 아님 — 호출자가 사람의 클릭에서만 부른다).
export function applyKeepOnlyThisRow(group: number[], keepIndex: number, excluded: Set<number>): Set<number> {
  const next = new Set(excluded);
  for (const idx of group) if (idx !== keepIndex) next.add(idx);
  return next;
}

export interface FormatConfirmItem {
  index: number;
  styleNo: string | null;
}

// PR-200b: STYLE_NO_FORMAT(끝 글자가 숫자는 아니지만 형식이 안 맞는 경우)가 있는 저장
// 대상만 뽑는다 — 저장 직전 확인창에 쓴다. STYLE_NO_LAST_DIGIT(이미 저장 차단 대상)은
// 빼고, 사람이 칩으로 값을 고쳐 경고가 사라진 행도 빠진다(경고가 그 시점 overview에
// 그대로 남아 있을 때만 포함 — 호출자는 항상 "지금" overview를 넘긴다).
export function collectFormatConfirmItems(
  items: { index: number; overview: Pick<AiOverview, 'styleNo' | 'warnings'> }[],
): FormatConfirmItem[] {
  return items
    .filter(({ overview }) => hasWarning(overview.warnings, 'STYLE_NO_FORMAT') && !hasWarning(overview.warnings, 'STYLE_NO_LAST_DIGIT'))
    .map(({ index, overview }) => ({ index, styleNo: overview.styleNo }));
}

// PR-200b: results[index]를 PDF의 (index+1)쪽으로 보는 모드 A 관례가 실제 쪽수와
// 다를 때 한 줄 안내. pageCount를 모르면(이미지 업로드 등) 안내하지 않는다.
export function pageMismatchNotice(resultCount: number, pageCount: number | null): string | null {
  if (pageCount == null || resultCount === pageCount) return null;
  return `AI 결과 ${resultCount}건 / PDF ${pageCount}쪽 — 쪽 번호가 맞지 않을 수 있습니다. ◀▶ 로 직접 찾아 주세요.`;
}

// PR-200b: 요청한 쪽이 총 쪽수를 넘으면 마지막 쪽으로 보정한다(그 외 추측 로직 없음).
export function clampPage(requestedPage: number, pageCount: number | null): number {
  if (pageCount == null || pageCount <= 0) return requestedPage;
  return Math.min(Math.max(1, requestedPage), pageCount);
}
