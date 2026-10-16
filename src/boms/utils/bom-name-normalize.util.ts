// PR-198: 자재명세 엑셀을 기존 BOM과 비교할 때 "이름만 다르고 실제로는 같은 자재"일
// 가능성을 사람에게 제안(SIMILAR)하기 위한 느슨한 정규화 — 대소문자·공백·괄호·특수문자를
// 모두 제거해 핵심 글자만 남긴다. 자동 병합에는 쓰지 않는다(오탐 위험 — 사람이 직접
// 확인해 짝으로 묶을지 결정해야 한다). 기존 mapping-commit.service.ts의 (자재명 exact,
// colorCode/spec normalizeKeyPart) 매칭 키와는 별개의, 더 느슨한 "제안용" 비교다.
export function normalizeForFuzzyMatch(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[\s()[\]{}\-_./,·"'`]/g, '')
    .trim();
}

// 정규화한 두 이름이 같거나, 한쪽이 다른 쪽을 완전히 포함하면 "비슷한 자재"로 본다.
// 둘 다 정규화 결과가 빈 문자열이면(원래 이름이 공백/특수문자뿐) 비교 대상이 아니다.
export function isSimilarMaterialName(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeForFuzzyMatch(a);
  const nb = normalizeForFuzzyMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}
