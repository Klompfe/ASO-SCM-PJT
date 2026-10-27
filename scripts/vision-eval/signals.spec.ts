import {
  hasSuspiciousStyleNoSuffix,
  detectDuplicateValueRowIndexes,
  isUnknownMaterialName,
  checkConsumptionVsShipment,
  isDocumentDateSuspicious,
  evaluateSignal,
} from './signals';

describe('신호① hasSuspiciousStyleNoSuffix (PR-199)', () => {
  it('끝 글자가 숫자면 의심(실사례 MB73SKM109Z → MB73SKM1093 같은 형식)', () => {
    expect(hasSuspiciousStyleNoSuffix('MB73SKM1093')).toBe(true);
  });
  it('끝 글자가 영문이면 정상', () => {
    expect(hasSuspiciousStyleNoSuffix('MB73SKM109Z')).toBe(false);
  });
  it('패턴 자체가 안 맞으면(길이 다름 등) 판단하지 않음(false)', () => {
    expect(hasSuspiciousStyleNoSuffix('짧음')).toBe(false);
  });
});

describe('신호② detectDuplicateValueRowIndexes (PR-199)', () => {
  it('같은 구분·규격·값(1 제외)이 2개 이상이면 중복 의심으로 묶는다', () => {
    const rows = [
      { category: '부자재', spec: null, consumption: 20 },
      { category: '부자재', spec: null, consumption: 20 },
      { category: '부자재', spec: null, consumption: 5 },
    ];
    expect(detectDuplicateValueRowIndexes(rows)).toEqual([[0, 1]]);
  });

  it('값이 1이면 흔한 값이라 오탐 방지로 묶지 않는다', () => {
    const rows = [{ category: 'A', spec: null, consumption: 1 }, { category: 'A', spec: null, consumption: 1 }];
    expect(detectDuplicateValueRowIndexes(rows)).toEqual([]);
  });
});

describe('신호③ isUnknownMaterialName (PR-199)', () => {
  it('알려진 이름 목록(사전/정답 엑셀)에 없으면 true', () => {
    expect(isUnknownMaterialName('이상한자재', new Set(['오바사', '다데']))).toBe(true);
    expect(isUnknownMaterialName('오바사', new Set(['오바사', '다데']))).toBe(false);
  });
});

describe('신호④ checkConsumptionVsShipment (PR-199 보완 재현)', () => {
  it('요척 1.24·수량 80·출고량 97 → 불일치, 후보 요척 1.21', () => {
    const result = checkConsumptionVsShipment(1.24, 80, 97);
    expect(result.mismatch).toBe(true);
    expect(result.candidateConsumption).toBe(1.21);
  });

  it('요척 1.21·수량 80·출고량 97 → 1% 이내라 일치(96.8↔97)', () => {
    const result = checkConsumptionVsShipment(1.21, 80, 97);
    expect(result.mismatch).toBe(false);
  });
});

describe('신호⑤ isDocumentDateSuspicious (PR-199)', () => {
  it('미래 날짜면 의심', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(isDocumentDateSuspicious(farFuture)).toBe(true);
  });
  it('18개월 넘게 과거면 의심', () => {
    const today = new Date('2026-10-17');
    expect(isDocumentDateSuspicious('2024-01-01', today)).toBe(true);
  });
  it('최근 날짜면 정상', () => {
    const today = new Date('2026-10-17');
    expect(isDocumentDateSuspicious('2026-10-01', today)).toBe(false);
  });
});

describe('evaluateSignal (PR-199) — 신호별 적중률·오탐률·조용한 오류', () => {
  it('적중률·오탐률·조용한 오류를 집계한다', () => {
    const result = evaluateSignal([
      { isActualError: true, signalFired: true },
      { isActualError: true, signalFired: false }, // 조용한 오류
      { isActualError: false, signalFired: true }, // 오탐
      { isActualError: false, signalFired: false },
    ]);
    expect(result.hitRate).toBe(0.5);
    expect(result.falsePositiveRate).toBe(0.5);
    expect(result.silentErrors).toBe(1);
  });

  it('후보 적중률은 candidateMatchesGolden이 있는 항목만 센다', () => {
    const result = evaluateSignal([
      { isActualError: true, signalFired: true, candidateMatchesGolden: true },
      { isActualError: true, signalFired: true, candidateMatchesGolden: false },
    ]);
    expect(result.candidateAccuracy).toBe(0.5);
  });

  it('candidateMatchesGolden이 전혀 없으면 candidateAccuracy는 null', () => {
    const result = evaluateSignal([{ isActualError: true, signalFired: true }]);
    expect(result.candidateAccuracy).toBeNull();
  });
});
