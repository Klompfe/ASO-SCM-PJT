// PR-132: 스타일 승인(POST /mapping/commit) 응답의 알림을 화면에 보여주기 위한 순수 로직.
// 서버는 두 종류를 구조로 구분해 준다(mapping-commit.service.ts):
// - NEEDS_REVIEW: 병합 중 "자동 반영을 보류"한 차이(공장 불일치, 기존 자재의 요척/필요량 차이) → 사용자가 확인하고 수동으로 고쳐야 한다.
// - AUTO_APPLIED: 시스템이 값을 "자동으로 채운" 정보성 안내(안감 혼용률 기본값).
export type CommitNoticeType = 'AUTO_APPLIED' | 'NEEDS_REVIEW';
export type CommitNoticeCode = 'FACTORY_MISMATCH' | 'BOM_ITEM_VALUE_DIFF' | 'LINING_COMPOSITION_DEFAULT';

export interface CommitNotice {
  type: CommitNoticeType;
  code: CommitNoticeCode;
  message: string;
}

export interface CommitResponse {
  success: boolean;
  styleNo: string;
  notices: CommitNotice[];
  // 예전 형태(문자열 배열). 같은 내용이 notices[].message로도 온다.
  warnings: string[];
}

// 응답에서 알림 목록을 꺼낸다. notices가 없는 응답(구버전 서버)은 warnings 문자열을 모두 "확인 필요"로 본다 —
// 정보성 안내를 확인 필요로 잘못 보여주는 쪽이, 확인 필요한 차이를 정보성으로 숨기는 쪽보다 안전하다.
export function extractNotices(res: unknown): CommitNotice[] {
  const r = res as { notices?: unknown; warnings?: unknown } | null | undefined;
  if (Array.isArray(r?.notices)) return r!.notices as CommitNotice[];
  if (Array.isArray(r?.warnings)) {
    return (r!.warnings as unknown[]).map((w) => ({ type: 'NEEDS_REVIEW' as const, code: 'BOM_ITEM_VALUE_DIFF' as const, message: String(w) }));
  }
  return [];
}

export interface NoticeGroups {
  needsReview: CommitNotice[];
  autoApplied: CommitNotice[];
}

export function groupNotices(notices: CommitNotice[]): NoticeGroups {
  return {
    needsReview: notices.filter((n) => n.type === 'NEEDS_REVIEW'),
    autoApplied: notices.filter((n) => n.type === 'AUTO_APPLIED'),
  };
}

export const NOTICE_CODE_LABELS: Record<CommitNoticeCode, string> = {
  FACTORY_MISMATCH: '공장 불일치',
  BOM_ITEM_VALUE_DIFF: '요척/필요량 차이',
  LINING_COMPOSITION_DEFAULT: '혼용률 기본값 적용',
};

export const noticeCodeLabel = (code: string): string => NOTICE_CODE_LABELS[code as CommitNoticeCode] ?? '알림';

// 개별 승인 결과의 한 줄 안내
export function commitResultHeadline(notices: CommitNotice[]): string {
  const { needsReview } = groupNotices(notices);
  if (needsReview.length === 0) return '저장되었습니다. 자동 반영 안 된 항목이 없습니다.';
  return `저장되었습니다. 단, 자동 반영되지 않은 항목이 ${needsReview.length}건 있습니다 — 아래 내용을 확인해 주세요.`;
}

export interface StyleCommitResult {
  styleNo: string;
  notices: CommitNotice[];
}

export interface BulkApproveSummary {
  approved: number;
  withReview: number; // 확인이 필요한 차이(NEEDS_REVIEW)가 있는 스타일 수
  withAutoApplied: number; // 자동 적용 안내(AUTO_APPLIED)가 있는 스타일 수
  reviewCount: number; // NEEDS_REVIEW 총 건수
  autoAppliedCount: number;
}

export function summarizeBulk(results: StyleCommitResult[]): BulkApproveSummary {
  let withReview = 0, withAutoApplied = 0, reviewCount = 0, autoAppliedCount = 0;
  for (const r of results) {
    const g = groupNotices(r.notices);
    if (g.needsReview.length > 0) withReview++;
    if (g.autoApplied.length > 0) withAutoApplied++;
    reviewCount += g.needsReview.length;
    autoAppliedCount += g.autoApplied.length;
  }
  return { approved: results.length, withReview, withAutoApplied, reviewCount, autoAppliedCount };
}

export function bulkSummaryText(s: BulkApproveSummary): string {
  if (s.approved === 0) return '승인된 스타일이 없습니다.';
  const base = `${s.approved}개 스타일 승인 완료`;
  if (s.withReview === 0) return `${base}, 확인이 필요한 차이는 없습니다.`;
  return `${base}, 그중 ${s.withReview}개 스타일에 확인이 필요한 차이 있음`;
}

// 확인이 필요한 스타일을 위로(그다음 자동 적용 안내가 있는 스타일, 마지막이 알림 없는 스타일). 같은 그룹 안에서는 원래 순서 유지.
export function sortBulkResults(results: StyleCommitResult[]): StyleCommitResult[] {
  const rank = (r: StyleCommitResult) => {
    const g = groupNotices(r.notices);
    return g.needsReview.length > 0 ? 0 : g.autoApplied.length > 0 ? 1 : 2;
  };
  return results.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}
