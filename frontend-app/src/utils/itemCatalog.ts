import type { Item } from '../api/items.service';
import type { ExcelColumn } from './excelExport';

// 백엔드 ItemType enum과 동일한 값. 카탈로그 섹션은 항상 이 순서로 나온다.
export const ITEM_TYPE_ORDER = ['RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD'] as const;
export const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: '원자재',
  SEMI_FINISHED: '반제품',
  FINISHED_GOOD: '완제품',
};
export const OTHER_TYPE_LABEL = '기타';

export const typeLabelOf = (type: string): string => ITEM_TYPE_LABELS[type] ?? OTHER_TYPE_LABEL;

const rank = (type: string): number => {
  const i = (ITEM_TYPE_ORDER as readonly string[]).indexOf(type);
  return i >= 0 ? i : ITEM_TYPE_ORDER.length;
};

// 구분 순서 → 품목코드 순으로 정렬한 새 배열(원본은 건드리지 않는다). 화면 섹션, 인쇄, 엑셀이
// 전부 이 순서를 쓰므로 세 곳의 행 순서가 항상 같다.
export const sortForCatalog = (items: Item[]): Item[] =>
  [...items].sort((a, b) => rank(a.type) - rank(b.type) || a.code.localeCompare(b.code));

export interface CatalogSection { type: string; label: string; items: Item[] }

// 비어 있는 구분은 섹션을 만들지 않는다(요약에서는 0건으로 보인다).
export const groupByType = (items: Item[]): CatalogSection[] => {
  const sections: CatalogSection[] = [];
  for (const it of sortForCatalog(items)) {
    const label = typeLabelOf(it.type);
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.items.push(it);
    else sections.push({ type: it.type, label, items: [it] });
  }
  return sections;
};

export const countByType = (items: Item[]): { type: string; label: string; count: number }[] => {
  const rows = ITEM_TYPE_ORDER.map((type) => ({ type: type as string, label: ITEM_TYPE_LABELS[type], count: items.filter((i) => i.type === type).length }));
  const other = items.filter((i) => !(ITEM_TYPE_ORDER as readonly string[]).includes(i.type)).length;
  return other > 0 ? [...rows, { type: 'OTHER', label: OTHER_TYPE_LABEL, count: other }] : rows;
};

export const itemCatalogColumns: ExcelColumn<Item>[] = [
  { header: '품목코드', accessor: (i) => i.code },
  { header: '품목명', accessor: (i) => i.name },
  { header: '영문명', accessor: (i) => i.englishName ?? '' },
  { header: '구분', accessor: (i) => typeLabelOf(i.type) },
  { header: '단위', accessor: (i) => i.unit ?? '' },
  { header: '규격', accessor: (i) => i.spec ?? '' },
  { header: '설명', accessor: (i) => i.description ?? '' },
  { header: '스타일번호', accessor: (i) => i.styleNo ?? '' },
];

export const describeItemFilters = (f: { type?: string; keyword?: string }): string | undefined => {
  const parts: string[] = [];
  if (f.type) parts.push(`구분: ${typeLabelOf(f.type)}`);
  if (f.keyword) parts.push(`검색어: ${f.keyword}`);
  return parts.length ? `검색조건 — ${parts.join(', ')}` : undefined;
};
