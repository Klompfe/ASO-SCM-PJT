import React from 'react';
import toast from 'react-hot-toast';
import { exportTableToExcel, type ExcelColumn } from '../utils/excelExport';

const COMPANY_NAME = '태일무역';

interface PrintableReportProps<T> {
  title: string;
  // 조회조건(예: "2026-09-01 ~ 2026-09-30", "거래처: 미도컴퍼니") — 있으면 인쇄본
  // 상단/화면 부제로 표시한다.
  subtitle?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  fileName: string;
  children: React.ReactNode;
}

// PR-110: 어느 보고서 화면이든 감싸서 "인쇄"/"엑셀 다운로드" 버튼을 공통으로 붙이는
// 래퍼. 인쇄는 PR-108이 도입한 index.css의 .print-target 규칙(body 전체를 숨기고
// 이 서브트리만 보이게 한 뒤 최상단으로 끌어올림)을 그대로 재사용한다 — 새 CSS
// 규칙을 추가하지 않고 통일감 있게 공용화했다.
export function PrintableReport<T>({ title, subtitle, columns, rows, fileName, children }: PrintableReportProps<T>) {
  const generatedAt = new Date().toLocaleString('ko-KR');

  const handlePrint = () => window.print();
  const handleExcel = () => {
    exportTableToExcel(columns, rows, fileName).catch(() => {
      toast.error('엑셀 다운로드에 실패했습니다.');
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="text-sm px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            인쇄
          </button>
          <button
            onClick={handleExcel}
            className="text-sm px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="print-target">
        {/* 화면에서는 숨기고 인쇄본에만 보이는 문서 헤더 — 회사명/보고서명/조회조건/생성일시. */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">{COMPANY_NAME}</h1>
          <h2 className="text-lg font-semibold mt-1">{title}</h2>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          <p className="text-xs text-gray-400 mt-1">생성일시: {generatedAt}</p>
          <hr className="my-3 border-gray-300" />
        </div>
        {children}
      </div>
    </div>
  );
}
