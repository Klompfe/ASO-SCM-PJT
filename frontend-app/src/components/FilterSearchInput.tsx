import React from 'react';

// PR-139: 목록 화면의 "항목별 개별 검색" 입력란 — 라벨 + 텍스트 입력 + 조회(돋보기) 아이콘 버튼.
// SearchSelectField와 달리 팝업으로 하나를 골라 값을 채우는 게 아니라, 그 자체로 목록 필터 텍스트값이다.
//
// PR-159: 돋보기 버튼은 더 이상 폼 전체의 submit이 아니다 — 이 필드 값만으로 즉시 조회하는
// type="button"으로 바뀌었다(다른 칸에 남아있는 값 때문에 스타일번호만 정확히 알아도 0건이
// 나오던 혼란을 없애기 위함). 감싸는 폼의 "검색" 버튼(별도, type="submit")이 지금까지의
// "채워진 조건 전부 AND" 동작을 대신한다 — 그 버튼과 Enter 키 제출은 그대로 폼 submit으로 간다.
interface FilterSearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  // 이 필드 값만으로(다른 필드는 무시하고) 즉시 조회를 실행하는 콜백.
  onSearchThisField: () => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export const FilterSearchInput: React.FC<FilterSearchInputProps> = ({ label, value, onChange, onSearchThisField, placeholder, ariaLabel, className = 'w-56' }) => (
  <div className="flex flex-col">
    <label className="text-sm text-gray-600 mb-1">{label}</label>
    <div className={`flex items-stretch ${className}`}>
      <input
        aria-label={ariaLabel}
        className="flex-1 min-w-0 border border-gray-300 rounded-l px-3 py-2"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onSearchThisField}
        className="border border-l-0 border-gray-300 rounded-r px-2 bg-gray-50 hover:bg-gray-100"
        aria-label={`${ariaLabel} 조회`}
        title="이 항목만으로 조회"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-600" aria-hidden="true">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
);
