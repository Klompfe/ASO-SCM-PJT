import React from 'react';
import type { Item } from '../api/items.service';
import { PrintableReport } from './PrintableReport';
import {
  countByType,
  describeItemFilters,
  groupByType,
  itemCatalogColumns,
  sortForCatalog,
} from '../utils/itemCatalog';

interface ItemCatalogReportProps {
  items: Item[];
  filter: { type?: string; keyword?: string };
}

const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
const td = 'border border-gray-300 px-2 py-1 align-top';

// PR-117: 품목 마스터 카탈로그. 인쇄/엑셀은 화면 목록(페이지 10건)이 아니라 현재 검색조건에
// 맞는 "전체" 품목을 대상으로 하고, 구분(원자재/반제품/완제품)별 섹션으로 나눠 보여준다.
export const ItemCatalogReport: React.FC<ItemCatalogReportProps> = ({ items, filter }) => {
  const sorted = sortForCatalog(items);
  const sections = groupByType(items);
  const counts = countByType(items);

  return (
    <PrintableReport
      title="품목 마스터 카탈로그"
      subtitle={describeItemFilters(filter)}
      columns={itemCatalogColumns}
      rows={sorted}
      fileName="품목_카탈로그"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="catalog-summary">
        <div className="border border-gray-200 rounded-lg p-3 text-center bg-white">
          <p className="text-xs text-gray-500">전체</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{items.length}건</p>
        </div>
        {counts.map((c) => (
          <div key={c.type} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{c.count}건</p>
          </div>
        ))}
      </div>

      {sections.length === 0 && <p className="text-sm text-gray-500">조건에 맞는 품목이 없습니다.</p>}
      {sections.map((sec) => (
        <section key={sec.label} className="mb-5" data-testid={`catalog-section-${sec.type}`}>
          <h4 className="text-base font-semibold text-gray-800 mb-1 break-after-avoid">
            {sec.label} <span className="text-sm font-normal text-gray-500">({sec.items.length}건)</span>
          </h4>
          <table className="w-full text-sm border-collapse table-fixed">
            <thead>
              <tr>
                {[['품목코드', 'w-[18%]'], ['품목명', 'w-[24%]'], ['구분', 'w-[10%]'], ['규격', 'w-[18%]'], ['설명', 'w-[30%]']].map(([h, w]) => <th key={h} className={`${th} ${w}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sec.items.map((it) => (
                <tr key={it.id} className="break-inside-avoid">
                  <td className={`${td} font-mono`}>{it.code}</td>
                  <td className={td}>
                    {it.name}
                    {it.englishName && <span className="block text-xs text-gray-500">{it.englishName}</span>}
                  </td>
                  <td className={td}>{sec.label}</td>
                  <td className={td}>{it.spec || '-'}</td>
                  <td className={td}>{it.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </PrintableReport>
  );
};
