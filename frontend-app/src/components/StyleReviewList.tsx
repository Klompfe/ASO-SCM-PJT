import React from 'react';
import type { ParsedStyleResult } from '../api/mapping.service';

interface StyleReviewListProps {
  styles: ParsedStyleResult[];
  existsMap: Record<string, boolean>;
  onSelect: (style: ParsedStyleResult) => void;
}

export const StyleReviewList: React.FC<StyleReviewListProps> = ({ styles, existsMap, onSelect }) => {
  // 파싱 실패한 시트는 확인할 상세 데이터가 없으므로 목록 맨 아래로 보낸다.
  const sorted = [...styles].sort((a, b) => {
    if (!!a.parseError === !!b.parseError) return 0;
    return a.parseError ? 1 : -1;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
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
            return (
              <tr
                key={style.sheetName}
                className={hasError ? 'bg-red-50' : 'hover:bg-gray-50 cursor-pointer'}
                onClick={() => !hasError && onSelect(style)}
              >
                <td className="px-4 py-2 font-mono">{style.styleNo || style.sheetName}</td>
                <td className="px-4 py-2">{style.overview?.factory ?? '-'}</td>
                <td className="px-4 py-2">{style.overview?.totalQty ?? '-'}</td>
                <td className="px-4 py-2">{style.overview?.buyer ?? '-'}</td>
                <td className="px-4 py-2">{style.bomItems?.length ?? '-'}</td>
                <td className="px-4 py-2 space-x-1">
                  {hasError ? (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800" title={style.parseError}>
                      파싱 실패
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                      확인 대기
                    </span>
                  )}
                  {!hasError && alreadyExists && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      이미 등록됨
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
