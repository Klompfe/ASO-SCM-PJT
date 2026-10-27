import { scoreStyleNo, aggregateConfusionPairs } from './style-field';

describe('scoreStyleNo (PR-199)', () => {
  it('정확히 같으면 EXACT', () => {
    expect(scoreStyleNo('MB73SKM109Z', 'MB73SKM109Z')).toEqual({ type: 'EXACT', confusion: null, gtNote: null });
  });

  it('끝 영문자가 통째로 빠지면 SUFFIX_MISSING(실제 사례 MB73SKM109Z → MB73SKM109)', () => {
    expect(scoreStyleNo('MB73SKM109Z', 'MB73SKM109')).toEqual({ type: 'SUFFIX_MISSING', confusion: null, gtNote: null });
  });

  it('끝 글자를 숫자로 오독하면 SUFFIX_DIGIT이고 혼동쌍을 기록한다(Z→3)', () => {
    expect(scoreStyleNo('MB73SKM191Z', 'MB73SKM1913')).toEqual({ type: 'SUFFIX_DIGIT', confusion: { golden: 'Z', read: '3' }, gtNote: null });
  });

  it('그 외 불일치는 OTHER_MISMATCH', () => {
    expect(scoreStyleNo('MB73SKM109Z', 'MB99OTHER').type).toBe('OTHER_MISMATCH');
  });

  it('아예 못 읽었으면(null) OTHER_MISMATCH', () => {
    expect(scoreStyleNo('MB73SKM109Z', null).type).toBe('OTHER_MISMATCH');
  });
});

describe('scoreStyleNo (PR-199c) — 정답 셀 메모 제거(GT_STYLE_NOTE)', () => {
  it('정답 셀에 괄호 메모가 붙어 있어도 본체만 비교해 EXACT로 분류하고 메모를 남긴다(가짜 사례)', () => {
    const result = scoreStyleNo('FAKE0000A (끝자리 확인요망)', 'FAKE0000A');
    expect(result.type).toBe('EXACT');
    expect(result.gtNote).toBe('(끝자리 확인요망)');
  });

  it('메모가 없으면 gtNote는 null', () => {
    expect(scoreStyleNo('FAKE0000A', 'FAKE0000A').gtNote).toBeNull();
  });

  it('메모를 뗀 본체도 다르면 여전히 OTHER_MISMATCH이고 메모는 그대로 기록된다', () => {
    const result = scoreStyleNo('FAKE0000A (끝자리 확인요망)', 'FAKE9999B');
    expect(result.type).toBe('OTHER_MISMATCH');
    expect(result.gtNote).toBe('(끝자리 확인요망)');
  });
});

describe('aggregateConfusionPairs (PR-199) — 끝 글자 혼동표', () => {
  it('같은 (정답,읽음) 쌍을 건수로 묶고 많은 순으로 정렬한다', () => {
    const result = aggregateConfusionPairs([
      { golden: 'Z', read: '3' },
      { golden: 'Z', read: '3' },
      { golden: 'Z', read: '2' },
      { golden: 'A', read: '4' },
    ]);
    expect(result).toEqual([
      { golden: 'Z', read: '3', count: 2 },
      { golden: 'Z', read: '2', count: 1 },
      { golden: 'A', read: '4', count: 1 },
    ]);
  });
});
