export interface SearcherState<T> {
  keyword: string;
  loading: boolean;
  error: string | null;
  results: T[];
}

export interface DebouncedSearcher {
  // 타이핑 중 호출: 마지막 입력 후 delayMs가 지나야 서버에 묻는다(그 사이 입력이 이어지면 앞선 예약은 취소).
  setKeyword: (keyword: string) => void;
  // 팝업을 열 때처럼 기다리지 않고 바로 조회.
  searchNow: (keyword?: string) => void;
  // 팝업을 닫을 때: 예약된 조회를 취소하고, 아직 도착하지 않은 응답은 무시한다.
  dispose: () => void;
}

// PR-126: 검색 선택 팝업의 조회 로직(React 밖의 순수 로직이라 타이머/응답 순서를 그대로 테스트할 수 있다).
// - 디바운스: 빠르게 여러 글자를 치면 서버 호출은 마지막 한 번만.
// - 응답 순서 보호: 먼저 보낸 느린 요청이 나중에 도착해도 최신 검색어의 결과를 덮어쓰지 않는다.
export function createDebouncedSearcher<T>(
  search: (keyword: string) => Promise<T[]>,
  onState: (state: SearcherState<T>) => void,
  delayMs = 300,
): DebouncedSearcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let state: SearcherState<T> = { keyword: '', loading: false, error: null, results: [] };

  const emit = (patch: Partial<SearcherState<T>>) => {
    state = { ...state, ...patch };
    onState(state);
  };
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = async (keyword: string) => {
    const mine = ++seq;
    try {
      const results = await search(keyword.trim());
      if (mine !== seq) return; // 더 최근 검색이 있어 이 응답은 버린다
      emit({ results: Array.isArray(results) ? results : [], loading: false, error: null });
    } catch (err: any) {
      if (mine !== seq) return;
      emit({ results: [], loading: false, error: err?.message ?? '검색에 실패했습니다.' });
    }
  };

  return {
    setKeyword(keyword) {
      clearTimer();
      emit({ keyword, loading: true, error: null });
      timer = setTimeout(() => {
        timer = null;
        void run(keyword);
      }, delayMs);
    },
    searchNow(keyword = '') {
      clearTimer();
      emit({ keyword, loading: true, error: null });
      void run(keyword);
    },
    dispose() {
      clearTimer();
      seq += 1;
    },
  };
}
