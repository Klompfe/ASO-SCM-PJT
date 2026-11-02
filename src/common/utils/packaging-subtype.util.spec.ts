import { effectiveSubType, looksLikeThreadOrTape, buildThreadTapeSuggestion, materialSubTypeLabel, suggestThreadTapeByKeyword } from './packaging-subtype.util';

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

// PR-194: 다품번 일괄발주 화면에서 품목군 아래 종류 한 줄을 보여줄 때 쓰는 코드→라벨 변환.
describe('materialSubTypeLabel', () => {
  it('규칙에 있는 코드는 displayName으로 바꾼다', () => {
    expect(materialSubTypeLabel('COA_SA', rules)).toBe('코아사');
    expect(materialSubTypeLabel('DADE', rules)).toBe('다데');
  });

  it('규칙에 없는 코드는(데이터 누락) 추측하지 않고 코드 자체를 그대로 돌려준다', () => {
    expect(materialSubTypeLabel('UNKNOWN_CODE', rules)).toBe('UNKNOWN_CODE');
  });

  it('null/undefined는 null이다', () => {
    expect(materialSubTypeLabel(null, rules)).toBeNull();
    expect(materialSubTypeLabel(undefined, rules)).toBeNull();
  });
});

// PR-219: [B] 발주 폼의 "실/테이프 종류 추천(전문가 관점 키워드)" — buildThreadTapeSuggestion
// (displayName 토큰 직접 일치)보다 넓은 동의어 키워드. 번수로는 추측하지 않는다.
describe('suggestThreadTapeByKeyword (PR-219)', () => {
  it('오바/오버로크/배색사/배색 실 → 오바사', () => {
    expect(suggestThreadTapeByKeyword('오바사 60S/3', rules)?.materialSubType).toBe('OBA_SA_SKU_I_SA');
    expect(suggestThreadTapeByKeyword('오버로크 실 40S', rules)?.materialSubType).toBe('OBA_SA_SKU_I_SA');
    expect(suggestThreadTapeByKeyword('배색사 30S', rules)?.materialSubType).toBe('OBA_SA_SKU_I_SA');
    expect(suggestThreadTapeByKeyword('배색 실 20S', rules)?.materialSubType).toBe('OBA_SA_SKU_I_SA');
  });

  it('본봉/스티치/QQ → 코아사', () => {
    expect(suggestThreadTapeByKeyword('본봉사 60S/3', rules)?.materialSubType).toBe('COA_SA');
    expect(suggestThreadTapeByKeyword('스티치 실', rules)?.materialSubType).toBe('COA_SA');
    expect(suggestThreadTapeByKeyword('QQ 40수', rules)?.materialSubType).toBe('COA_SA');
    expect(suggestThreadTapeByKeyword('qq 40수(소문자)', rules)?.materialSubType).toBe('COA_SA');
  });

  it('지누이도(폴리지누이도 포함) → 폴리지누이도', () => {
    expect(suggestThreadTapeByKeyword('지누이도사', rules)?.materialSubType).toBe('POLY_JINUIDO');
    expect(suggestThreadTapeByKeyword('폴리지누이도 500m', rules)?.materialSubType).toBe('POLY_JINUIDO');
  });

  it('다데/암홀 → 기존 테이프 규칙(displayName) 그대로', () => {
    expect(suggestThreadTapeByKeyword('다데 테이프', rules)?.materialSubType).toBe('DADE');
    expect(suggestThreadTapeByKeyword('암홀 테이프', rules)?.materialSubType).toBe('AMHOL');
  });

  it('충돌(본봉/스티치/QQ + 배색 계열): 코아사를 추천하되 확인 필요 표시', () => {
    const r = suggestThreadTapeByKeyword('본봉사(배색)', rules);
    expect(r?.materialSubType).toBe('COA_SA');
    expect(r?.conflict).toBe(true);
    expect(r?.conflictReason).toContain('배색');

    const r2 = suggestThreadTapeByKeyword('본봉 오버로크 겸용사', rules);
    expect(r2?.materialSubType).toBe('COA_SA');
    expect(r2?.conflict).toBe(true);
  });

  it('키워드가 하나도 없으면(번수만 있음) 추천하지 않는다', () => {
    expect(suggestThreadTapeByKeyword('오바사 60S/3H THREAD', rules)?.materialSubType).toBe('OBA_SA_SKU_I_SA'); // "오바사" 키워드는 있음
    expect(suggestThreadTapeByKeyword('60S/3H THREAD', rules)).toBeNull(); // "오바사" 등 키워드 자체가 없음
  });

  it('빈 이름/일치 규칙 없음은 null', () => {
    expect(suggestThreadTapeByKeyword('', rules)).toBeNull();
    expect(suggestThreadTapeByKeyword(null, rules)).toBeNull();
    expect(suggestThreadTapeByKeyword('오바사', [])).toBeNull();
  });
});
