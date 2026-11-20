import { describe, it, expect } from 'vitest';
import { summarizeCompositions, formatCompositionSummary, isCompositionTargetCategory, cleanComposition, looksLikeAbbreviatedComposition } from './compositionReview';

// PR-246: 합성 값만 사용.
describe('compositionReview (PR-246)', () => {
  it('cleanComposition: 공백만/null은 null, 그 외는 trim만(대소문자 유지)', () => {
    expect(cleanComposition('  ')).toBeNull();
    expect(cleanComposition(null)).toBeNull();
    expect(cleanComposition(' Cotton 60% ')).toBe('Cotton 60%');
  });

  it('isCompositionTargetCategory: 원단류만 대상(부자재는 제외)', () => {
    expect(isCompositionTargetCategory('겉감')).toBe(true);
    expect(isCompositionTargetCategory('안감')).toBe(true);
    expect(isCompositionTargetCategory('단추')).toBe(false);
    expect(isCompositionTargetCategory(null)).toBe(false);
  });

  it('summarizeCompositions: 같은 값은 한 줄로 모아 행 수를 세고, 미기재는 원단류 행만 센다', () => {
    const s = summarizeCompositions([
      { category: '겉감', composition: 'COTTON 60% POLYESTER 40%' },
      { category: '겉감', composition: ' COTTON 60% POLYESTER 40% ' },
      { category: '안감', composition: 'POLYESTER 100%' },
      { category: '겉감', composition: null },
      { category: '단추', composition: '' }, // 부자재 미기재는 경고 대상 아님
    ]);
    expect(s.groups).toEqual([
      { value: 'COTTON 60% POLYESTER 40%', rowCount: 2 },
      { value: 'POLYESTER 100%', rowCount: 1 },
    ]);
    expect(s.missingRows).toBe(1);
    expect(formatCompositionSummary(s)).toBe('COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)');
  });

  it('다른 표기(대소문자 차이)는 합치지 않는다(정규화 없음)', () => {
    const s = summarizeCompositions([
      { category: '겉감', composition: 'COTTON 100%' },
      { category: '겉감', composition: 'Cotton 100%' },
    ]);
    expect(s.groups).toHaveLength(2);
  });

  it('제외 체크된 행은 요약·미기재 수에서 뺀다', () => {
    const s = summarizeCompositions(
      [
        { category: '겉감', composition: 'COTTON 100%' },
        { category: '겉감', composition: null },
      ],
      new Set([0, 1]),
    );
    expect(s.groups).toEqual([]);
    expect(s.missingRows).toBe(0);
  });

  it('값이 하나도 없으면 groups는 비고 문자열은 빈 문자열', () => {
    const s = summarizeCompositions([{ category: '겉감', composition: undefined }]);
    expect(s.groups).toEqual([]);
    expect(formatCompositionSummary(s)).toBe('');
    expect(s.missingRows).toBe(1);
  });
});

// PR-247: 약어형 안내 판정(안내만, 값 불변).
describe('looksLikeAbbreviatedComposition (PR-247)', () => {
  it.each(['R/N/SP=56/40/4', 'C/P=60/40', 'c/p=60/40', ' C/P 60/40 ', 'A=1'])('약어형 %p → true', (v) => {
    expect(looksLikeAbbreviatedComposition(v)).toBe(true);
  });

  it.each(['COTTON 60% POLYESTER 40%', 'C/P=60%/40%', 'POLYESTER 100%', '', '   ', null, undefined, 'COTTON', 'A/B', '면 폴리에스터'])('약어형 아님 %p → false', (v) => {
    expect(looksLikeAbbreviatedComposition(v as any)).toBe(false);
  });

  it('판정 함수는 값을 바꾸지 않는다(입력 문자열 그대로, 부작용 없음)', () => {
    const v = ' r/n/sp=56/40/4 ';
    looksLikeAbbreviatedComposition(v);
    expect(v).toBe(' r/n/sp=56/40/4 ');
  });
});
