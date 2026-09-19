import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedSearcher, type SearcherState } from './debouncedSearch';

describe('검색 선택 팝업의 조회 로직 (PR-126)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (search: (k: string) => Promise<string[]>, delay = 300) => {
    const states: SearcherState<string>[] = [];
    const searcher = createDebouncedSearcher<string>(search, (s) => states.push(s), delay);
    return { searcher, states, last: () => states[states.length - 1] };
  };

  it('디바운스: 빠르게 여러 글자를 쳐도 서버 호출은 마지막 검색어로 한 번만', async () => {
    const search = vi.fn().mockResolvedValue(['A']);
    const { searcher, last } = setup(search);
    searcher.setKeyword('a');
    vi.advanceTimersByTime(100);
    searcher.setKeyword('ab');
    vi.advanceTimersByTime(100);
    searcher.setKeyword('abc');
    vi.advanceTimersByTime(299);
    expect(search).not.toHaveBeenCalled(); // 아직 마지막 입력 후 300ms가 안 지났다
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('abc');
    expect(last()).toMatchObject({ keyword: 'abc', loading: false, error: null, results: ['A'] });
  });

  it('입력하는 순간부터 로딩 상태이고, 응답이 오면 결과와 함께 로딩이 끝난다', async () => {
    const { searcher, states } = setup(() => Promise.resolve(['X', 'Y']));
    searcher.setKeyword('x');
    expect(states[0]).toMatchObject({ keyword: 'x', loading: true, results: [] });
    await vi.runAllTimersAsync();
    expect(states[states.length - 1]).toMatchObject({ loading: false, results: ['X', 'Y'] });
  });

  it('searchNow(팝업 열 때)는 기다리지 않고 바로 조회하고, 검색어는 trim해서 보낸다', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { searcher } = setup(search);
    searcher.searchNow('');
    await Promise.resolve();
    expect(search).toHaveBeenCalledWith('');
    searcher.searchNow('  padded  ');
    await Promise.resolve();
    expect(search).toHaveBeenLastCalledWith('padded');
  });

  it('결과 없음: 빈 배열이 오면 로딩 종료 + 오류 없음(빈 결과 상태)', async () => {
    const { searcher, last } = setup(() => Promise.resolve([]));
    searcher.searchNow('zzz');
    await vi.runAllTimersAsync();
    expect(last()).toMatchObject({ loading: false, error: null, results: [] });
  });

  it('응답 순서 보호: 먼저 보낸 느린 요청이 나중에 도착해도 최신 검색어의 결과를 덮어쓰지 않는다', async () => {
    let resolveSlow: (v: string[]) => void = () => undefined;
    const search = vi.fn((k: string) => (k === 'slow' ? new Promise<string[]>((r) => { resolveSlow = r; }) : Promise.resolve(['fast-result'])));
    const { searcher, last } = setup(search);
    searcher.searchNow('slow');
    searcher.searchNow('fast');
    await vi.runAllTimersAsync();
    expect(last().results).toEqual(['fast-result']);
    resolveSlow(['STALE']); // 뒤늦게 도착
    await vi.runAllTimersAsync();
    expect(last().results).toEqual(['fast-result']);
  });

  it('오류: 검색이 실패하면 결과를 비우고 오류 문구를 남긴다', async () => {
    const { searcher, last } = setup(() => Promise.reject(new Error('서버 오류')));
    searcher.searchNow('x');
    await vi.runAllTimersAsync();
    expect(last()).toMatchObject({ loading: false, error: '서버 오류', results: [] });
  });

  it('dispose(팝업 닫힘): 예약된 조회는 취소되고, 이미 나간 요청의 응답도 무시된다', async () => {
    const search = vi.fn().mockResolvedValue(['late']);
    const { searcher, states } = setup(search);
    searcher.setKeyword('pending');
    searcher.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(search).not.toHaveBeenCalled();

    const inflight = setup(search);
    inflight.searcher.searchNow('go');
    const before = inflight.states.length;
    inflight.searcher.dispose();
    await vi.runAllTimersAsync();
    expect(inflight.states.length).toBe(before); // 응답이 상태를 바꾸지 않았다
    expect(states.every((s) => s.results.length === 0)).toBe(true);
  });
});
