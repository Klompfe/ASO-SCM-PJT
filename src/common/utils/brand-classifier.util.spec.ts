import { classifyBrand, type BrandPrefixRuleLike } from './brand-classifier.util';

// PR-111: 실제 확인된 규칙표 그대로 테스트한다(하드코딩 규칙이 아니라 함수에 넘기는
// 입력 데이터일 뿐 — DB 시드 데이터와 반드시 동일해야 하는 건 아니지만 실사례를 그대로 씀).
const RULES: BrandPrefixRuleLike[] = [
  { prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
  { prefix: null, isNumericStart: true, brandName: '에잇세컨즈' },
  { prefix: 'MB', isNumericStart: false, brandName: '미센스' },
  { prefix: 'LB', isNumericStart: false, brandName: '루미에반' },
  { prefix: 'VB', isNumericStart: false, brandName: '반에크' },
  { prefix: 'PT', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'DR', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'SK', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'MK', isNumericStart: false, brandName: '킴마틴' },
  { prefix: 'KM', isNumericStart: false, brandName: '킴마틴' },
];

describe('classifyBrand', () => {
  it.each([
    ['BF6821C13', '빈폴'],
    ['BF6827C51', '빈폴'],
    ['26SOT14', '에잇세컨즈'],
    ['26STP05', '에잇세컨즈'],
    ['MB6YHMP104Z', '미센스'],
    ['LB69SLM102Z', '루미에반'],
    ['VB69SLM103Z', '반에크'],
    ['DR0G6D02', 'W컨셉'],
    ['DR0H6D01', 'W컨셉'],
    ['SK0H3D01', 'W컨셉'],
    ['PT0A1B02', 'W컨셉'],
    ['MK1234', '킴마틴'],
    ['KM5678', '킴마틴'],
  ])('%s → %s', (styleNo, expected) => {
    expect(classifyBrand(styleNo, RULES)).toBe(expected);
  });

  it('대소문자가 섞여 있어도 접두사를 인식한다', () => {
    expect(classifyBrand('bf6821c13', RULES)).toBe('빈폴');
    expect(classifyBrand('Mb6YHMP104Z', RULES)).toBe('미센스');
  });

  it('등록되지 않은 접두사는 null(미분류)을 반환한다 — 에러가 아니다', () => {
    expect(classifyBrand('XX1234567', RULES)).toBeNull();
  });

  it('빈 문자열이면 null을 반환한다', () => {
    expect(classifyBrand('', RULES)).toBeNull();
  });

  it('숫자시작 규칙이 없어도 접두사 규칙만으로 정상 동작한다', () => {
    const rulesWithoutNumeric = RULES.filter((r) => !r.isNumericStart);
    expect(classifyBrand('26SOT14', rulesWithoutNumeric)).toBeNull();
    expect(classifyBrand('BF6821C13', rulesWithoutNumeric)).toBe('빈폴');
  });

  it('규칙이 비어 있으면 항상 null을 반환한다', () => {
    expect(classifyBrand('BF6821C13', [])).toBeNull();
  });
});
