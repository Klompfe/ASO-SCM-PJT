import { buildSummaryData, renderSummaryMarkdown, validatePageRowTotals, type ScoredEntry, type PageRow } from './scoring-pipeline';
import type { GoldenStyle } from './types';

const goldenStyle = (overrides: Partial<GoldenStyle>): GoldenStyle => ({
  sheetName: 'FAKE-1',
  styleNo: 'FAKE-1',
  documentDate: null,
  targetRdd: null,
  colors: [],
  totalQty: 0,
  bomItems: [{ itemName: '가짜자재', consumption: 10, unit: 'YD', isLabelZone: false }],
  ...overrides,
});

const entry = (overrides: Partial<ScoredEntry>): ScoredEntry => ({
  mode: 'A', model: 'fake-model', pdf: 'a.pdf', page: 1, sheet: 'FAKE-1', run: 1,
  status: 'OK', ai: { overview: { styleNo: 'FAKE-1' }, bomItems: [{ itemName: '가짜자재', consumption: 10 }] },
  ...overrides,
});

describe('buildSummaryData (PR-199b)', () => {
  it('정상 매칭이면 OK 1건, 스타일번호 EXACT 1건을 센다', () => {
    const data = buildSummaryData([entry({})], [goldenStyle({})]);
    expect(data.bomCounts.OK).toBe(1);
    expect(data.styleNoCounts.EXACT).toBe(1);
  });

  it('SHEET_NOT_FOUND 행은 집계에서 빠지고 목록에만 남는다', () => {
    const data = buildSummaryData([entry({ sheet: 'NO-SUCH-SHEET', status: 'SHEET_NOT_FOUND', ai: null })], [goldenStyle({})]);
    expect(data.sheetNotFound).toEqual([{ pdf: 'a.pdf', page: 1, sheet: 'NO-SUCH-SHEET' }]);
    expect(Object.values(data.bomCounts).every((v) => v === 0)).toBe(true);
  });

  it('같은 (pdf,page,sheet)가 여러 run에서 반복돼도 목록에는 한 번만 남는다', () => {
    const data = buildSummaryData(
      [
        entry({ sheet: 'NO-SUCH-SHEET', status: 'SHEET_NOT_FOUND', ai: null, run: 1 }),
        entry({ sheet: 'NO-SUCH-SHEET', status: 'SHEET_NOT_FOUND', ai: null, run: 2 }),
      ],
      [goldenStyle({})],
    );
    expect(data.sheetNotFound).toHaveLength(1);
  });

  it('PAGE_COUNT_MISMATCH 행은 채점 불가로 제외하되 정렬 문제 목록에 남는다', () => {
    const data = buildSummaryData([entry({ status: 'PAGE_COUNT_MISMATCH', ai: null })], [goldenStyle({})]);
    expect(data.alignmentIssues).toEqual([{ mode: 'A', model: 'fake-model', pdf: 'a.pdf', page: 1, sheet: 'FAKE-1', status: 'PAGE_COUNT_MISMATCH' }]);
    expect(Object.values(data.bomCounts).every((v) => v === 0)).toBe(true);
  });

  it('ALIGNED_BY_STYLE 행은 정렬 문제 목록에 남지만 AI 값이 있으면 채점은 그대로 한다', () => {
    const data = buildSummaryData([entry({ status: 'ALIGNED_BY_STYLE' })], [goldenStyle({})]);
    expect(data.alignmentIssues).toHaveLength(1);
    expect(data.bomCounts.OK).toBe(1);
  });

  it('모드별 호출 수를 센다', () => {
    const data = buildSummaryData([entry({ mode: 'A' }), entry({ mode: 'A' }), entry({ mode: 'C', model: 'fake-model' })], [goldenStyle({})]);
    expect(data.callCountByModeModel).toEqual(
      expect.arrayContaining([{ mode: 'A', model: 'fake-model', count: 2 }, { mode: 'C', model: 'fake-model', count: 1 }]),
    );
  });

  it('반복 실행 간 styleNo가 바뀌면 불안정 필드로 잡힌다(가짜 데이터)', () => {
    const data = buildSummaryData(
      [
        entry({ run: 1, ai: { overview: { styleNo: 'FAKE-1' }, bomItems: [] } }),
        entry({ run: 2, ai: { overview: { styleNo: 'FAKE-9' }, bomItems: [] } }),
      ],
      [goldenStyle({})],
    );
    expect(data.unstableFields).toHaveLength(1);
    expect(data.unstableFields[0].distinctValueCount).toBe(2);
  });

  it('끝 글자 혼동이 있으면 혼동표에 집계된다', () => {
    const data = buildSummaryData(
      [entry({ ai: { overview: { styleNo: 'FAKE1' }, bomItems: [] } })],
      [goldenStyle({ styleNo: 'FAKEZ' })],
    );
    expect(data.confusionTable).toEqual([{ golden: 'Z', read: '1', count: 1 }]);
  });

  it('PR-199c: 정답 셀 메모는 gtStyleNoteCount/List에 남고 EXACT 분류는 그대로다', () => {
    const data = buildSummaryData([entry({})], [goldenStyle({ styleNo: 'FAKE-1 (끝자리 확인요망)' })]);
    expect(data.styleNoCounts.EXACT).toBe(1);
    expect(data.gtStyleNoteCount).toBe(1);
    expect(data.gtStyleNoteList[0]).toContain('(끝자리 확인요망)');
  });

  it('PR-199c: 값 기반 보조 짝짓기 — MISSING/EXTRA가 수량으로 짝지어지면 NAME_DIFF_PAIRED_BY_VALUE로 세고 MISSING/EXTRA에서는 뺀다', () => {
    const data = buildSummaryData(
      [entry({ ai: { overview: { styleNo: 'FAKE-1' }, bomItems: [{ itemName: '전혀다른이름', consumption: 10 }] } })],
      [goldenStyle({})],
    );
    expect(data.bomCounts.NAME_DIFF_PAIRED_BY_VALUE).toBe(1);
    expect(data.bomCounts.MISSING).toBe(0);
    expect(data.bomCounts.EXTRA_OTHER).toBe(0);
    expect(data.valuePairedCount).toBe(1);
    expect(data.valuePairedExamples).toEqual([{ golden: '가짜자재', ai: '전혀다른이름' }]);
  });

  it('PR-199c: 암묵 자재 목록과 매칭되는 MISSING은 MISSING_IMPLICIT으로 분리된다', () => {
    const data = buildSummaryData(
      [entry({ ai: { overview: { styleNo: 'FAKE-1' }, bomItems: [] } })],
      [goldenStyle({ bomItems: [{ itemName: '가짜케어라벨', consumption: 1, unit: null, isLabelZone: false }] })],
      ['가짜케어라벨'],
    );
    expect(data.bomCounts.MISSING_IMPLICIT).toBe(1);
    expect(data.bomCounts.MISSING).toBe(0);
    expect(data.implicitItemNames).toEqual(['가짜케어라벨']);
  });

  it('PR-199c: PDF·쪽별 표를 만들고 합계가 전체 bomCounts와 일치해 경고가 없다', () => {
    const data = buildSummaryData([entry({})], [goldenStyle({})]);
    expect(data.pageRows).toEqual([
      expect.objectContaining({ pdf: 'a.pdf', page: 1, sheet: 'FAKE-1', goldenRowCount: 1, aiRowCount: 1 }),
    ]);
    expect(data.pageRows[0].counts.OK).toBe(1);
    expect(data.pageRowTotalWarnings).toEqual([]);
  });
});

describe('renderSummaryMarkdown (PR-199b)', () => {
  it('정렬 문제·시트없음·불안정 섹션은 해당 데이터가 있을 때만 나온다', () => {
    const emptyData = buildSummaryData([entry({})], [goldenStyle({})]);
    const md = renderSummaryMarkdown(emptyData);
    expect(md).not.toContain('정렬 신뢰도 문제');
    expect(md).not.toContain('정답 시트 없음');
    expect(md).not.toContain('불안정 필드');
  });

  it('FACE_SPLIT_BY_COLOR 건수를 요약에 표시한다', () => {
    const data = buildSummaryData([entry({})], [goldenStyle({})]);
    data.faceSplitCount = 3;
    expect(renderSummaryMarkdown(data)).toContain('FACE_SPLIT_BY_COLOR로 합쳐진 건수: 3');
  });

  it('PR-199c: PDF·쪽별 표가 요약에 나온다', () => {
    const data = buildSummaryData([entry({})], [goldenStyle({})]);
    const md = renderSummaryMarkdown(data);
    expect(md).toContain('## PDF·쪽별 자재명세 표');
    expect(md).toContain('| a.pdf | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |');
  });

});

describe('validatePageRowTotals (PR-199c) — 페이지별 표 합계와 전체 합계 일치 검증', () => {
  const fakeRow = (overrides: Partial<PageRow['counts']>): PageRow => ({
    pdf: 'a.pdf', page: 1, sheet: 'FAKE-1', goldenRowCount: 1, aiRowCount: 1,
    counts: { OK: 0, VALUE_DIFF: 0, VALUE_MISSING: 0, NAME_DIFF: 0, NAME_ABBREV: 0, NAME_DIFF_PAIRED_BY_VALUE: 0, EXTRA: 0, MISSING: 0, MISSING_IMPLICIT: 0, ...overrides },
  });

  it('합계가 맞으면 경고가 없다', () => {
    const warnings = validatePageRowTotals([fakeRow({ OK: 1 })], { OK: 1 });
    expect(warnings).toEqual([]);
  });

  it('합계가 안 맞으면 경고를 하나 남긴다', () => {
    const warnings = validatePageRowTotals([fakeRow({ OK: 1 })], { OK: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('OK');
  });

  it('EXTRA_OTHER+EXTRA_DUPLICATE 합을 EXTRA 칸과 비교한다', () => {
    const warnings = validatePageRowTotals([fakeRow({ EXTRA: 3 })], { EXTRA_OTHER: 2, EXTRA_DUPLICATE: 1 });
    expect(warnings).toEqual([]);
  });
});
