// PR-198: 작지 AI가 스타일번호 끝의 영문 구분자(보통 컬러/옵션 구분 1~2자, 예: ...109Z)를
// 놓치거나 더 읽는 경우가 실무에서 확인됐다 — 읽은 번호와 "끝 영문 1~2자만 다른" 기존
// 스타일이 있으면 알려 준다. 자동으로 바꾸지 않는다(오탐 위험 — 진짜 새 스타일일 수도 있다).
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

// 읽은 스타일번호와 "끝 영문 1~2자" 차이만 있는 기존 스타일번호를 후보 목록에서 찾는다
// (원래 대소문자 표기를 그대로 돌려준다 — 화면에 표시/적용할 값이므로).
export function findSimilarStyleNos(readStyleNo: string, candidates: string[]): string[] {
  const read = (readStyleNo ?? '').trim();
  if (!read) return [];
  return candidates.filter((c) => isSimilarStyleNoBySuffix(read, c ?? ''));
}
