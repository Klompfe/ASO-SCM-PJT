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

// 배열 길이가 그 PDF의 manifest 최대 page와 같으면 results[page-1]로 그대로 짝짓는다
// (= 1번 호출, 인덱스만 올바르게 사용 — PILOT-2가 지적한 버그의 직접적인 수정).
// 길이가 다르면 PAGE_COUNT_MISMATCH로 표시하고, 스타일번호 편집거리(≤2)가 유일 최소인
// 항목에만 ALIGNED_BY_STYLE로 대체 매칭한다(그 외는 짝짓지 않음 — 틀린 스타일로 채점하지
// 않기 위해, manifest 정확도와 같은 원칙).
export function alignResultsToPages(
  entries: ManifestEntry[],
  results: AiResultLike[],
  goldenStyleNoBySheet: Map<string, string | null>,
): AlignedPageResult[] {
  const maxPage = Math.max(0, ...entries.map((e) => e.page));

  if (results.length === maxPage) {
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
