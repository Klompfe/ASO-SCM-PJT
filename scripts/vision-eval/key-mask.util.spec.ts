import { maskSecret, maskPath } from './key-mask.util';

describe('maskSecret (PR-199)', () => {
  it('키가 없으면 "(미설정)"', () => {
    expect(maskSecret(undefined)).toBe('(미설정)');
    expect(maskSecret(null)).toBe('(미설정)');
    expect(maskSecret('')).toBe('(미설정)');
  });

  it('짧은 키(8자 이하)는 전부 마스킹', () => {
    expect(maskSecret('abcd1234')).toBe('********');
  });

  it('긴 키는 앞 4자·뒤 4자만 보이고 가운데는 마스킹', () => {
    const result = maskSecret('AIzaSy1234567890ABCDEFGH');
    expect(result.startsWith('AIza')).toBe(true);
    expect(result.endsWith('EFGH')).toBe(true);
    expect(result).not.toContain('1234567890ABCD');
  });
});

describe('maskPath (PR-199)', () => {
  it('전체 경로가 아니라 파일명만 남긴다', () => {
    expect(maskPath('C:\\Users\\me\\Documents\\작지\\MB73SKM109Z.pdf')).toBe('MB73SKM109Z.pdf');
    expect(maskPath('/home/me/docs/style.pdf')).toBe('style.pdf');
  });
});
