export interface PageResult<T> {
  items?: T[] | null;
  total?: number | string | null;
}

// 페이지네이션 API(page/limit + { items, total })를 끝까지 따라가 전량을 모은다. 총 건수(total)에
// 도달하거나 빈 페이지가 오면 멈추고, 서버가 total을 잘못 주는 경우에도 무한 반복하지 않도록
// maxPages(기본 1000)에서 끊는다. total은 첫 페이지가 알려준 값(없으면 모은 건수)을 돌려준다.
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageResult<T> | null | undefined>,
  maxPages = 1000,
): Promise<{ items: T[]; total: number }> {
  const all: T[] = [];
  let reportedTotal: number | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    const items = Array.isArray(res?.items) ? res!.items! : [];
    all.push(...items);
    if (reportedTotal === null) {
      const t = Number(res?.total);
      reportedTotal = Number.isFinite(t) ? t : null;
    }
    if (items.length === 0) break;
    if (reportedTotal !== null && all.length >= reportedTotal) break;
    if (reportedTotal === null) break; // total을 모르면 첫 페이지만 신뢰한다
  }

  return { items: all, total: reportedTotal ?? all.length };
}
