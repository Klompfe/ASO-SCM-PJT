import {
  STYLE_NO_FORMAT_REGEX,
  checkStyleNo,
  generateStyleNoCandidates,
  generateLastDigitSuggestions,
  splitSupplierItemName,
  findOneCharDiffCandidates,
  checkUnknownName,
  findDuplicateGroups,
  checkDocumentDateSuspicious,
  checkYocheokMismatch,
} from './vision-guardrails.util';

describe('STYLE_NO_FORMAT_REGEX — 완성 시트 118개 패턴(익명 합성값으로 대표 검증)', () => {
  it.each(['MB00AAA000Z', 'MBS00AAA000A', 'LB00AAA000D', 'VB00AAA000P', 'MB00AAA000C', 'MB00AAA000F', 'MB00AAA000Z-1'])(
    '%s 는 형식을 통과한다',
    (styleNo) => {
      expect(STYLE_NO_FORMAT_REGEX.test(styleNo)).toBe(true);
    },
  );
});

describe('checkStyleNo (PR-200)', () => {
  it('끝 글자가 숫자면 STYLE_NO_LAST_DIGIT — suggestions가 Z A R K D P C F 순서', () => {
    const result = checkStyleNo('LB00ABC1913');
    expect(result.styleNo).toBe('LB00ABC1913'); // 값은 안 바뀜
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('STYLE_NO_LAST_DIGIT');
    expect(result.warnings[0].suggestions).toEqual([
      'LB00ABC191Z', 'LB00ABC191A', 'LB00ABC191R', 'LB00ABC191K', 'LB00ABC191D', 'LB00ABC191P', 'LB00ABC191C', 'LB00ABC191F',
    ]);
  });

  it('끝 숫자가 4면 A를 맨 앞으로', () => {
    const result = checkStyleNo('LB00ABC1914');
    expect(result.warnings[0].suggestions?.[0]).toBe('LB00ABC191A');
  });

  // PR-200c: "-숫자" 접미가 있어도 본체 끝 글자가 숫자면 여전히 STYLE_NO_LAST_DIGIT으로
  // 잡혀야 한다(이전엔 접미 때문에 LAST_DIGIT_REGEX가 안 맞아 FORMAT으로 샜다).
  it('접미가 붙어도 본체 끝 글자가 숫자면 STYLE_NO_LAST_DIGIT으로 잡힌다', () => {
    const result = checkStyleNo('MB6YHMP1022-1');
    expect(result.warnings[0].code).toBe('STYLE_NO_LAST_DIGIT');
  });

  it('본체가 영문자로 끝나면 접미가 있어도 여전히 통과(경고 없음)', () => {
    expect(checkStyleNo('MB6YHMP102Z-1').warnings).toEqual([]);
  });

  it('접미가 없는 기존 끝 글자 숫자 사례는 그대로 동작한다', () => {
    expect(checkStyleNo('MB6YHMP1022').warnings[0].code).toBe('STYLE_NO_LAST_DIGIT');
  });

  it('형식에 맞는 끝 글자(Z/A/R/K/D/P/C/F)는 경고 없음', () => {
    for (const letter of ['Z', 'A', 'R', 'K', 'D', 'P', 'C', 'F']) {
      expect(checkStyleNo(`LB00ABC191${letter}`).warnings).toEqual([]);
    }
  });

  it('형식은 맞지만 끝 글자가 드문 글자면 참고 경고만', () => {
    const result = checkStyleNo('LB00ABC191X');
    expect(result.warnings).toEqual([{ code: 'STYLE_NO_RARE_SUFFIX', message: '끝 글자(X)가 평소 쓰는 글자가 아닙니다 — 원본과 대조해 주세요' }]);
  });

  it('소문자만 다르면 대문자로 정리하고 원문을 rawStyleNo에 남긴다(경고 없음)', () => {
    const result = checkStyleNo('mb00abc000z');
    expect(result.styleNo).toBe('MB00ABC000Z');
    expect(result.rawStyleNo).toBe('mb00abc000z');
    expect(result.warnings.map((w) => w.code)).toEqual(['STYLE_NO_CASE_NORMALIZED']);
  });

  it('하이픈이 섞인 값은 값을 안 바꾸고 후보 없이 STYLE_NO_FORMAT만', () => {
    const result = checkStyleNo('MB00-AAA-000');
    expect(result.styleNo).toBe('MB00-AAA-000');
    expect(result.warnings[0].code).toBe('STYLE_NO_FORMAT');
    expect(result.warnings[0].suggestions).toEqual([]);
  });

  it('품목코드 자리의 0(영문 O 오독)은 후보에 O 치환본이 포함되고 값은 안 바뀐다', () => {
    const result = checkStyleNo('MB000AA000Z');
    expect(result.styleNo).toBe('MB000AA000Z');
    expect(result.warnings[0].code).toBe('STYLE_NO_FORMAT');
    expect(result.warnings[0].suggestions).toContain('MB00OAA000Z');
  });

  it('숫자 자리의 O(숫자 0 오독)는 후보에 …000Z 치환본이 포함된다', () => {
    const result = checkStyleNo('MB00AAA0O0Z');
    expect(result.warnings[0].suggestions).toContain('MB00AAA000Z');
  });

  it('길이가 짧게 깨진 값은 후보 없이 경고만', () => {
    const result = checkStyleNo('MB000000');
    expect(result.warnings[0].code).toBe('STYLE_NO_FORMAT');
    expect(result.warnings[0].suggestions).toEqual([]);
  });

  it('정상 스타일번호는 후보·경고 없음(오탐 방지)', () => {
    expect(checkStyleNo('MB00AAA000Z').warnings).toEqual([]);
  });

  it('빈 값/null은 경고 없이 그대로', () => {
    expect(checkStyleNo(null)).toEqual({ styleNo: null, rawStyleNo: null, warnings: [] });
    expect(checkStyleNo('')).toEqual({ styleNo: '', rawStyleNo: null, warnings: [] });
  });

  it('모든 후보는 정규식을 통과하고 3개를 넘지 않는다', () => {
    for (const raw of ['MB000AA000Z', 'MB00AAA0O0Z', 'LB00ABC1913']) {
      const result = checkStyleNo(raw);
      const suggestions = result.warnings[0]?.suggestions ?? [];
      expect(suggestions.length).toBeLessThanOrEqual(8); // LAST_DIGIT은 최대 8(글자 수)
      for (const s of suggestions) expect(STYLE_NO_FORMAT_REGEX.test(s)).toBe(true);
    }
    // STYLE_NO_FORMAT(혼동 문자 치환)은 3개 이하로 제한된다.
    expect(generateStyleNoCandidates('MB000AA000Z').length).toBeLessThanOrEqual(3);
  });

  it('기존 스타일 목록에 실제로 있는 후보를 맨 앞에 둔다', () => {
    const candidates = generateStyleNoCandidates('MB000AA000Z', ['MB00OAA000Z']);
    expect(candidates[0]).toBe('MB00OAA000Z');
  });
});

describe('generateLastDigitSuggestions', () => {
  it('생성된 후보는 전부 형식을 통과한다', () => {
    const suggestions = generateLastDigitSuggestions('MB00AAA0002');
    expect(suggestions.length).toBe(8);
    for (const s of suggestions) expect(STYLE_NO_FORMAT_REGEX.test(s)).toBe(true);
  });
});

describe('splitSupplierItemName (PR-200) — "공급사)자재명" 분리', () => {
  it('괄호 앞은 공급사, 뒤는 자재명으로 나눈다', () => {
    expect(splitSupplierItemName('르카이)KL-R114')).toEqual({ supplierName: '르카이', itemName: 'KL-R114' });
  });

  it('")"가 없으면 null(분리하지 않음)', () => {
    expect(splitSupplierItemName('그냥자재명')).toBeNull();
  });

  it('앞뒤 공백은 정리한다', () => {
    expect(splitSupplierItemName(' 르카이 ) KL-R114 ')).toEqual({ supplierName: '르카이', itemName: 'KL-R114' });
  });
});

describe('splitSupplierItemName (PR-200c) — 내부 코드·스타일번호 조각은 분리하지 않음', () => {
  it('")" 앞에 괄호가 안 닫힌 내부 코드면 분리하지 않는다(실사례: MB99-001-0(XYZ) 1234)', () => {
    expect(splitSupplierItemName('MB99-001-0(XYZ) 1234')).toBeNull();
  });

  it('")" 앞이 숫자-하이픈-숫자 내부 코드면 분리하지 않는다', () => {
    expect(splitSupplierItemName('MB12-017-0 DDM) 2504')).toBeNull();
  });

  it('")" 앞이 MB/LB/VB로 시작하면(스타일번호류 접두) 분리하지 않는다', () => {
    expect(splitSupplierItemName('MB123) 자재명')).toBeNull();
  });

  it('")" 앞이 숫자만이면 분리하지 않는다', () => {
    expect(splitSupplierItemName('12345) 자재명')).toBeNull();
  });

  it('")" 앞이 비정상적으로 길면(20자 초과) 분리하지 않는다', () => {
    expect(splitSupplierItemName('가짜공급사이름이십자를넘는긴문자열입니다12) 자재명')).toBeNull();
  });

  it('정상 분리(짧고 괄호·내부코드 없음)는 그대로 동작한다', () => {
    expect(splitSupplierItemName('거래처A)C679')).toEqual({ supplierName: '거래처A', itemName: 'C679' });
  });
});

describe('findOneCharDiffCandidates / checkUnknownName (PR-200)', () => {
  const master = ['KL-R926', 'KL-R114', '코아사'];

  it('마스터에 숫자 한 자리만 다른 이름이 있으면 후보로 붙인다', () => {
    expect(findOneCharDiffCandidates('KL-R326', master)).toEqual(['KL-R926']);
  });

  it('길이가 다르면 후보가 아니다', () => {
    expect(findOneCharDiffCandidates('KL-R9', master)).toEqual([]);
  });

  it('마스터에 있는 이름은 UNKNOWN_NAME이 아니다(공백·대소문자 무시)', () => {
    expect(checkUnknownName(' kl-r114 ', master)).toBeNull();
  });

  it('마스터에 없으면 UNKNOWN_NAME + 한 글자 차이 후보', () => {
    const result = checkUnknownName('KL-R326', master);
    expect(result?.code).toBe('UNKNOWN_NAME');
    expect(result?.suggestions).toEqual(['KL-R926']);
  });

  it('자동 교체하지 않는다(값 자체는 함수가 바꾸지 않음, 후보만 제공)', () => {
    const result = checkUnknownName('KL-R326', master);
    expect(result?.suggestions).not.toContain('KL-R326'); // 원본 이름이 섞여 나오지 않음
  });
});

describe('findDuplicateGroups (PR-200)', () => {
  it('같은 구분·규격·요척(1 제외) 행이 2개 이상이면 묶는다', () => {
    const bomItems = [
      { category: '봉사', spec: null, consumption: 20 },
      { category: '봉사', spec: null, consumption: 20 },
      { category: '봉사', spec: null, consumption: 20 },
      { category: '단추', spec: null, consumption: 4 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([[0, 1, 2]]);
  });

  it('요척이 1이면(흔한 기본값) 묶지 않는다', () => {
    const bomItems = [
      { category: '지퍼', spec: null, consumption: 1 },
      { category: '지퍼', spec: null, consumption: 1 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([]);
  });
});

describe('findDuplicateGroups (PR-200c) — 코드형 토큰이 다르면 헛경보로 안 묶는다(실사례: KL-R130 ↔ 9748)', () => {
  it('둘 다 코드형 토큰이 있는데 서로 다르면 묶지 않는다', () => {
    const bomItems = [
      { itemName: 'KL-R130', category: '겉감', spec: null, consumption: 2.21 },
      { itemName: '9748', category: '겉감', spec: null, consumption: 2.21 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([]);
  });

  it('코드형 토큰이 같으면(색상 변형 등) 그대로 묶는다', () => {
    const bomItems = [
      { itemName: 'KL-R130 BEIGE', category: '겉감', spec: null, consumption: 2.21 },
      { itemName: 'KL-R130 BLACK', category: '겉감', spec: null, consumption: 2.21 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([[0, 1]]);
  });

  it('한쪽만 코드형 토큰이 있으면(한글 이름만 등) 기존 규칙대로 묶는다', () => {
    const bomItems = [
      { itemName: 'KL-R144', category: '겉감', spec: null, consumption: 2.1 },
      { itemName: 'BK', category: '겉감', spec: null, consumption: 2.1 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([[0, 1]]);
  });

  it('둘 다 코드형 토큰이 없으면(전부 한글 이름) 기존 규칙대로 묶는다', () => {
    const bomItems = [
      { itemName: '단추', category: '단추', spec: null, consumption: 2 },
      { itemName: '마블단추', category: '단추', spec: null, consumption: 2 },
    ];
    expect(findDuplicateGroups(bomItems)).toEqual([[0, 1]]);
  });
});

describe('checkDocumentDateSuspicious (PR-200)', () => {
  it('미래 날짜면 의심', () => {
    expect(checkDocumentDateSuspicious('2027-01-01', '2026-10-21')?.code).toBe('DOCUMENT_DATE_SUSPICIOUS');
  });

  it('18개월보다 오래되면 의심', () => {
    expect(checkDocumentDateSuspicious('2024-01-01', '2026-10-21')?.code).toBe('DOCUMENT_DATE_SUSPICIOUS');
  });

  it('정상 범위면 경고 없음', () => {
    expect(checkDocumentDateSuspicious('2026-09-01', '2026-10-21')).toBeNull();
  });

  it('null이면 경고 없음', () => {
    expect(checkDocumentDateSuspicious(null, '2026-10-21')).toBeNull();
  });
});

describe('checkYocheokMismatch (PR-200) — 배경 사례(1.24 오독 → 실제 1.21)', () => {
  it('불일치면 경고 + 역산한 요척 후보', () => {
    const result = checkYocheokMismatch(1.24, 80, 97);
    expect(result?.code).toBe('YOCHEOK_QTY_MISMATCH');
    expect(result?.message).not.toContain('수량이 다릅니다');
    expect(result?.suggestions).toEqual(['1.21']);
  });

  it('올림/반올림으로 맞으면(1.21×80=96.8↔97) 경고 없음', () => {
    expect(checkYocheokMismatch(1.21, 80, 97)).toBeNull();
  });

  it('값이 없으면 비교하지 않음', () => {
    expect(checkYocheokMismatch(null, 80, 97)).toBeNull();
    expect(checkYocheokMismatch(1.21, 80, null)).toBeNull();
    expect(checkYocheokMismatch(1.21, null, 97)).toBeNull();
  });
});
