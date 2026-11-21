import * as fs from 'fs';
import * as path from 'path';
import { COMPOSITION_FABRIC_ALIASES, COMPOSITION_OUTER_ALIASES, COMPOSITION_NON_FABRIC_WORDS, isCompositionFabricCategory, checkComposition } from './vision-guardrails.util';

// PR-254: 영문 구분 별칭의 원단류 판정(서버) + 서버·프런트 목록 일치.
describe('isCompositionFabricCategory (PR-254)', () => {
  it.each([
    ['겉감', true], ['OUT SHELL', true], ['out shell ', true], ['OUT-SHELL', true], ['겉감\r\nOUT-SHELL', true], ['겉감                  OUT-SHELL', true],
    ['SHELL', true], ['OUTER SHELL', true], ['안감', true], ['LINING', true], ['쉬 폰\r\nLINING', true], ['COMBINATION', true], ['배 색\r\nCOMBINATION', true], ['퀼팅안감', true],
    ['INTERLINING', false], ['심 지\r\nINTERLINING\r\n(M-100)', false], ['EDGE TAPE', false], ['PAD', false], ['단추', false], ['', false], [null, false], [undefined, false],
  ])('%j → %s', (category, expected) => {
    expect(isCompositionFabricCategory(category as string | null | undefined)).toBe(expected);
  });

  it('checkComposition: 영문 겉감 구분은 부자재 경고(COMPOSITION_ON_NON_FABRIC)가 나지 않고, 부자재는 난다', () => {
    expect(checkComposition('A 100%', 'OUT-SHELL').warnings).toEqual([]);
    expect(checkComposition('A 100%', 'LINING').warnings).toEqual([]);
    expect(checkComposition('A 100%', 'INTERLINING').warnings.map((w) => w.code)).toEqual(['COMPOSITION_ON_NON_FABRIC']);
    expect(checkComposition('A 100%', 'EDGE TAPE').warnings.map((w) => w.code)).toEqual(['COMPOSITION_ON_NON_FABRIC']);
  });

  it('프런트(compositionReview.ts)의 COMPOSITION_FABRIC_ALIASES 와 같은 목록이다', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../frontend-app/src/utils/compositionReview.ts'), 'utf8');
    const m = src.match(/COMPOSITION_FABRIC_ALIASES: readonly string\[\] = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const front = [...(m as RegExpMatchArray)[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    expect(front).toEqual([...COMPOSITION_FABRIC_ALIASES]);
  });

  // PR-255: 단어 경계 정확 일치 — 공백 1칸 표기 인식, 부분 일치 금지.
  it.each([
    ['겉감 OUT-SHELL', true], ['쉬폰 LINING', true], ['안감(스트라이프)', true], ['안 감', true],
    ['INTERLINING', false], ['심 지 INTERLINING (M-100)', false], ['배색 스쿠이사 45S/3H THREAD', false], ['SHELL BUTTON', false],
  ])('PR-255 단어 경계: %j → %s', (category, expected) => {
    expect(isCompositionFabricCategory(category)).toBe(expected);
  });

  const frontList = (name: string): string[] => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../frontend-app/src/utils/compositionReview.ts'), 'utf8');
    const m = src.match(new RegExp(name + String.raw`: readonly string\[\] = \[([^\]]*)\]`));
    expect(m).not.toBeNull();
    return [...(m as RegExpMatchArray)[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  };
  it('프런트의 겉감 별칭·비원단 단어 목록과 같다', () => {
    expect(frontList('COMPOSITION_OUTER_ALIASES')).toEqual([...COMPOSITION_OUTER_ALIASES]);
    expect(frontList('COMPOSITION_NON_FABRIC_WORDS')).toEqual([...COMPOSITION_NON_FABRIC_WORDS]);
  });
});
