// PR-111: 스타일번호 접두사로 브랜드를 추정한다. 규칙은 BrandPrefixRule 마스터
// (src/brand-prefix-rules/)에서 가져와 넘긴다 — 이 함수 자체는 규칙을 하드코딩하지
// 않고, "숫자로 시작하는 규칙 우선 확인 → 그 다음 접두사 일치" 순서만 담당한다.
// PR-165: 숫자로 시작하는 브랜드가 둘 이상(에잇세컨즈/뮤트)일 수 있어, numericPattern이
// 있는(더 구체적인) 규칙을 먼저 검사하고, 거기 걸리지 않으면 numericPattern이 없는
// catch-all 숫자시작 규칙을 적용한다.
export interface BrandPrefixRuleLike {
  prefix?: string | null;
  isNumericStart: boolean;
  numericPattern?: string | null;
  brandName: string;
}

const NUMERIC_START = /^\d/;

// 일치하는 규칙이 없으면 null(미분류) — 새 브랜드가 언제든 나올 수 있어 에러로
// 취급하지 않는다.
export function classifyBrand(styleNo: string, rules: BrandPrefixRuleLike[]): string | null {
  if (!styleNo) return null;

  if (NUMERIC_START.test(styleNo)) {
    const specificNumericRules = rules.filter((r) => r.isNumericStart && r.numericPattern);
    for (const rule of specificNumericRules) {
      if (new RegExp(rule.numericPattern!).test(styleNo)) {
        return rule.brandName;
      }
    }

    const catchAllNumericRule = rules.find((r) => r.isNumericStart && !r.numericPattern);
    if (catchAllNumericRule) {
      return catchAllNumericRule.brandName;
    }
  }

  const upperStyleNo = styleNo.toUpperCase();
  const prefixRule = rules.find(
    (r) => !r.isNumericStart && r.prefix && upperStyleNo.startsWith(r.prefix.toUpperCase()),
  );
  return prefixRule?.brandName ?? null;
}
