// PR-111: 스타일번호 접두사로 브랜드를 추정한다. 규칙은 BrandPrefixRule 마스터
// (src/brand-prefix-rules/)에서 가져와 넘긴다 — 이 함수 자체는 규칙을 하드코딩하지
// 않고, "숫자로 시작하는 규칙 우선 확인 → 그 다음 접두사 일치" 순서만 담당한다.
export interface BrandPrefixRuleLike {
  prefix?: string | null;
  isNumericStart: boolean;
  brandName: string;
}

const NUMERIC_START = /^\d/;

// 일치하는 규칙이 없으면 null(미분류) — 새 브랜드가 언제든 나올 수 있어 에러로
// 취급하지 않는다.
export function classifyBrand(styleNo: string, rules: BrandPrefixRuleLike[]): string | null {
  if (!styleNo) return null;

  const numericRule = rules.find((r) => r.isNumericStart);
  if (numericRule && NUMERIC_START.test(styleNo)) {
    return numericRule.brandName;
  }

  const upperStyleNo = styleNo.toUpperCase();
  const prefixRule = rules.find(
    (r) => !r.isNumericStart && r.prefix && upperStyleNo.startsWith(r.prefix.toUpperCase()),
  );
  return prefixRule?.brandName ?? null;
}
