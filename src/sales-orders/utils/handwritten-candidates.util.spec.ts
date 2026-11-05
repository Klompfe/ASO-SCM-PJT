import { sanitizeHandwrittenCandidates } from './handwritten-candidates.util';

describe('sanitizeHandwrittenCandidates (PR-223)', () => {
  it('정상 항목(합성 값)을 그대로 통과시킨다', () => {
    const result = sanitizeHandwrittenCandidates(
      [{ rawText: '금속장식 (내경 10φ)', name: '금속장식', spec: '내경 10φ', color: null, consumption: null, requiredQty: null, requiredQtyUnit: null, locationHint: '하단 여백' }],
      [],
    );
    expect(result).toEqual([
      { rawText: '금속장식 (내경 10φ)', name: '금속장식', spec: '내경 10φ', color: null, consumption: null, requiredQty: null, requiredQtyUnit: null, locationHint: '하단 여백' },
    ]);
  });

  it('필드가 없거나(undefined) 전체가 null/형식 오류여도 예외 없이 빈 배열(업로드 성공)', () => {
    expect(sanitizeHandwrittenCandidates(undefined, [])).toEqual([]);
    expect(sanitizeHandwrittenCandidates(null, [])).toEqual([]);
    expect(sanitizeHandwrittenCandidates('아무문자열', [])).toEqual([]);
    expect(sanitizeHandwrittenCandidates(123, [])).toEqual([]);
    expect(sanitizeHandwrittenCandidates([null, 'x', 42], [])).toEqual([]);
  });

  it('rawText가 없는 항목은 후보로 인정하지 않는다', () => {
    const result = sanitizeHandwrittenCandidates([{ name: '금속장식' }], []);
    expect(result).toEqual([]);
  });

  it('개수 상한(10개)을 넘으면 앞 10개만 남긴다', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ rawText: `메모${i}` }));
    const result = sanitizeHandwrittenCandidates(many, []);
    expect(result).toHaveLength(10);
    expect(result[0].rawText).toBe('메모0');
    expect(result[9].rawText).toBe('메모9');
  });

  it('길이 상한(300자)을 넘는 문자열은 잘라낸다', () => {
    const long = 'A'.repeat(400);
    const result = sanitizeHandwrittenCandidates([{ rawText: long }], []);
    expect(result[0].rawText).toHaveLength(300);
  });

  it('bomItems의 자재명과 정규화(공백·대소문자) 후 같은 이름의 후보는 제외한다', () => {
    const result = sanitizeHandwrittenCandidates(
      [
        { rawText: '금속 장식', name: '금속장식' }, // bomItems에 '금속장식'(공백 없음)이 있으면 제외
        { rawText: 'BE-WH…', name: null }, // name이 없으면 중복 비교 대상이 아니라 통과
        { rawText: '새 자재', name: '완전히새로운자재' },
      ],
      ['금속장식'],
    );
    expect(result.map((r) => r.rawText)).toEqual(['BE-WH…', '새 자재']);
  });

  it('이름 비교는 공백·대소문자·괄호를 무시한다(예: "금속 장식(소)" vs "금속장식(소)")', () => {
    const result = sanitizeHandwrittenCandidates([{ rawText: 'x', name: '금속 장식(소)' }], ['금속장식(소)']);
    expect(result).toEqual([]);
  });

  it('숫자 필드가 숫자가 아니면(문자열 등) null로 정리한다', () => {
    const result = sanitizeHandwrittenCandidates([{ rawText: 'x', consumption: '1.5', requiredQty: NaN }], []);
    expect(result[0].consumption).toBeNull();
    expect(result[0].requiredQty).toBeNull();
  });
});
