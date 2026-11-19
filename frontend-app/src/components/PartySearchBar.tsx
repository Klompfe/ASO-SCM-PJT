import React from 'react';
import { DUPLICATE_NAME_MESSAGE, NO_RESULT_MESSAGE, formatResultCount, normalizeSearchText } from '../utils/partySearch';

// PR-245: 고객사·공급업체 목록 위 검색 입력칸 + 초기화 + 결과 건수. 입력하는 대로 좁혀진다.
export const PartySearchBar: React.FC<{
  query: string;
  onChange: (q: string) => void;
  total: number;
  shown: number;
  ariaLabel: string;
  placeholder?: string;
}> = ({ query, onChange, total, shown, ariaLabel, placeholder }) => (
  <div className="flex flex-wrap items-center gap-2">
    <input
      type="search"
      className="border border-gray-300 rounded px-3 py-2 w-72"
      aria-label={ariaLabel}
      placeholder={placeholder ?? '이름·코드·담당자·연락처 등으로 검색'}
      value={query}
      onChange={(e) => onChange(e.target.value)}
    />
    <button
      type="button"
      className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      disabled={query === ''}
      onClick={() => onChange('')}
    >
      초기화
    </button>
    <span className="text-sm text-gray-600" data-testid="party-result-count">{formatResultCount(total, shown, query)}</span>
  </div>
);

// 검색 결과가 0건일 때(전체가 0건이면 해당 없음) 표 대신/아래에 보이는 안내 + 초기화.
export const PartyNoResult: React.FC<{ query: string; total: number; shown: number; onReset: () => void }> = ({ query, total, shown, onReset }) => {
  if (!normalizeSearchText(query) || total === 0 || shown > 0) return null;
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700" data-testid="party-no-result">
      {NO_RESULT_MESSAGE}
      <button type="button" className="ml-3 text-blue-600 underline" onClick={onReset}>초기화</button>
    </div>
  );
};

// 등록 폼의 이름 아래 작은 안내(저장은 막지 않는다).
export const DuplicateNameHint: React.FC<{ show: boolean }> = ({ show }) =>
  show ? <p className="text-xs text-amber-700 mt-1" data-testid="duplicate-name-hint">{DUPLICATE_NAME_MESSAGE}</p> : null;
