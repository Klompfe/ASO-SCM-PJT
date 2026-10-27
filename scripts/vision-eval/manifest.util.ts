import type { ManifestEntry } from './types';

// 표준 편집거리(Levenshtein) — 외부 의존 추가하지 않고 직접 구현.
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[n];
}

export interface ManifestProposalCandidate {
  pdf: string;
  page: number;
  // AI가 그 페이지에서 읽은 스타일번호(빠른 1회 호출 또는 이전 결과) — 없으면 수동 필요.
  readStyleNo: string | null;
}

export interface ManifestProposalResult {
  pdf: string;
  page: number;
  sheet: string | null;
  distance: number | null;
  status: 'PROPOSED' | 'MANUAL_NEEDED';
}

// PR-199: --propose-manifest — AI가 읽은 스타일번호와 정답 엑셀 시트명의 편집거리가
// 2 이하이고 그 최소 거리를 가진 시트가 유일할 때만 "제안"한다. 동률이거나 2를
// 넘으면 자동으로 짝짓지 않고 "수동 필요"로 남긴다(틀린 스타일로 채점하면 안 되므로
// — 스타일번호 정확도 자체는 반드시 사람이 확인한 manifest로만 계산한다).
export function proposeManifestEntries(
  candidates: ManifestProposalCandidate[],
  sheetNames: string[],
): ManifestProposalResult[] {
  return candidates.map((c) => {
    if (!c.readStyleNo || sheetNames.length === 0) {
      return { pdf: c.pdf, page: c.page, sheet: null, distance: null, status: 'MANUAL_NEEDED' };
    }
    const read = c.readStyleNo.toUpperCase();
    const distances = sheetNames.map((sheet) => ({ sheet, d: levenshteinDistance(read, sheet.toUpperCase()) }));
    const minD = Math.min(...distances.map((x) => x.d));
    const withMin = distances.filter((x) => x.d === minD);
    if (minD > 2 || withMin.length !== 1) {
      return { pdf: c.pdf, page: c.page, sheet: null, distance: minD, status: 'MANUAL_NEEDED' };
    }
    return { pdf: c.pdf, page: c.page, sheet: withMin[0].sheet, distance: minD, status: 'PROPOSED' };
  });
}

// manifest.csv 읽기/쓰기(pdf,page,sheet 3열, 헤더 포함) — 순수 문자열 변환만.
export function parseManifestCsv(csv: string): ManifestEntry[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [header, ...rows] = lines;
  if (!header) return [];
  return rows.map((line) => {
    const [pdf, page, sheet] = line.split(',');
    return { pdf: pdf?.trim() ?? '', page: Number(page), sheet: sheet?.trim() ?? '' };
  });
}

export function toManifestCsv(entries: ManifestEntry[]): string {
  const header = 'pdf,page,sheet';
  const rows = entries.map((e) => `${e.pdf},${e.page},${e.sheet}`);
  return [header, ...rows].join('\n');
}

export function proposalsToManifestCsv(proposals: ManifestProposalResult[]): string {
  const header = 'pdf,page,sheet,distance,status';
  const rows = proposals.map((p) => `${p.pdf},${p.page},${p.sheet ?? ''},${p.distance ?? ''},${p.status}`);
  return [header, ...rows].join('\n');
}
