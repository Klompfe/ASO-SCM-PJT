import { levenshteinDistance, proposeManifestEntries, parseManifestCsv, toManifestCsv, proposalsToManifestCsv } from './manifest.util';

describe('levenshteinDistance (PR-199)', () => {
  it('같으면 0', () => {
    expect(levenshteinDistance('MB73SKM109Z', 'MB73SKM109Z')).toBe(0);
  });
  it('끝 글자 1개 차이면 1', () => {
    expect(levenshteinDistance('MB73SKM109', 'MB73SKM109Z')).toBe(1);
  });
});

describe('proposeManifestEntries (PR-199)', () => {
  it('편집거리 1 이내이고 유일하면 제안한다', () => {
    const result = proposeManifestEntries(
      [{ pdf: 'a.pdf', page: 1, readStyleNo: 'MB73SKM109' }],
      ['MB73SKM109Z', 'MB99OTHER'],
    );
    expect(result).toEqual([{ pdf: 'a.pdf', page: 1, sheet: 'MB73SKM109Z', distance: 1, status: 'PROPOSED' }]);
  });

  it('동률이면 제안하지 않고 "수동 필요"로 표시한다', () => {
    const result = proposeManifestEntries(
      [{ pdf: 'a.pdf', page: 1, readStyleNo: 'MB73SKM109' }],
      ['MB73SKM109Z', 'MB73SKM109X'],
    );
    expect(result[0].status).toBe('MANUAL_NEEDED');
    expect(result[0].sheet).toBeNull();
  });

  it('편집거리가 2를 넘으면 제안하지 않는다', () => {
    const result = proposeManifestEntries(
      [{ pdf: 'a.pdf', page: 1, readStyleNo: 'MB73SKM109' }],
      ['COMPLETELY-DIFFERENT'],
    );
    expect(result[0].status).toBe('MANUAL_NEEDED');
  });

  it('AI가 스타일번호를 못 읽었으면(null) "수동 필요"', () => {
    const result = proposeManifestEntries([{ pdf: 'a.pdf', page: 1, readStyleNo: null }], ['MB73SKM109Z']);
    expect(result[0].status).toBe('MANUAL_NEEDED');
  });
});

describe('manifest CSV 왕복 변환 (PR-199)', () => {
  it('toManifestCsv로 만든 CSV를 parseManifestCsv로 다시 읽으면 같은 내용이다', () => {
    const entries = [{ pdf: 'a.pdf', page: 1, sheet: 'MB73SKM109Z' }, { pdf: 'a.pdf', page: 2, sheet: 'MB74BLM107Z' }];
    expect(parseManifestCsv(toManifestCsv(entries))).toEqual(entries);
  });

  it('proposalsToManifestCsv는 상태 열을 포함한다', () => {
    const csv = proposalsToManifestCsv([{ pdf: 'a.pdf', page: 1, sheet: 'MB73SKM109Z', distance: 1, status: 'PROPOSED' }]);
    expect(csv).toContain('PROPOSED');
    expect(csv).toContain('pdf,page,sheet,distance,status');
  });
});
