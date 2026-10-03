import { isMidoBuyer } from './mido-buyer.util';

describe('isMidoBuyer (PR-168)', () => {
  it('바이어명에 "미도"가 포함되면 true다', () => {
    expect(isMidoBuyer('미도컴퍼니')).toBe(true);
    expect(isMidoBuyer('(주)미도')).toBe(true);
  });

  it('다른 바이어는 false다', () => {
    expect(isMidoBuyer('빈폴코리아')).toBe(false);
    expect(isMidoBuyer('W컨셉')).toBe(false);
  });

  it('null/빈 문자열은 false다(바이어 인식 자체가 안 된 경우)', () => {
    expect(isMidoBuyer(null)).toBe(false);
    expect(isMidoBuyer('')).toBe(false);
  });
});
