import React, { useEffect, useRef, useState } from 'react';
import { createDebouncedSearcher, type SearcherState } from '../utils/debouncedSearch';

// PR-126: 입력란 옆 돋보기 → 검색 팝업 → 행 선택으로 값을 고르는 범용 컴포넌트. 특정 도메인에 묶이지 않는다(공급업체/품목/스타일
// 어디든 search 함수와 표시 방식만 넘기면 된다). 옵션을 미리 전부 불러오는 <select>와 달리 검색어마다 서버에 물어보므로
// 데이터가 100건, 몇천 건이어도 "최초 N건만 보이는" 문제가 없다.

interface ModalProps<T> {
  title: string;
  state: SearcherState<T>;
  getKey: (item: T) => string | number;
  renderRow: (item: T) => React.ReactNode;
  onKeywordChange: (keyword: string) => void;
  onPick: (item: T) => void;
  onClose: () => void;
  onClear?: () => void;
  placeholder?: string;
}

// 상태를 props로 받는 순수 표시 컴포넌트(검색 로직과 분리 — 로딩/결과없음/오류/행 클릭을 그대로 테스트할 수 있다).
export function SearchSelectModal<T>({ title, state, getKey, renderRow, onKeywordChange, onPick, onClose, onClear, placeholder }: ModalProps<T>) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="닫기">✕</button>
        </div>
        <input
          autoFocus
          className="w-full border border-gray-300 rounded px-3 py-2"
          placeholder={placeholder ?? '검색어를 입력하세요'}
          value={state.keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          aria-label="검색어"
        />
        <div className="max-h-80 overflow-y-auto border border-gray-100 rounded" data-testid="search-results">
          {state.loading && <p className="p-3 text-sm text-gray-500" data-testid="search-loading">검색 중...</p>}
          {!state.loading && state.error && <p className="p-3 text-sm text-red-600" data-testid="search-error">{state.error}</p>}
          {!state.loading && !state.error && state.results.length === 0 && (
            <p className="p-3 text-sm text-gray-500" data-testid="search-empty">검색 결과가 없습니다.</p>
          )}
          {!state.loading && !state.error && state.results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {state.results.map((item) => (
                <li key={getKey(item)}>
                  <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50" onClick={() => onPick(item)}>
                    {renderRow(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onClear && (
          <button type="button" className="text-sm text-gray-500 hover:underline" onClick={onClear}>선택 해제</button>
        )}
      </div>
    </div>
  );
}

interface FieldProps<T> {
  value: T | null;
  onChange: (item: T | null) => void;
  search: (keyword: string) => Promise<T[]>;
  getKey: (item: T) => string | number;
  // 입력란에 보이는 선택값 문자열
  getLabel: (item: T) => string;
  // 팝업 목록의 한 행 모양(기본은 getLabel)
  renderRow?: (item: T) => React.ReactNode;
  placeholder?: string;
  title?: string;
  ariaLabel: string;
  // true면 선택 해제(예: 목록 필터의 "전체")를 허용
  allowClear?: boolean;
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
}

export function SearchSelectField<T>({
  value, onChange, search, getKey, getLabel, renderRow, placeholder, title, ariaLabel, allowClear, debounceMs = 300, className = 'w-56', disabled,
}: FieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearcherState<T>>({ keyword: '', loading: false, error: null, results: [] });
  const searcherRef = useRef<ReturnType<typeof createDebouncedSearcher<T>> | null>(null);
  // search 함수가 렌더마다 새로 만들어져도 팝업을 여는 동안의 조회기는 유지되도록 ref로 최신 함수를 참조한다.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!open) return;
    const searcher = createDebouncedSearcher<T>((kw) => searchRef.current(kw), setState, debounceMs);
    searcherRef.current = searcher;
    searcher.searchNow('');
    return () => {
      searcher.dispose();
      searcherRef.current = null;
    };
  }, [open, debounceMs]);

  const close = () => setOpen(false);
  const pick = (item: T) => {
    onChange(item);
    close();
  };

  return (
    <>
      <div className={`flex items-stretch ${className}`}>
        <input
          readOnly
          disabled={disabled}
          className="flex-1 min-w-0 border border-gray-300 rounded-l px-3 py-2 bg-white cursor-pointer"
          placeholder={placeholder ?? '선택하세요'}
          value={value ? getLabel(value) : ''}
          onClick={() => !disabled && setOpen(true)}
          aria-label={ariaLabel}
        />
        {allowClear && value && (
          <button type="button" className="border-y border-gray-300 px-2 text-gray-400 hover:text-gray-700" onClick={() => onChange(null)} aria-label={`${ariaLabel} 선택 해제`}>✕</button>
        )}
        <button
          type="button"
          disabled={disabled}
          className="border border-l-0 border-gray-300 rounded-r px-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
          onClick={() => setOpen(true)}
          aria-label={`${ariaLabel} 검색`}
          title="검색"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-600" aria-hidden="true">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {open && (
        <SearchSelectModal<T>
          title={title ?? `${ariaLabel} 검색`}
          state={state}
          getKey={getKey}
          renderRow={renderRow ?? ((item) => getLabel(item))}
          onKeywordChange={(kw) => searcherRef.current?.setKeyword(kw)}
          onPick={pick}
          onClose={close}
          onClear={allowClear && value ? () => { onChange(null); close(); } : undefined}
        />
      )}
    </>
  );
}
