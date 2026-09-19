import type { HsCodeClassification } from '../api/hsCodeClassifications.service';
import type { ExcelColumn } from './excelExport';

export const styleCountOf = (item: HsCodeClassification): number => item.styleNos?.length ?? 0;

// PR-113: 스타일 연결이 없는(미사용) 조합을 맨 위로 올려 한눈에 보이게 하고, 나머지는
// 품종/재직/혼용률 순으로 정렬한다(원본 배열은 건드리지 않는다).
export const sortForReport = (items: HsCodeClassification[]): HsCodeClassification[] =>
  [...items].sort((a, b) => {
    const unlinkedA = styleCountOf(a) === 0 ? 0 : 1;
    const unlinkedB = styleCountOf(b) === 0 ? 0 : 1;
    if (unlinkedA !== unlinkedB) return unlinkedA - unlinkedB;
    return (
      a.itemType.localeCompare(b.itemType) ||
      a.fabricType.localeCompare(b.fabricType) ||
      a.composition.localeCompare(b.composition)
    );
  });

export const hsCodeReportColumns: ExcelColumn<HsCodeClassification>[] = [
  { header: '품종', accessor: (r) => r.itemType },
  { header: '재직', accessor: (r) => r.fabricType },
  { header: '혼용률', accessor: (r) => r.composition },
  { header: 'HS코드', accessor: (r) => r.hsCode },
  { header: '관,부가세 유무', accessor: (r) => r.note ?? '' },
  { header: '연결 스타일 수', accessor: (r) => styleCountOf(r) },
  { header: '연결 스타일번호', accessor: (r) => (r.styleNos ?? []).join(', ') },
];

export const describeHsFilters = (f: Record<string, string>): string | undefined => {
  const labels: Record<string, string> = {
    itemType: '품종', fabricType: '재직', composition: '혼용률', hsCode: 'HS코드', styleNo: '스타일번호',
  };
  const parts = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${labels[k] ?? k}: ${v}`);
  return parts.length ? `검색조건 — ${parts.join(', ')}` : undefined;
};
