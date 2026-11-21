import { describe, it, expect } from 'vitest';
import { isOuterFabricCategory, outerFabricStatus, selectOuterFabricRowIndexes, summarizeCompositions, formatCompositionSummary, isCompositionTargetCategory, cleanComposition, looksLikeAbbreviatedComposition, applyBulkComposition, selectFabricRowIndexes, countNonFabricSelected, formatBulkResult } from './compositionReview';

// PR-246: 합성 값만 사용.
describe('compositionReview (PR-246)', () => {
  it('cleanComposition: 공백만/null은 null, 그 외는 trim만(대소문자 유지)', () => {
    expect(cleanComposition('  ')).toBeNull();
    expect(cleanComposition(null)).toBeNull();
    expect(cleanComposition(' Cotton 60% ')).toBe('Cotton 60%');
  });

  it('isCompositionTargetCategory: 원단류만 대상(부자재는 제외)', () => {
    expect(isCompositionTargetCategory('겉감')).toBe(true);
    expect(isCompositionTargetCategory('안감')).toBe(true);
    expect(isCompositionTargetCategory('단추')).toBe(false);
    expect(isCompositionTargetCategory(null)).toBe(false);
  });

  it('summarizeCompositions: 같은 값은 한 줄로 모아 행 수를 세고, 미기재는 원단류 행만 센다', () => {
    const s = summarizeCompositions([
      { category: '겉감', composition: 'COTTON 60% POLYESTER 40%' },
      { category: '겉감', composition: ' COTTON 60% POLYESTER 40% ' },
      { category: '안감', composition: 'POLYESTER 100%' },
      { category: '겉감', composition: null },
      { category: '단추', composition: '' }, // 부자재 미기재는 경고 대상 아님
    ]);
    expect(s.groups).toEqual([
      { value: 'COTTON 60% POLYESTER 40%', rowCount: 2 },
      { value: 'POLYESTER 100%', rowCount: 1 },
    ]);
    expect(s.missingRows).toBe(0); // PR-255: 겉감 미기재는 missingRows 가 아니라 outer(blank)로 센다 — 중복 경고 없음
    expect(s.outer).toEqual({ kind: 'blank', rowCount: 3, blankRows: 1 });
    expect(formatCompositionSummary(s)).toBe('COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)');
  });

  it('다른 표기(대소문자 차이)는 합치지 않는다(정규화 없음)', () => {
    const s = summarizeCompositions([
      { category: '겉감', composition: 'COTTON 100%' },
      { category: '겉감', composition: 'Cotton 100%' },
    ]);
    expect(s.groups).toHaveLength(2);
  });

  it('제외 체크된 행은 요약·미기재 수에서 뺀다', () => {
    const s = summarizeCompositions(
      [
        { category: '겉감', composition: 'COTTON 100%' },
        { category: '겉감', composition: null },
      ],
      new Set([0, 1]),
    );
    expect(s.groups).toEqual([]);
    expect(s.missingRows).toBe(0);
  });

  it('값이 하나도 없으면 groups는 비고 문자열은 빈 문자열', () => {
    const s = summarizeCompositions([{ category: '겉감', composition: undefined }]);
    expect(s.groups).toEqual([]);
    expect(formatCompositionSummary(s)).toBe('');
    expect(s.missingRows).toBe(0);
    expect(s.outer.kind).toBe('blank');
  });
});

// PR-247: 약어형 안내 판정(안내만, 값 불변).
describe('looksLikeAbbreviatedComposition (PR-247)', () => {
  it.each(['R/N/SP=56/40/4', 'C/P=60/40', 'c/p=60/40', ' C/P 60/40 ', 'A=1'])('약어형 %p → true', (v) => {
    expect(looksLikeAbbreviatedComposition(v)).toBe(true);
  });

  it.each(['COTTON 60% POLYESTER 40%', 'C/P=60%/40%', 'POLYESTER 100%', '', '   ', null, undefined, 'COTTON', 'A/B', '면 폴리에스터'])('약어형 아님 %p → false', (v) => {
    expect(looksLikeAbbreviatedComposition(v as any)).toBe(false);
  });

  it('판정 함수는 값을 바꾸지 않는다(입력 문자열 그대로, 부작용 없음)', () => {
    const v = ' r/n/sp=56/40/4 ';
    looksLikeAbbreviatedComposition(v);
    expect(v).toBe(' r/n/sp=56/40/4 ');
  });
});

// PR-248: 선택 행 일괄 입력(화면 상태만 변경) — 합성 값.
describe('applyBulkComposition (PR-248)', () => {
  const rows = () => [
    { category: '겉감', itemName: 'A', composition: null as string | null | undefined },
    { category: '안감', itemName: 'B', composition: 'POLYESTER 100%' },
    { category: '겉감', itemName: 'C', composition: '  ' },
    { category: '단추', itemName: 'D', composition: undefined },
  ];

  it('선택된 빈 행만 채우고, 값이 있는 행은 건너뛰며 개수를 센다', () => {
    const r = applyBulkComposition(rows(), new Set([0, 1, 2]), 'COTTON 60% POLYESTER 40%');
    expect(r.filled).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.rows.map((x) => x.composition)).toEqual(['COTTON 60% POLYESTER 40%', 'POLYESTER 100%', 'COTTON 60% POLYESTER 40%', undefined]);
    expect(formatBulkResult(r)).toBe('2행 채움, 1행은 이미 값이 있어 건너뜀');
  });

  it('값은 입력한 그대로(앞뒤 공백만 제거) 들어간다 — 약어·소문자·기호 불변', () => {
    const r = applyBulkComposition(rows(), new Set([0]), '  r/n/sp=56/40/4 ');
    expect(r.rows[0].composition).toBe('r/n/sp=56/40/4');
  });

  it('값이 비어 있거나 선택이 없으면 아무것도 바꾸지 않는다', () => {
    const base = rows();
    for (const v of ['', '   ', null, undefined]) {
      const r = applyBulkComposition(base, new Set([0, 2]), v);
      expect(r).toEqual({ rows: base, filled: 0, skipped: 0 });
    }
    expect(applyBulkComposition(base, new Set(), 'X 100%')).toEqual({ rows: base, filled: 0, skipped: 0 });
  });

  it('선택되지 않은 행·원본 배열은 바뀌지 않는다', () => {
    const base = rows();
    const r = applyBulkComposition(base, new Set([0]), 'X 100%');
    expect(base[0].composition).toBeNull();
    expect(r.rows[2]).toBe(base[2]);
    expect(r.rows[3]).toBe(base[3]);
  });

  it('selectFabricRowIndexes: PR-246 원단류 구분 목록 재사용(부자재 제외)', () => {
    expect([...selectFabricRowIndexes(rows())]).toEqual([0, 1, 2]);
  });

  it('countNonFabricSelected: 선택된 행 중 부자재 수', () => {
    expect(countNonFabricSelected(rows(), new Set([0, 3]))).toBe(1);
    expect(countNonFabricSelected(rows(), new Set([0, 1, 2]))).toBe(0);
  });

  it('미기재 행 수 안내는 PR-246 summarizeCompositions 를 그대로 쓴다(채운 뒤 줄어든다)', () => {
    const base = rows();
    expect(summarizeCompositions(base).outer).toEqual({ kind: 'blank', rowCount: 2, blankRows: 2 });
    const filled = applyBulkComposition(base, new Set([0, 2]), 'X 100%').rows;
    expect(summarizeCompositions(filled).outer).toEqual({ kind: 'filled', rowCount: 2, values: ['X 100%'] });
  });
});

describe('isCompositionTargetCategory — 영문 별칭 (PR-254)', () => {
  it.each([
    ['OUT SHELL', true], ['  out shell ', true], ['OUT-SHELL', true], ['겉감\r\nOUT-SHELL', true], ['겉감                  OUT-SHELL', true],
    ['SHELL', true], ['OUTER SHELL', true], ['LINING', true], ['쉬 폰\r\nLINING', true], ['안 감', true], ['COMBINATION', true], ['배 색\r\nCOMBINATION', true],
    ['INTERLINING', false], ['심 지\r\nINTERLINING\r\n(M-100)', false], ['EDGE TAPE', false], ['PAD', false], ['SEWING THREAD', false], ['배색 스쿠이사   45S/3H   THREAD', false],
    ['', false], [undefined, false],
  ])('%j → %s', (category, expected) => {
    expect(isCompositionTargetCategory(category as string | undefined)).toBe(expected);
  });

  it('원단류 선택·미기재 집계가 영문 구분 행에도 적용된다(저장된 구분 원문은 그대로)', () => {
    const rows = [
      { category: '겉감\r\nOUT-SHELL', composition: '' },
      { category: '쉬 폰\r\nLINING', composition: 'POLYESTER 100%' },
      { category: '심 지\r\nINTERLINING', composition: '' },
      { category: 'EDGE TAPE', composition: '' },
    ];
    expect([...selectFabricRowIndexes(rows)]).toEqual([0, 1]);
    expect(summarizeCompositions(rows as never).outer.kind).toBe('blank');
    expect(rows[0].category).toBe('겉감\r\nOUT-SHELL');
  });
});

// PR-255: 공백 1칸 표기·단어 경계 별칭, 겉감 상태, 겉감 전용 선택.
describe('구분 별칭 — 단어 경계 정확 일치 (PR-255)', () => {
  it.each([
    ['겉감 OUT-SHELL', true], ['겉감\nOUT-SHELL', true], ['out shell ', true], ['쉬폰\nLINING', true], ['쉬폰 LINING', true], ['LINING', true],
    ['안감(스트라이프)', true], ['안감 해리,주머니감', true], ['안 감', true], ['오비미까시배색\nCOMBINATION', true],
    ['INTERLINING', false], ['심 지 INTERLINING (M-100)', false], ['EDGE TAPE', false], ['PAD', false], ['SEWING THREAD', false], ['배색 스쿠이사 45S/3H THREAD', false], ['SHELL BUTTON', false], ['', false],
  ])('%j → %s', (category, expected) => {
    expect(isCompositionTargetCategory(category)).toBe(expected);
  });

  it('LINING 은 INTERLINING 안에서 인식되지 않는다(부분 일치 금지)', () => {
    expect(isCompositionTargetCategory('INTERLINING')).toBe(false);
    expect(isCompositionTargetCategory('심지 INTERLINING')).toBe(false);
    expect(isCompositionTargetCategory('INTER LINING')).toBe(true); // 별개 단어 LINING
  });

  it('겉감 계열은 겉감·OUT SHELL·SHELL·OUTER SHELL 만(안감·배색은 원단류지만 겉감 아님)', () => {
    expect(isOuterFabricCategory('겉감 OUT-SHELL')).toBe(true);
    expect(isOuterFabricCategory('OUTER SHELL')).toBe(true);
    expect(isOuterFabricCategory('쉬폰 LINING')).toBe(false);
    expect(isOuterFabricCategory('배색 COMBINATION')).toBe(false);
    expect(isOuterFabricCategory(null)).toBe(false);
  });
});

describe('outerFabricStatus (PR-255)', () => {
  it('겉감 행이 없으면 noRow(안감만 있어도)', () => {
    expect(outerFabricStatus([{ category: '안감', composition: 'A 100%' }, { category: '단추', composition: null }])).toEqual({ kind: 'noRow' });
    expect(outerFabricStatus([])).toEqual({ kind: 'noRow' });
  });
  it('겉감 행의 혼용률이 비어 있으면 blank, 값이 있으면 filled(중복 제거)', () => {
    expect(outerFabricStatus([{ category: '겉감', composition: '  ' }])).toEqual({ kind: 'blank', rowCount: 1, blankRows: 1 });
    expect(outerFabricStatus([{ category: '겉감', composition: 'A 100%' }, { category: 'OUT SHELL', composition: 'A 100%' }])).toEqual({ kind: 'filled', rowCount: 2, values: ['A 100%'] });
  });
  it('겉감 여러 행 중 일부만 비어 있어도 blank', () => {
    expect(outerFabricStatus([{ category: '겉감', composition: 'A 100%' }, { category: '겉감', composition: null }])).toEqual({ kind: 'blank', rowCount: 2, blankRows: 1 });
  });
  it('제외 체크된 겉감 행은 뺀다(전부 제외면 noRow)', () => {
    expect(outerFabricStatus([{ category: '겉감', composition: null }], new Set([0]))).toEqual({ kind: 'noRow' });
  });
  it('알 수 없는 입력은 안전한 쪽(noRow)', () => {
    expect(outerFabricStatus(undefined)).toEqual({ kind: 'noRow' });
    expect(outerFabricStatus(null)).toEqual({ kind: 'noRow' });
    expect(outerFabricStatus('x' as never)).toEqual({ kind: 'noRow' });
    expect(outerFabricStatus([null as never, { category: undefined, composition: undefined }])).toEqual({ kind: 'noRow' });
  });
  it('안감 미기재는 missingRows 로, 겉감 미기재는 outer 로만 센다(중복 없음)', () => {
    const s = summarizeCompositions([{ category: '겉감', composition: null }, { category: '안감', composition: null }]);
    expect(s.missingRows).toBe(1);
    expect(s.outer.kind).toBe('blank');
  });
});

describe('selectOuterFabricRowIndexes (PR-255)', () => {
  it('겉감 계열 행만 고르고, 값이 있는 행은 일괄 입력에서 건너뛴다', () => {
    const rows = [
      { category: '겉감 OUT-SHELL', composition: null as string | null },
      { category: '쉬폰 LINING', composition: null },
      { category: '겉감', composition: 'KEEP 100%' },
      { category: 'EDGE TAPE', composition: null },
    ];
    const sel = selectOuterFabricRowIndexes(rows);
    expect([...sel]).toEqual([0, 2]);
    const r = applyBulkComposition(rows, sel, 'NEW 100%');
    expect(r.rows.map((x) => x.composition)).toEqual(['NEW 100%', null, 'KEEP 100%', null]);
    expect(r).toMatchObject({ filled: 1, skipped: 1 });
  });
});
