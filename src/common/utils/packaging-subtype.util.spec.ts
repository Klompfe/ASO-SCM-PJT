import { effectiveSubType, looksLikeThreadOrTape, buildThreadTapeSuggestion } from './packaging-subtype.util';

const rules = [
  { materialSubType: 'COA_SA', displayName: '코아사' },
  { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사' },
  { materialSubType: 'POLY_JINUIDO', displayName: '폴리지누이도' },
  { materialSubType: 'DADE', displayName: '다데' },
  { materialSubType: 'AMHOL', displayName: '암홀' },
];

// PR-186: effectiveSubType 우선순위(BOM 행 > Item), looksLikeThreadOrTape 경계(오탐 방지),
// buildThreadTapeSuggestion(정확히 1개 매칭일 때만 추천).
describe('effectiveSubType', () => {
  it('BOM 행에 threadType/tapeType이 있으면 Item보다 우선한다', () => {
    expect(effectiveSubType({ threadType: 'COA_SA' }, { materialSubType: 'OBA_SA_SKU_I_SA' })).toBe('COA_SA');
    expect(effectiveSubType({ tapeType: 'DADE' }, { materialSubType: 'AMHOL' })).toBe('DADE');
  });

  it('BOM 행에 없으면 Item 단위 지정을 쓴다', () => {
    expect(effectiveSubType({}, { materialSubType: 'COA_SA' })).toBe('COA_SA');
  });

  it('둘 다 없으면 null', () => {
    expect(effectiveSubType({}, null)).toBeNull();
    expect(effectiveSubType({}, undefined)).toBeNull();
    expect(effectiveSubType({}, {})).toBeNull();
  });
});

describe('looksLikeThreadOrTape', () => {
  it('규칙의 displayName(묶음 표기는 ·로 쪼갠 토큰도) 포함이면 실/테이프로 본다', () => {
    expect(looksLikeThreadOrTape('코아사 45S/2H', rules)).toBe(true);
    expect(looksLikeThreadOrTape('오바사', rules)).toBe(true); // "오바사·스쿠이사" 토큰 분리
    expect(looksLikeThreadOrTape('스쿠이사', rules)).toBe(true);
    expect(looksLikeThreadOrTape('다데 테이프', rules)).toBe(true);
  });

  it('THREAD/TAPE/테이프 키워드(대소문자 무시)를 포함하면 실/테이프로 본다', () => {
    expect(looksLikeThreadOrTape('배색 본봉사\n코아사\n45S/2H THREAD', rules)).toBe(true);
    expect(looksLikeThreadOrTape('엣지 TAPE', rules)).toBe(true);
    expect(looksLikeThreadOrTape('미어짐방지테이프', rules)).toBe(true);
  });

  it('단독 단어 "실"(괄호/공백/경계)은 실로 보지만, 단어 속의 "실"은 오탐으로 보지 않는다', () => {
    expect(looksLikeThreadOrTape('실', rules)).toBe(true);
    expect(looksLikeThreadOrTape('15D 실', rules)).toBe(true);
    expect(looksLikeThreadOrTape('(실)', rules)).toBe(true);
    expect(looksLikeThreadOrTape('확실한 품질', rules)).toBe(false);
    expect(looksLikeThreadOrTape('사실 확인', rules)).toBe(false);
    expect(looksLikeThreadOrTape('실크 안감', rules)).toBe(false); // "실크"는 독립된 원단명(토씨 결합) — 실이 아님
  });

  it('단독 "사"는 키워드가 아니라 사이즈/라벨류를 오탐하지 않는다', () => {
    expect(looksLikeThreadOrTape('사이즈 라벨', rules)).toBe(false);
    expect(looksLikeThreadOrTape('메인라벨', rules)).toBe(false);
    expect(looksLikeThreadOrTape('스티커', rules)).toBe(false);
  });

  it('빈 이름/null은 false', () => {
    expect(looksLikeThreadOrTape('', rules)).toBe(false);
    expect(looksLikeThreadOrTape(null, rules)).toBe(false);
    expect(looksLikeThreadOrTape(undefined, rules)).toBe(false);
  });
});

describe('buildThreadTapeSuggestion', () => {
  it('정확히 1개 규칙(또는 그 토큰)과 매칭되면 추천한다', () => {
    expect(buildThreadTapeSuggestion('코아사 45S/2H', rules)).toMatchObject({ materialSubType: 'COA_SA', displayName: '코아사' });
    expect(buildThreadTapeSuggestion('오바사', rules)).toMatchObject({ materialSubType: 'OBA_SA_SKU_I_SA' });
  });

  it('매칭이 0개면 추천하지 않는다', () => {
    expect(buildThreadTapeSuggestion('일반 원단', rules)).toBeNull();
  });

  it('매칭이 2개 이상이면(애매함) 추천하지 않는다', () => {
    expect(buildThreadTapeSuggestion('코아사 겸용 암홀 테이프', rules)).toBeNull();
  });

  it('빈 이름은 추천하지 않는다', () => {
    expect(buildThreadTapeSuggestion('', rules)).toBeNull();
    expect(buildThreadTapeSuggestion(null, rules)).toBeNull();
  });
});
