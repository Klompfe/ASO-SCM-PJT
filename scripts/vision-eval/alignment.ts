import { levenshteinDistance } from './manifest.util';
import type { AiResultLike, EntryAlignmentStatus, ManifestEntry } from './types';

// PR-199b: PILOT-2에서 확인된 치명적 버그 수정 — 모드 A는 같은 PDF를 manifest 행마다
// 다시 호출하지 않고 **(PDF, 모델, 실행 회차)당 1회만** 호출한다. 이 모듈은 그 1번의
// 호출로 돌아온 배열(results)을 그 PDF에 속한 manifest 행들에 짝짓는다.

export interface AlignedPageResult {
  page: number;
  sheet: string;
  status: EntryAlignmentStatus;
  ai: AiResultLike | null;
}

// PR-199c(PILOT-3에서 확인): "배열 길이 === manifest 최대 page"로 비교하면 manifest에
// 일부 쪽만 들어있을 때(예: 6쪽짜리 PDF인데 manifest엔 3·4쪽만 있음) 길이가 달라
// 불필요하게 경고가 난다(실제로는 results[page-1]이 정확히 맞았음 — 오탐). 이제는
// 행 단위로 "그 쪽이 배열 범위 안에 있는지"만 보고, 아래 둘 중 하나일 때만 불일치로
// 본다: (a) 배열이 manifest가 요구하는 쪽수보다 짧다, (b) 호출의 usage.pageCount를
// 알 때 그 값과 배열 길이가 다르다(응답이 일부만 잘려 온 경우).
export function alignResultsToPages(
  entries: ManifestEntry[],
  results: AiResultLike[],
  goldenStyleNoBySheet: Map<string, string | null>,
  usagePageCount?: number,
): AlignedPageResult[] {
  const maxPage = Math.max(0, ...entries.map((e) => e.page));
  const lengthTooShort = results.length < maxPage;
  const usageMismatch = usagePageCount != null && results.length !== usagePageCount;

  if (!lengthTooShort && !usageMismatch) {
    return entries.map((e) => ({ page: e.page, sheet: e.sheet, status: 'OK', ai: results[e.page - 1] ?? null }));
  }

  // 길이가 안 맞음 — 편집거리로 대체 매칭을 시도한다(스타일번호가 있는 golden만 대상).
  const usedResultIdx = new Set<number>();
  return entries.map((e) => {
    const goldenStyleNo = goldenStyleNoBySheet.get(e.sheet);
    if (!goldenStyleNo) return { page: e.page, sheet: e.sheet, status: 'PAGE_COUNT_MISMATCH', ai: null };

    const candidates = results
      .map((r, idx) => ({ r, idx }))
      .filter(({ idx }) => !usedResultIdx.has(idx))
      .map(({ r, idx }) => ({ r, idx, d: levenshteinDistance((r.overview?.styleNo ?? '').toUpperCase(), goldenStyleNo.toUpperCase()) }));

    const minD = candidates.length > 0 ? Math.min(...candidates.map((c) => c.d)) : Infinity;
    const withMin = candidates.filter((c) => c.d === minD);
    if (minD > 2 || withMin.length !== 1) {
      return { page: e.page, sheet: e.sheet, status: 'PAGE_COUNT_MISMATCH', ai: null };
    }
    usedResultIdx.add(withMin[0].idx);
    return { page: e.page, sheet: e.sheet, status: 'ALIGNED_BY_STYLE', ai: withMin[0].r };
  });
}
