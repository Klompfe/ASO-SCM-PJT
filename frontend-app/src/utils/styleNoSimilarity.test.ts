import { describe, it, expect } from 'vitest';
import { isSimilarStyleNoBySuffix, findSimilarStyleNos } from './styleNoSimilarity';

describe('isSimilarStyleNoBySuffix (PR-198) — 실제 사례 MB73SKM109 ↔ MB73SKM109Z', () => {
  it('끝 영문 1~2자만 차이나면 비슷하다', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109Z')).toBe(true);
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109ZX')).toBe(true);
  });

  it('완전히 같으면 비슷하다고 하지 않는다', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109Z', 'MB73SKM109Z')).toBe(false);
  });

  it('끝 글자가 3자 이상 차이나거나 숫자면 비슷하지 않다', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109ZXY')).toBe(false);
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM1091')).toBe(false);
  });
});

describe('findSimilarStyleNos (PR-198) — 자동 변경 없이 후보만 제시', () => {
  it('후보 중 비슷한 것만 원래 표기로 돌려준다', () => {
    expect(findSimilarStyleNos('MB73SKM109', ['MB73SKM109Z', 'MB99OTHER'])).toEqual(['MB73SKM109Z']);
  });

  it('읽은 번호가 비어 있으면 빈 배열(경고 없음)', () => {
    expect(findSimilarStyleNos('', ['MB73SKM109Z'])).toEqual([]);
  });
});
