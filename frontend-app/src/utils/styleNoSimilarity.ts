// PR-198: 작지 AI가 스타일번호 끝 영문 구분자(보통 1~2자, 예: ...109Z)를 놓치거나 더
// 읽는 경우를 알려 준다 — 백엔드 src/styles/utils/style-no-similarity.util.ts와 같은
// 규칙(프론트/백엔드가 별도 TS 프로젝트라 그대로 import할 수 없어 순수 함수만
// 미러링한다). 자동 변경은 하지 않는다 — 사람이 버튼을 눌러야 입력칸 값이 바뀐다.
export function isSimilarStyleNoBySuffix(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ua = a.trim().toUpperCase();
  const ub = b.trim().toUpperCase();
  if (ua === ub) return false;

  const shorter = ua.length <= ub.length ? ua : ub;
  const longer = ua.length <= ub.length ? ub : ua;
  const diff = longer.length - shorter.length;
  if (diff < 1 || diff > 2) return false;
  if (!longer.startsWith(shorter)) return false;

  const suffix = longer.slice(shorter.length);
  return /^[A-Z]{1,2}$/.test(suffix);
}

export function findSimilarStyleNos(readStyleNo: string, candidates: string[]): string[] {
  const read = (readStyleNo ?? '').trim();
  if (!read) return [];
  return candidates.filter((c) => isSimilarStyleNoBySuffix(read, c ?? ''));
}
