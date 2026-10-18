import { buildSummaryData, renderSummaryMarkdown, type ScoredEntry } from './scoring-pipeline';
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
});
