import { normalizeForFuzzyMatch, isSimilarMaterialName } from './bom-name-normalize.util';

describe('normalizeForFuzzyMatch (PR-198)', () => {
  it('대소문자·공백·괄호·하이픈을 제거한다', () => {
    expect(normalizeForFuzzyMatch('DARK GREY DG (원단A)')).toBe('darkgreydg원단a');
    expect(normalizeForFuzzyMatch('원단A-10256')).toBe('원단a10256');
  });

  it('null/undefined/빈 문자열은 빈 문자열', () => {
    expect(normalizeForFuzzyMatch(null)).toBe('');
    expect(normalizeForFuzzyMatch(undefined)).toBe('');
    expect(normalizeForFuzzyMatch('')).toBe('');
  });

  // PR-204: 꺾쇠(<>)도 다른 괄호류와 동일하게 제거한다(PILOT-9/10에서 확인된 실사례
  // "암홀<실크>"/"다데<실크>" — 같은 자재의 다른 표기를 비슷하다고 판단하지 못하던 문제).
  it('꺾쇠도 다른 괄호류와 동일하게 제거한다', () => {
    expect(normalizeForFuzzyMatch('암홀<실크>')).toBe(normalizeForFuzzyMatch('암홀(실크)'));
  });
});

describe('isSimilarMaterialName (PR-198) — 이름만 다른 중복 제안용 느슨한 비교', () => {
  it('정규화 결과가 완전히 같으면 비슷하다', () => {
    expect(isSimilarMaterialName('노방 다시', '노방다시')).toBe(true);
  });

  it('완전히 포함 관계인 두 이름은 비슷하다(익명 재현 사례 — AI가 읽은 짧은 이름이 엑셀의 색상설명 포함 긴 이름 안에 들어있음)', () => {
    expect(isSimilarMaterialName('원단A', 'DARK GREY DG (원단A)')).toBe(true);
    expect(isSimilarMaterialName('DARK GREY DG (원단A)', '원단A')).toBe(true);
  });

  it('포함 관계도 아니고 다른 이름이면 비슷하지 않다', () => {
    expect(isSimilarMaterialName('원단A', '전혀다른자재명')).toBe(false);
  });

  it('둘 중 하나가 정규화 결과 빈 문자열이면 비슷하지 않다', () => {
    expect(isSimilarMaterialName('   ', '원단A')).toBe(false);
    expect(isSimilarMaterialName(null, '원단A')).toBe(false);
  });
});
