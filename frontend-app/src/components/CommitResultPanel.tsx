import React from 'react';
import {
  bulkSummaryText,
  commitResultHeadline,
  groupNotices,
  noticeCodeLabel,
  sortBulkResults,
  summarizeBulk,
  type CommitNotice,
  type StyleCommitResult,
} from '../utils/commitNotices';

// PR-132: 승인(commit) 결과의 알림 목록. "자동 반영 안 됨(확인 후 수동 변경 필요)"은 노란색 경고,
// "자동 적용됨(정보성)"은 파란색 정보로 구분한다. 특정 화면에 묶이지 않는 표시 전용 컴포넌트다.
export const NoticeList: React.FC<{ notices: CommitNotice[] }> = ({ notices }) => {
  const { needsReview, autoApplied } = groupNotices(notices);
  return (
    <div className="space-y-2 text-left">
      {needsReview.length > 0 && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-900 rounded p-3 text-sm" data-testid="notices-needs-review" role="alert">
          <p className="font-semibold mb-1">⚠ 자동 반영되지 않았습니다 — 확인 후 수동으로 수정하세요 ({needsReview.length}건)</p>
          <ul className="space-y-1">
            {needsReview.map((n, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-900 whitespace-nowrap">{noticeCodeLabel(n.code)}</span>
                <span>{n.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {autoApplied.length > 0 && (
        <div className="border border-blue-200 bg-blue-50 text-blue-900 rounded p-3 text-sm" data-testid="notices-auto-applied">
          <p className="font-semibold mb-1">ℹ 자동 적용되었습니다 (참고용, {autoApplied.length}건)</p>
          <ul className="space-y-1">
            {autoApplied.map((n, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-900 whitespace-nowrap">{noticeCodeLabel(n.code)}</span>
                <span>{n.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// 개별 승인 결과: 한 줄 안내 + 알림 목록
export const CommitResultPanel: React.FC<{ styleNo: string; notices: CommitNotice[] }> = ({ styleNo, notices }) => {
  const { needsReview } = groupNotices(notices);
  return (
    <div className="space-y-3" data-testid="commit-result">
      <p className={`text-sm font-medium ${needsReview.length > 0 ? 'text-yellow-800' : 'text-green-700'}`} data-testid="commit-result-headline">
        <span className="font-mono">{styleNo}</span> — {commitResultHeadline(notices)}
      </p>
      <NoticeList notices={notices} />
    </div>
  );
};

// 일괄승인 결과: 스타일별 "차이 있음/없음" 요약. 스타일 줄을 눌러 상세 알림을 펼쳐 본다(확인이 필요한 스타일이 위).
export const BulkApproveResult: React.FC<{ results: StyleCommitResult[]; skipped?: number; onDismiss?: () => void }> = ({ results, skipped = 0, onDismiss }) => {
  const summary = summarizeBulk(results);
  const sorted = sortBulkResults(results);
  const tone = summary.withReview > 0 ? "border-yellow-300 bg-yellow-50" : "border-green-300 bg-green-50";
  return (
    <div className={`border rounded-lg p-4 space-y-3 text-left ${tone}`} data-testid="bulk-result">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-semibold text-gray-900" data-testid="bulk-result-summary">{bulkSummaryText(summary)}</p>
          {summary.withAutoApplied > 0 && (
            <p className="text-sm text-blue-800 mt-0.5" data-testid="bulk-result-auto-note">{summary.withAutoApplied}개 스타일에 자동 적용 안내(참고용)가 있습니다.</p>
          )}
          {skipped > 0 && <p className="text-xs text-gray-600 mt-0.5" data-testid="bulk-result-skipped">{skipped}개는 파싱 실패/이미 등록되어 일괄 승인에서 제외되었습니다(이미 등록된 스타일은 한 줄씩 열어 확인한 뒤 개별로 재승인하세요).</p>}
          <p className="text-xs text-gray-500 mt-0.5">스타일을 클릭하면 상세 내용을 펼쳐볼 수 있습니다.</p>
        </div>
        {onDismiss && <button type="button" className="text-sm text-gray-500 hover:text-gray-800 whitespace-nowrap" onClick={onDismiss}>닫기</button>}
      </div>
      <div className="space-y-1">
        {sorted.map((r) => {
          const g = groupNotices(r.notices);
          const badge =
            g.needsReview.length > 0
              ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-900">확인 필요 {g.needsReview.length}건</span>
              : g.autoApplied.length > 0
                ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-900">자동 적용 {g.autoApplied.length}건</span>
                : <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-900">차이 없음</span>;
          return (
            <details key={r.styleNo} className="bg-white border border-gray-200 rounded" data-testid={`bulk-style-${r.styleNo}`}>
              <summary className="px-3 py-2 cursor-pointer flex items-center gap-3">
                <span className="font-mono">{r.styleNo}</span>
                {badge}
              </summary>
              <div className="px-3 pb-3">
                {r.notices.length === 0
                  ? <p className="text-sm text-green-700">저장되었습니다. 자동 반영 안 된 항목이 없습니다.</p>
                  : <NoticeList notices={r.notices} />}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};
