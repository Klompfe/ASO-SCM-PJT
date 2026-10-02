import { classifyBrand, type BrandPrefixRuleLike } from './brand-classifier.util';

// PR-111: 실제 확인된 규칙표 그대로 테스트한다(하드코딩 규칙이 아니라 함수에 넘기는
// 입력 데이터일 뿐 — DB 시드 데이터와 반드시 동일해야 하는 건 아니지만 실사례를 그대로 씀).
// PR-165: MK/KM을 "둘 다 킴마틴"으로 잘못 추정했던 것을 마뗑킴(MK)/킴마틴(KM)으로
// 분리하고, 숫자시작 브랜드가 에잇세컨즈 하나뿐이라고 가정했던 것을 깨고 뮤트(MUTE)를
// numericPattern('^\\d{2}[FS]')으로 구분해 추가했다. 에잇세컨즈 샘플도 PR-111 당시
// 실사례 없이 지어냈던 '26SOT14'/'26STP05'(뮤트 패턴과 겹침) 대신, 실제
// 26FW_통합_SALES_CONTRACT 파일 분석으로 검증된 샘플로 교체했다.
const RULES: BrandPrefixRuleLike[] = [
  { prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
  { prefix: null, isNumericStart: true, numericPattern: null, brandName: '에잇세컨즈' },
  { prefix: null, isNumericStart: true, numericPattern: '^\\d{2}[FS]', brandName: '뮤트' },
  { prefix: 'MB', isNumericStart: false, brandName: '미센스' },
  { prefix: 'LB', isNumericStart: false, brandName: '루미에반' },
  { prefix: 'VB', isNumericStart: false, brandName: '반에크' },
  { prefix: 'PT', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'DR', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'SK', isNumericStart: false, brandName: 'W컨셉' },
  { prefix: 'MK', isNumericStart: false, brandName: '마뗑킴' },
  { prefix: 'KM', isNumericStart: false, brandName: '킴마틴' },
];

describe('classifyBrand', () => {
  it.each([
    ['BF6821C13', '빈폴'],
    ['BF6827C51', '빈폴'],
    ['356911CM1', '에잇세컨즈'],
    ['356X11WC1', '에잇세컨즈'], // 4번째 글자가 X(숫자 대신 월 표기)
    ['356971WM3', '에잇세컨즈'],
    ['26FOT08', '뮤트'], // 3번째 글자가 바로 F(시즌) — 에잇세컨즈 패턴과 구분되는 지점
    ['MB6YHMP104Z', '미센스'],
    ['LB69SLM102Z', '루미에반'],
    ['VB69SLM103Z', '반에크'],
    ['DR0G6D02', 'W컨셉'],
    ['DR0H6D01', 'W컨셉'],
    ['SK0H3D01', 'W컨셉'],
    ['PT0A1B02', 'W컨셉'],
    ['MK1234', '마뗑킴'],
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
    expect(classifyBrand('356911CM1', rulesWithoutNumeric)).toBeNull();
    expect(classifyBrand('BF6821C13', rulesWithoutNumeric)).toBe('빈폴');
  });

  it('numericPattern이 있는 규칙(뮤트)만 있고 매칭되지 않으면 catch-all 없이는 null이다', () => {
    const onlyMute = RULES.filter((r) => r.brandName === '뮤트');
    expect(classifyBrand('356911CM1', onlyMute)).toBeNull(); // 에잇세컨즈 패턴, 뮤트 패턴과 불일치
    expect(classifyBrand('26FOT08', onlyMute)).toBe('뮤트');
  });

  it('규칙이 비어 있으면 항상 null을 반환한다', () => {
    expect(classifyBrand('BF6821C13', [])).toBeNull();
  });
});
