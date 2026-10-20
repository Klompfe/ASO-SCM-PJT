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
    const entries: ManifestEntry[] = [
      { pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' },
      { pdf: 'a.pdf', page: 3, sheet: 'STYLE-3' },
    ];
    // 길이 2 < manifest 최대 page(3) — 불일치로 간주돼 대체 매칭을 시도한다.
    const results = [ai('STYLE-X'), ai('STYLE-Y')];
    const golden = new Map([['STYLE-1', 'STYLE-1'], ['STYLE-3', 'STYLE-3']]);
    const result = alignResultsToPages(entries, results, golden);
    expect(result.find((r) => r.sheet === 'STYLE-1')?.status).toBe('PAGE_COUNT_MISMATCH');
  });

  it('results가 비어 있고 manifest도 1페이지뿐이면(둘 다 0) 길이 일치로 보고 그대로 진행', () => {
    const entries: ManifestEntry[] = [];
    const result = alignResultsToPages(entries, [], new Map());
    expect(result).toEqual([]);
  });

  it('PR-199c(PILOT-3 6Y 사례): manifest에 일부 쪽만 있어도(배열이 더 길어도) 경고 없이 results[page-1]을 그대로 쓴다', () => {
    const entries: ManifestEntry[] = [
      { pdf: 'a.pdf', page: 3, sheet: 'STYLE-3' },
      { pdf: 'a.pdf', page: 4, sheet: 'STYLE-4' },
    ];
    // 실제 PDF는 6쪽이라 배열 길이가 6 — manifest 최대 page(4)보다 길어도 불일치가 아니다.
    const results = [ai('P1'), ai('P2'), ai('STYLE-3'), ai('STYLE-4'), ai('P5'), ai('P6')];
    const result = alignResultsToPages(entries, results, new Map());
    expect(result).toEqual([
      { page: 3, sheet: 'STYLE-3', status: 'OK', ai: results[2] },
      { page: 4, sheet: 'STYLE-4', status: 'OK', ai: results[3] },
    ]);
  });

  it('배열이 manifest 최대 page보다 짧으면(모자람) 불일치로 본다(대체 매칭 시도)', () => {
    const entries: ManifestEntry[] = [
      { pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' },
      { pdf: 'a.pdf', page: 4, sheet: 'STYLE-4' },
    ];
    const results = [ai('STYLE-1'), ai('STYLE-4')]; // 길이 2 < 최대 page(4)
    const golden = new Map([['STYLE-1', 'STYLE-1'], ['STYLE-4', 'STYLE-4']]);
    const result = alignResultsToPages(entries, results, golden);
    expect(result.every((r) => r.status === 'ALIGNED_BY_STYLE')).toBe(true);
  });

  it('배열 길이가 manifest 최대 page와 같아도 usage.pageCount와 다르면(응답이 일부만 잘림) 불일치로 본다', () => {
    const entries: ManifestEntry[] = [
      { pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' },
      { pdf: 'a.pdf', page: 2, sheet: 'STYLE-2' },
    ];
    const results = [ai('STYLE-1'), ai('STYLE-2')]; // 길이는 2(=최대 page)로 맞음
    const golden = new Map([['STYLE-1', 'STYLE-1'], ['STYLE-2', 'STYLE-2']]);
    // 그런데 호출 쪽 usage.pageCount는 5라고 함 — 응답이 일부만 온 것으로 보고 경고.
    const result = alignResultsToPages(entries, results, golden, 5);
    expect(result.every((r) => r.status === 'ALIGNED_BY_STYLE')).toBe(true);
  });

  it('배열 길이가 usage.pageCount와도 같으면(정상) 경고 없이 그대로 쓴다', () => {
    const entries: ManifestEntry[] = [{ pdf: 'a.pdf', page: 1, sheet: 'STYLE-1' }];
    const results = [ai('STYLE-1')];
    const result = alignResultsToPages(entries, results, new Map(), 1);
    expect(result).toEqual([{ page: 1, sheet: 'STYLE-1', status: 'OK', ai: results[0] }]);
  });
});
