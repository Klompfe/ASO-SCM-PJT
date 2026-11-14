import React, { useState } from 'react';
import type { ParsedStyleResult } from '../api/mapping.service';
import { BADGE_ALREADY_REGISTERED, BADGE_PARSE_FAILED, BADGE_PENDING, BADGE_APPROVAL_FAILED } from '../utils/mappingApproval';
import type { ApprovalFailureReason } from '../utils/uploadReviewStatus';

interface StyleReviewListProps {
  styles: ParsedStyleResult[];
  existsMap: Record<string, boolean>;
  onSelect: (style: ParsedStyleResult) => void;
  // PR-237: 승인(일괄/개별)이 실패한 스타일은 사라지지 않고 이유와 함께 남는다 — 키는
  // sheetName(styleNo가 없는 행도 가리킬 수 있는 유일 식별자).
  failuresBySheet?: Record<string, ApprovalFailureReason>;
  // "다시 승인" — 개별 재시도(그 스타일만 다시 handleBulkApprove와 같은 승인 호출).
  onRetry?: (style: ParsedStyleResult) => void;
  retryingSheet?: string | null;
}

export const StyleReviewList: React.FC<StyleReviewListProps> = ({ styles, existsMap, onSelect, failuresBySheet = {}, onRetry, retryingSheet }) => {
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  // 파싱 실패한 시트는 확인할 상세 데이터가 없으므로 목록 맨 아래로 보낸다. 승인 실패는
  // 눈에 잘 띄어야 하므로 그 다음으로 바로 뒤에 두지 않고 맨 위로 올린다(사라졌던 문제를
  // 겪은 화면이라, 실패 건을 가장 먼저 보게 한다).
  const sorted = [...styles].sort((a, b) => {
    const rank = (s: ParsedStyleResult) => (s.parseError ? 2 : failuresBySheet[s.sheetName] ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
      <table>
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="px-4 py-2 text-left">Style No</th>
            <th className="px-4 py-2 text-left">공장</th>
            <th className="px-4 py-2 text-left">총생산수량</th>
            <th className="px-4 py-2 text-left">바이어</th>
            <th className="px-4 py-2 text-left">자재 항목 수</th>
            <th className="px-4 py-2 text-left">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sorted.map((style) => {
            const hasError = !!style.parseError;
            const alreadyExists = !!style.styleNo && existsMap[style.styleNo];
            const failure = failuresBySheet[style.sheetName];
            const isExpanded = expandedSheet === style.sheetName;
            return (
              <tr
                key={style.sheetName}
                className={hasError ? 'bg-red-50' : failure ? 'bg-red-50' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-2 font-mono cursor-pointer" onClick={() => !hasError && onSelect(style)}>{style.styleNo || style.sheetName}</td>
                <td className="px-4 py-2">{style.overview?.factory ?? '-'}</td>
                <td className="px-4 py-2">{style.overview?.totalQty ?? '-'}</td>
                <td className="px-4 py-2">{style.overview?.buyer ?? '-'}</td>
                <td className="px-4 py-2">{style.bomItems?.length ?? '-'}</td>
                <td className="px-4 py-2 space-x-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {hasError ? (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800" title={style.parseError}>
                        {BADGE_PARSE_FAILED}
                      </span>
                    ) : failure ? (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                        {BADGE_APPROVAL_FAILED}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        {BADGE_PENDING}
                      </span>
                    )}
                    {!hasError && alreadyExists && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        {BADGE_ALREADY_REGISTERED}
                      </span>
                    )}
                  </div>
                  {failure && (
                    <div className="mt-1 text-xs text-red-700">
                      <span>{failure.message}</span>
                      {failure.kind === 'unknown' && failure.detail && (
                        <button
                          type="button"
                          className="ml-1 underline text-gray-500"
                          onClick={() => setExpandedSheet(isExpanded ? null : style.sheetName)}
                        >
                          {isExpanded ? '접기' : '자세히'}
                        </button>
                      )}
                      {isExpanded && failure.detail && (
                        <pre className="mt-1 whitespace-pre-wrap break-all bg-red-100 p-1 rounded text-xs text-red-900">{failure.detail}</pre>
                      )}
                      {onRetry && (
                        <button
                          type="button"
                          className="ml-2 text-blue-600 underline disabled:opacity-50"
                          disabled={retryingSheet === style.sheetName}
                          onClick={() => onRetry(style)}
                        >
                          {retryingSheet === style.sheetName ? '다시 승인 중...' : '다시 승인'}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};
