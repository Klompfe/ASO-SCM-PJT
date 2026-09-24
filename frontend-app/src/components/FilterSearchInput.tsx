import React from 'react';

// PR-139: 목록 화면의 "항목별 개별 검색" 입력란 — 라벨 + 텍스트 입력 + 조회(돋보기) 아이콘 버튼.
// SearchSelectField와 달리 팝업으로 하나를 골라 값을 채우는 게 아니라, 그 자체로 목록 필터 텍스트값이다.
// 버튼은 감싸는 <form>의 submit 버튼이라 클릭하든 다른 입력란에서 Enter를 치든 같은 조회 동작으로 이어진다.
interface FilterSearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export const FilterSearchInput: React.FC<FilterSearchInputProps> = ({ label, value, onChange, placeholder, ariaLabel, className = 'w-56' }) => (
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
        type="submit"
        className="border border-l-0 border-gray-300 rounded-r px-2 bg-gray-50 hover:bg-gray-100"
        aria-label={`${ariaLabel} 조회`}
        title="조회"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-600" aria-hidden="true">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
);
