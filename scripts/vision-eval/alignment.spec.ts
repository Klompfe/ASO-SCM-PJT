import { alignResultsToPages } from './alignment';
import type { AiResultLike, ManifestEntry } from './types';

const ai = (styleNo: string): AiResultLike => ({ overview: { styleNo }, bomItems: [] });

describe('alignResultsToPages (PR-199b) — 모드 A 1회 호출을 manifest 행에 짝짓기', () => {
  it('배열 길이가 manifest 최대 page와 같으면 results[page-1]로 그대로 짝짓는다(버그 수정 확인)', () => {
    const entries: ManifestEntry[] = [
      { pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' },
      { pdf: 'a.pdf', page: 2, sheet: 'STYLE-2' },
      { pdf: 'a.pdf', page: 3, sheet: 'STYLE-3' },
    ];
    const results = [ai('STYLE-1'), ai('STYLE-2'), ai('STYLE-3')];
    const result = alignResultsToPages(entries, results, new Map());
    expect(result).toEqual([
      { page: 1, sheet: 'STYLE-1', status: 'OK', ai: results[0] },
      { page: 2, sheet: 'STYLE-2', status: 'OK', ai: results[1] },
      { page: 3, sheet: 'STYLE-3', status: 'OK', ai: results[2] },
    ]);
  });

  it('배열 길이가 다르면 PAGE_COUNT_MISMATCH — golden 스타일번호가 없으면 대체 매칭도 안 한다', () => {
    const entries: ManifestEntry[] = [{ pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' }, { pdf: 'a.pdf', page: 2, sheet: 'STYLE-2' }];
    const results = [ai('STYLE-1')];
    const result = alignResultsToPages(entries, results, new Map());
    expect(result.every((r) => r.status === 'PAGE_COUNT_MISMATCH')).toBe(true);
  });

  it('길이가 안 맞아도 편집거리 ≤2·유일 최소면 ALIGNED_BY_STYLE로 대체 매칭한다', () => {
    const entries: ManifestEntry[] = [{ pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' }, { pdf: 'a.pdf', page: 2, sheet: 'STYLE-2' }, { pdf: 'a.pdf', page: 3, sheet: 'STYLE-3' }];
    const results = [ai('STYLE-2'), ai('STYLE-1')]; // 2개뿐(길이 불일치) — 뒤섞인 순서
    const golden = new Map([['STYLE-1', 'STYLE-1'], ['STYLE-2', 'STYLE-2'], ['STYLE-3', 'STYLE-3']]);
    const result = alignResultsToPages(entries, results, golden);
    expect(result.find((r) => r.sheet === 'STYLE-1')).toEqual({ page: 1, sheet: 'STYLE-1', status: 'ALIGNED_BY_STYLE', ai: results[1] });
    expect(result.find((r) => r.sheet === 'STYLE-2')).toEqual({ page: 2, sheet: 'STYLE-2', status: 'ALIGNED_BY_STYLE', ai: results[0] });
    expect(result.find((r) => r.sheet === 'STYLE-3')).toEqual({ page: 3, sheet: 'STYLE-3', status: 'PAGE_COUNT_MISMATCH', ai: null });
  });

  it('편집거리 동률이면(유일 최소 아님) 대체 매칭하지 않는다(틀린 스타일로 채점 금지)', () => {
    const entries: ManifestEntry[] = [{ pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' }];
    const results = [ai('STYLE-X'), ai('STYLE-Y')];
    const golden = new Map([['STYLE-1', 'STYLE-1']]);
    const result = alignResultsToPages(entries, results, golden);
    expect(result[0].status).toBe('PAGE_COUNT_MISMATCH');
  });

  it('results가 비어 있고 manifest도 1페이지뿐이면(둘 다 0) 길이 일치로 보고 그대로 진행', () => {
    const entries: ManifestEntry[] = [];
    const result = alignResultsToPages(entries, [], new Map());
    expect(result).toEqual([]);
  });
});
