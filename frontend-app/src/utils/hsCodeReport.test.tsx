import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildWorkbook } from './excelExport';
import { describeHsFilters, hsCodeReportColumns, sortForReport, styleCountOf } from './hsCodeReport';
import { HsCodeMappingReport } from '../components/HsCodeMappingReport';
import type { HsCodeClassification } from '../api/hsCodeClassifications.service';

const mk = (id: number, itemType: string, hsCode: string, styleNos?: string[], note: string | null = null): HsCodeClassification => ({
  id, itemType, fabricType: '직물', composition: `C${id}`, hsCode, note, createdAt: '', updatedAt: '', styleNos,
});
const items = [mk(1, "WOMEN'S PANTS", '6204.63', ['BF1', 'BF2']), mk(2, "WOMEN'S DRESS", '6204.44', []), mk(3, "WOMEN'S COAT", '6202.20', undefined, '관세 0%')];

describe('HS코드 매핑 현황 보고서 (PR-113)', () => {
  it('연결 스타일이 없는(빈 배열/undefined) 항목이 맨 위로 정렬되고 원본은 변하지 않는다', () => {
    const sorted = sortForReport(items);
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]); // 미연결 2건(COAT<DRESS 알파벳순) 다음 연결된 것
    expect(items.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(styleCountOf(items[2])).toBe(0);
  });

  it('검색조건 설명은 값이 있는 것만 포함한다', () => {
    expect(describeHsFilters({ itemType: '', styleNo: 'BF1' })).toBe('검색조건 — 스타일번호: BF1');
    expect(describeHsFilters({ itemType: '' })).toBeUndefined();
  });

  it('엑셀 워크북은 화면 데이터와 일치한다(재파싱 비교)', async () => {
    const rows = sortForReport(items);
    const wb = await buildWorkbook(hsCodeReportColumns, rows, 'HS');
    const parsed = XLSX.utils.sheet_to_json(wb.Sheets['HS'], { header: 1 }) as any[][];
    expect(parsed[0]).toEqual(['품종', '재직', '혼용률', 'HS코드', '관,부가세 유무', '연결 스타일 수', '연결 스타일번호']);
    expect(parsed[1]).toEqual(["WOMEN'S COAT", '직물', 'C3', '6202.20', '관세 0%', 0, '']);
    expect(parsed[3]).toEqual(["WOMEN'S PANTS", '직물', 'C1', '6204.63', '', 2, 'BF1, BF2']);
  });

  it('화면 렌더링: 연결 0개 뱃지, 인쇄/엑셀 버튼, 조건·미연결 요약이 표시된다', () => {
    const html = renderToStaticMarkup(createElement(HsCodeMappingReport, { items, total: 3, filters: { styleNo: 'BF' } }));
    expect(html).toContain('HS코드 매핑 현황');
    expect(html.match(/연결 스타일 0개/g)).toHaveLength(2);
    expect(html).toContain('인쇄');
    expect(html).toContain('엑셀 다운로드');
    expect(html).toContain('검색조건 — 스타일번호: BF');
    expect(html).toContain('미연결 2건 / 조회 3건');
    expect(html).toContain('BF1, BF2');
  });

  it('total이 표시 건수보다 크면 일부만 표시됨을 알린다', () => {
    const html = renderToStaticMarkup(createElement(HsCodeMappingReport, { items, total: 250, filters: {} }));
    expect(html).toContain('전체 250건 중 3건 표시');
  });
});
