import React from 'react';
import type { HsCodeClassification } from '../api/hsCodeClassifications.service';
import { PrintableReport } from './PrintableReport';
import { describeHsFilters, hsCodeReportColumns, sortForReport, styleCountOf } from '../utils/hsCodeReport';

interface Props {
  items: HsCodeClassification[];
  total: number;
  filters: Record<string, string>;
}

// PR-113: HS코드 매핑 현황 보고서 — 공통 PrintableReport(PR-110)로 감싼 조회 전용 표.
export const HsCodeMappingReport: React.FC<Props> = ({ items, total, filters }) => {
  const rows = sortForReport(items);
  const unlinked = rows.filter((r) => styleCountOf(r) === 0).length;
  const truncated = total > items.length ? ` · 전체 ${total}건 중 ${items.length}건 표시` : '';
  const subtitle = [describeHsFilters(filters), `미연결 ${unlinked}건 / 조회 ${rows.length}건${truncated}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <PrintableReport title="HS코드 매핑 현황" subtitle={subtitle} columns={hsCodeReportColumns} rows={rows} fileName="HS코드_매핑_현황">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-gray-300 bg-gray-100">
            <th className="p-2">품종</th>
            <th className="p-2">재직</th>
            <th className="p-2">혼용률</th>
            <th className="p-2">HS코드</th>
            <th className="p-2">관,부가세 유무</th>
            <th className="p-2 text-right">연결 스타일 수</th>
            <th className="p-2">연결 스타일번호</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const n = styleCountOf(r);
            return (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="p-2">{r.itemType}</td>
                <td className="p-2">{r.fabricType}</td>
                <td className="p-2">{r.composition}</td>
                <td className="p-2 font-mono">{r.hsCode}</td>
                <td className="p-2 text-gray-500">{r.note ?? '-'}</td>
                <td className="p-2 text-right">
                  {n === 0 ? (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">연결 스타일 0개</span>
                  ) : (
                    n
                  )}
                </td>
                <td className="p-2 text-gray-500">{n > 0 ? r.styleNos!.join(', ') : '-'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-gray-400">등록된 HS코드 분류가 없습니다.</td></tr>
          )}
        </tbody>
      </table>
    </PrintableReport>
  );
};
