import React from 'react';
import { getPaginationView } from '../utils/pagination';

interface PaginationProps {
  page: number;
  totalPages: number;
  // 주어지면 "총 N건"을 함께 보여준다.
  total?: number;
  onPageChange: (page: number) => void;
  // 조회 중에는 버튼을 잠근다(연타로 요청이 겹치는 것을 막는다).
  disabled?: boolean;
  className?: string;
}

// PR-128: 목록 화면 공통 "이전/다음" 페이지 이동. 특정 화면·도메인에 종속되지 않는다(백엔드 meta의 page/totalPages/total만 받는다).
export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, total, onPageChange, disabled, className = '' }) => {
  const view = getPaginationView({ page, totalPages, total });
  const btn = 'px-3 py-1 rounded border border-gray-300 text-sm bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <nav className={`flex items-center justify-between gap-3 text-sm text-gray-600 ${className}`} aria-label="페이지 이동">
      <span data-testid="pagination-summary">{view.summary}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={disabled || !view.canPrev} onClick={() => onPageChange(view.page - 1)} aria-label="이전 페이지">이전</button>
        <span data-testid="pagination-label" aria-live="polite">{view.label}</span>
        <button type="button" className={btn} disabled={disabled || !view.canNext} onClick={() => onPageChange(view.page + 1)} aria-label="다음 페이지">다음</button>
      </div>
    </nav>
  );
};
