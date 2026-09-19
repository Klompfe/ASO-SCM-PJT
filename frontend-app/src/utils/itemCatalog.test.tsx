import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildWorkbook } from './excelExport';
import { countByType, describeItemFilters, groupByType, itemCatalogColumns, sortForCatalog } from './itemCatalog';
import { ItemCatalogReport } from '../components/ItemCatalogReport';
import type { Item } from '../api/items.service';

const mk = (id: number, code: string, type: string, extra: Partial<Item> = {}): Item => ({ id, code, name: `이름${code}`, type, ...extra });
const items: Item[] = [
  mk(1, 'F-002', 'FINISHED_GOOD', { styleNo: 'BF1', spec: '100%' }),
  mk(2, 'R-002', 'RAW_MATERIAL', { spec: '150D', description: '겉감' }),
  mk(3, 'S-001', 'SEMI_FINISHED'),
  mk(4, 'R-001', 'RAW_MATERIAL', { englishName: 'Fabric A' }),
  mk(5, 'X-001', 'WEIRD'),
];

describe('품목 마스터 카탈로그 (PR-117)', () => {
  it('정렬: 원자재 → 반제품 → 완제품 → 기타, 같은 구분 안에서는 코드순(원본 불변)', () => {
    expect(sortForCatalog(items).map((i) => i.code)).toEqual(['R-001', 'R-002', 'S-001', 'F-002', 'X-001']);
    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('구분별 섹션: 비어 있는 구분은 섹션이 없고 순서가 고정이다', () => {
    const secs = groupByType(items.filter((i) => i.type !== 'SEMI_FINISHED'));
    expect(secs.map((s) => [s.label, s.items.length])).toEqual([['원자재', 2], ['완제품', 1], ['기타', 1]]);
    expect(groupByType([])).toEqual([]);
  });

  it('구분별 건수: 세 구분은 0건이어도 항상 표시, 알 수 없는 구분은 기타로 추가', () => {
    expect(countByType(items).map((c) => [c.label, c.count])).toEqual([['원자재', 2], ['반제품', 1], ['완제품', 1], ['기타', 1]]);
    expect(countByType([]).map((c) => c.count)).toEqual([0, 0, 0]);
  });

  it('검색조건 설명은 값이 있는 것만 포함한다', () => {
    expect(describeItemFilters({})).toBeUndefined();
    expect(describeItemFilters({ type: 'RAW_MATERIAL', keyword: '원단' })).toBe('검색조건 — 구분: 원자재, 검색어: 원단');
  });

  it('엑셀은 카탈로그 정렬 순서로 화면 데이터와 일치한다(재파싱)', async () => {
    const wb = await buildWorkbook(itemCatalogColumns, sortForCatalog(items), '품목');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['품목'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['품목코드', '품목명', '영문명', '구분', '단위', '규격', '설명', '스타일번호']);
    expect(p[1]).toEqual(['R-001', '이름R-001', 'Fabric A', '원자재', '', '', '', '']);
    expect(p[2]).toEqual(['R-002', '이름R-002', '', '원자재', '', '150D', '겉감', '']);
    expect(p[4]).toEqual(['F-002', '이름F-002', '', '완제품', '', '100%', '', 'BF1']);
    expect(p).toHaveLength(6);
  });

  it('렌더링: 요약 카드, 구분별 섹션(원자재 먼저), 인쇄/엑셀 버튼', () => {
    const html = renderToStaticMarkup(createElement(ItemCatalogReport, { items, filter: { type: undefined, keyword: '이름' } }));
    expect(html).toContain('품목 마스터 카탈로그');
    expect(html).toContain('검색조건 — 검색어: 이름');
    expect(html).toContain('data-testid="catalog-section-RAW_MATERIAL"');
    expect(html).toContain('data-testid="catalog-section-FINISHED_GOOD"');
    expect(html.indexOf('catalog-section-RAW_MATERIAL')).toBeLessThan(html.indexOf('catalog-section-SEMI_FINISHED'));
    expect(html.indexOf('catalog-section-SEMI_FINISHED')).toBeLessThan(html.indexOf('catalog-section-FINISHED_GOOD'));
    expect(html).toContain('인쇄');
    expect(html).toContain('엑셀 다운로드');
    expect(html).toContain('Fabric A');
  });

  it('렌더링: 결과가 없으면 안내 문구', () => {
    const html = renderToStaticMarkup(createElement(ItemCatalogReport, { items: [], filter: {} }));
    expect(html).toContain('조건에 맞는 품목이 없습니다.');
    expect(html).not.toContain('catalog-section-');
  });
});
