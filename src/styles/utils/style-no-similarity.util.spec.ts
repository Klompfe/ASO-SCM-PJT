import { isSimilarStyleNoBySuffix, findSimilarStyleNos } from './style-no-similarity.util';

describe('isSimilarStyleNoBySuffix (PR-198) — 실제 사례 MB73SKM109 ↔ MB73SKM109Z', () => {
  it('끝 영문 1자만 더/덜 있으면 비슷하다', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109Z')).toBe(true);
    expect(isSimilarStyleNoBySuffix('MB73SKM109Z', 'MB73SKM109')).toBe(true);
  });

  it('끝 영문 2자까지는 비슷하다', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109ZX')).toBe(true);
  });

  it('끝 영문 3자 이상 차이나면 비슷하지 않다(다른 스타일일 가능성이 더 큼)', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM109ZXY')).toBe(false);
  });

  it('완전히 같으면 비슷하다고 하지 않는다(그건 동일 스타일)', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109Z', 'MB73SKM109Z')).toBe(false);
  });

  it('접미사가 숫자면 비슷하지 않다(컬러/옵션 구분은 영문이 관례)', () => {
    expect(isSimilarStyleNoBySuffix('MB73SKM109', 'MB73SKM1091')).toBe(false);
  });

  it('공통 접두사가 아니면(끝만 같고 앞이 다름) 비슷하지 않다', () => {
    expect(isSimilarStyleNoBySuffix('AB73SKM109', 'MB73SKM109Z')).toBe(false);
  });

  it('대소문자를 구분하지 않는다', () => {
    expect(isSimilarStyleNoBySuffix('mb73skm109', 'MB73SKM109Z')).toBe(true);
  });

  it('빈 문자열이면 비슷하지 않다', () => {
    expect(isSimilarStyleNoBySuffix('', 'MB73SKM109Z')).toBe(false);
  });
});

describe('findSimilarStyleNos (PR-198)', () => {
  it('후보 중 끝 글자만 다른 스타일을 원래 표기 그대로 돌려준다', () => {
    const result = findSimilarStyleNos('MB73SKM109', ['MB73SKM109Z', 'MB99OTHER', 'MB73SKM109ZX']);
    expect(result).toEqual(['MB73SKM109Z', 'MB73SKM109ZX']);
  });

  it('읽은 번호가 비어 있으면 빈 배열', () => {
    expect(findSimilarStyleNos('', ['MB73SKM109Z'])).toEqual([]);
  });

  it('비슷한 후보가 없으면 빈 배열', () => {
    expect(findSimilarStyleNos('MB73SKM109', ['MB99OTHER'])).toEqual([]);
  });
});
