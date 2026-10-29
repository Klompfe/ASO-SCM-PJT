import {
  decomposeJamo,
  jamoDistance,
  extractCategory,
  suggestCategoryCorrection,
  applyCategoryCorrection,
} from './term-autocorrect.util';
import { CATEGORY_VOCAB } from './category-vocab.constants';

describe('decomposeJamo / jamoDistance (PR-208)', () => {
  it('음절을 초성·중성·종성으로 푼다(종성 없으면 생략)', () => {
    expect(decomposeJamo('보')).toEqual(['ㅂ', 'ㅗ']);
    expect(decomposeJamo('본')).toEqual(['ㅂ', 'ㅗ', 'ㄴ']);
  });

  it('한글이 아닌 글자는 그대로 한 칸을 차지한다', () => {
    expect(decomposeJamo('AB')).toEqual(['A', 'B']);
  });

  it('받침 하나 차이는 자모거리 1이다 — jamoDistance(보,본) === 1', () => {
    expect(jamoDistance('보', '본')).toBe(1);
  });

  it('jamoDistance(다우다,다후다) === 1', () => {
    expect(jamoDistance('다우다', '다후다')).toBe(1);
  });

  it('jamoDistance(곤돌라넵,곤돌라스넵) === 2(음절 하나 삽입이라 거리 2) — 교정 안 됨', () => {
    expect(jamoDistance('곤돌라넵', '곤돌라스넵')).toBe(2);
  });
});

describe('extractCategory (PR-208)', () => {
  it('첫 "(" 앞이 품목군, 그 뒤(코드 포함)가 rest다', () => {
    expect(extractCategory('보봉사(코아사)')).toEqual({ category: '보봉사', rest: '(코아사)' });
  });

  it('"(" 가 없으면 이름 전체가 품목군, rest는 빈 문자열', () => {
    expect(extractCategory('다후다')).toEqual({ category: '다후다', rest: '' });
  });

  it('"(" 뒤에 코드가 더 있어도(괄호 닫힌 뒤) rest에 그대로 보존된다', () => {
    expect(extractCategory('다데(실크)KL-001')).toEqual({ category: '다데', rest: '(실크)KL-001' });
  });
});

describe('suggestCategoryCorrection (PR-208)', () => {
  it('보봉사(코아사) → 본봉사 교정, 괄호 세부 보존, from/to 기록', () => {
    const r = suggestCategoryCorrection('보봉사(코아사)');
    expect(r).toEqual({ kind: 'corrected', from: '보봉사', to: '본봉사' });
    expect(applyCategoryCorrection('보봉사(코아사)', r)).toBe('본봉사(코아사)');
  });

  it('다우다 → 다후다 교정', () => {
    const r = suggestCategoryCorrection('다우다');
    expect(r).toEqual({ kind: 'corrected', from: '다우다', to: '다후다' });
  });

  it.each(['본봉사', '다후다', '쉬폰'])('정상 입력(%s)은 사전에 정확히 있어 unchanged', (name) => {
    expect(suggestCategoryCorrection(name)).toEqual({ kind: 'unchanged' });
  });

  it('사전에 없는 낯선 이름(가나다라마)은 불변 — unknown', () => {
    expect(suggestCategoryCorrection('가나다라마').kind).toBe('unknown');
  });

  it('후보 2개(속단추/목단추 둘 다 거리 1인 합성 입력 옥단추)는 ambiguous, 교정하지 않음', () => {
    const r = suggestCategoryCorrection('옥단추');
    expect(r.kind).toBe('ambiguous');
    expect(r.candidates?.sort()).toEqual(['목단추', '속단추']);
  });

  it('2글자 이하 입력은 사전에 정확히 있을 때만 unchanged, 없으면 교정 후보를 찾지 않고 unknown', () => {
    expect(suggestCategoryCorrection('단추')).toEqual({ kind: 'unchanged' }); // 사전에 정확히 있음
    expect(suggestCategoryCorrection('실').kind).toBe('unknown'); // 1글자, 사전에 없음(정확일치 아니면 후보 안 찾음)
  });

  it('영문·한영 혼합 이름은 불변(교정 대상 아님) — unknown', () => {
    expect(suggestCategoryCorrection('MAIN+SIZE LABEL').kind).toBe('unknown');
    expect(suggestCategoryCorrection('TAG PIN').kind).toBe('unknown');
  });

  it('공백이 낀 입력(본 봉사)은 공백 제거 후 사전과 일치해 unchanged', () => {
    expect(suggestCategoryCorrection('본 봉사')).toEqual({ kind: 'unchanged' });
  });

  it('폴리단추·곤돌라스넵은 사전에 있어(사용자 추가) 불변 — unchanged', () => {
    expect(suggestCategoryCorrection('폴리단추')).toEqual({ kind: 'unchanged' });
    expect(suggestCategoryCorrection('곤돌라스넵')).toEqual({ kind: 'unchanged' });
  });

  // PILOT-12 지시서의 "곤돌라스냅(받침 차이 정도의 합성)" — 실제로는 거리 1(모음
  // ㅐ↔ㅔ 차이)이라 후보가 정확히 1개(곤돌라스넵)라 교정된다. "스" 음절이 통째로 빠진
  // 곤돌라넵은 거리 2라 교정되지 않는다 — 표로 정리.
  it('곤돌라스냅(거리1, 후보1개) → 교정됨 / 곤돌라넵(거리2) → 교정 안 됨', () => {
    expect(suggestCategoryCorrection('곤돌라스냅')).toEqual({ kind: 'corrected', from: '곤돌라스냅', to: '곤돌라스넵' });
    const r = suggestCategoryCorrection('곤돌라넵');
    expect(r.kind).toBe('unknown');
    expect(r.candidates).toEqual(['곤돌라스넵']);
  });

  it('applyCategoryCorrection은 corrected가 아니면 원문을 그대로 돌려준다', () => {
    const unchanged = suggestCategoryCorrection('본봉사');
    expect(applyCategoryCorrection('본봉사(코아사)', unchanged)).toBe('본봉사(코아사)');
    const ambiguous = suggestCategoryCorrection('옥단추');
    expect(applyCategoryCorrection('옥단추', ambiguous)).toBe('옥단추');
  });
});

describe('CATEGORY_VOCAB (PR-208)', () => {
  it('115개(정답 시트 113개 + 사용자 추가 폴리단추·곤돌라스넵)이고 중복이 없다', () => {
    expect(CATEGORY_VOCAB.length).toBe(115);
    expect(new Set(CATEGORY_VOCAB).size).toBe(115);
  });

  it('전부 한글로만 이루어져 있다(영문·기호 혼합 없음)', () => {
    for (const term of CATEGORY_VOCAB) expect(/^[가-힣]+$/.test(term)).toBe(true);
  });
});
