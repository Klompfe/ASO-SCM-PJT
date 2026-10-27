// PR-199: API 키/경로가 콘솔·리포트에 그대로 노출되지 않게 마스킹한다.
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '(미설정)';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`;
}

// 전체 경로를 로그에 남기지 않는다 — 파일명만.
export function maskPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}
