import { rolloverTargetRddYear } from './target-rdd-year-rollover.util';

// PR-201(운영 화면 확인): 기준을 "항상 오늘(한국시간)"에서 "작성일이 신뢰 가능하면
// 작성일, 아니면 오늘"로 되돌렸다 — 작성일이 과거인 작지(보관/시험 문서)는 납기도
// 오늘보다 과거일 수 있는데, 기준이 늘 오늘이면 그런 정상 문서의 납기를 억지로
// 다음 해로 밀어올려 버린다(실사례: 작성일 2025-09-08, 납기 2026-03-17 → 오늘보다
// 이르다는 이유로 2027년으로 보정된 것이 잘못임이 확인됨). 모든 테스트에서 오늘은
// 2026-10-14로 고정한다.
const TODAY = '2026-10-14';

describe('rolloverTargetRddYear (PR-201 — 기준을 작성일로 되돌림)', () => {
  // PR-190 실사례(MB74BLM107)였던 케이스 — 작성일 2026-01-01이 의심스럽지 않으므로
  // 이제는 작성일을 기준으로 삼는다. 납기 2026-02-17은 작성일보다 뒤(=문서 자체로는
  // 정상적인 근거리 납기)라 더 이상 보정하지 않는다(조회 시점이 나중이라도).
  it('작성일이 신뢰 가능하고 납기가 작성일보다 뒤면 — 오늘보다 과거라도 보정하지 않는다', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null, basis: null });
  });

  // PR-201 배경 실사례 패턴: 작성일이 과거(보관 문서)이고 납기가 작성일 이후·오늘
  // 이전이면 정상이므로 보정하지 않는다.
  it('작성일 과거 + 납기가 작성일 이후·오늘 이전 → 보정 없음', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-08', TODAY);
    expect(r).toEqual({ targetRdd: '2026-03-17', adjusted: false, original: null, basis: null });
  });

  // 작성일이 신뢰 가능하고 납기가 "작성일보다 이르면"(연도 없는 납기에 같은 해를 붙였더니
  // 작성일보다 앞선 날짜가 된 경우) 작성일 기준으로 +1년을 시도한다.
  it('작성일 있고 납기가 작성일보다 이르면 — 작성일 기준으로 +1년 시도, basis=DOCUMENT_DATE', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'DOCUMENT_DATE' });
  });

  it('납기가 이미 다음 해(2027-02-17)로 미래면 변경 없음', () => {
    const r = rolloverTargetRddYear('2027-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: false, original: null, basis: null });
  });

  it('납기가 작성일 이후면(기존 "의도된 변화" 케이스) 보정하지 않는다', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-12-30', adjusted: false, original: null, basis: null });
  });

  it('납기 == 오늘(당일)이고 작성일이 없으면 변경 없음', () => {
    const r = rolloverTargetRddYear(TODAY, null, TODAY);
    expect(r).toEqual({ targetRdd: TODAY, adjusted: false, original: null, basis: null });
  });

  it('납기 == 작성일이면 보정하지 않는다(작성일을 납기로 잘못 인식한 PR-158 패턴 — 의심 경고로만 알림, 경계)', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null, basis: null });
  });

  // 작성일이 없으면 기존 동작 그대로(오늘 기준).
  it('작성일이 없으면(null) 오늘 기준으로 지난 날짜면 보정된다 — basis=TODAY', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY' });
  });

  // 작성일이 의심스러운 날짜(미래 또는 18개월 초과 과거)면 신뢰할 수 없으므로 오늘을
  // 기준으로 쓴다(기존 동작 유지).
  it('작성일이 18개월 초과 과거(의심스러움)이면 오늘을 기준으로 쓴다 — basis=TODAY', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2020-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY' });
  });

  it('작성일이 미래(의심스러움)여도 오늘을 기준으로 쓴다 — basis=TODAY', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2027-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY' });
  });

  it('targetRdd가 없으면 변경 없음(null 그대로)', () => {
    const r = rolloverTargetRddYear(null, '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: null, adjusted: false, original: null, basis: null });
  });

  it('오늘(today) 값이 없거나 잘못된 형식이면 변경 없음', () => {
    expect(rolloverTargetRddYear('2026-02-17', null, '').adjusted).toBe(false);
    expect(rolloverTargetRddYear('2026-02-17', null, '2026/10/14').adjusted).toBe(false);
  });

  it('잘못된 형식(YYYY-MM-DD가 아님)이면 변경 없음', () => {
    expect(rolloverTargetRddYear('26-02-17', null, TODAY).adjusted).toBe(false);
    expect(rolloverTargetRddYear('2026/02/17', null, TODAY).adjusted).toBe(false);
  });

  it('존재하지 않는 날짜(평년의 2/29 — 2026-02-29)이면 보정하지 않는다(원본 자체가 무효)', () => {
    const r = rolloverTargetRddYear('2026-02-29', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2026-02-29');
  });

  it('후보가 달력에 없는 경우(윤년 2024-02-29 → 다음 해 2025-02-29는 존재하지 않음)이면 보정하지 않는다', () => {
    const r = rolloverTargetRddYear('2024-02-29', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-02-29');
  });

  it('경계: 원래 연도가 2년 이상 이전이라 +1년을 해도 여전히 오늘 이전이면 보정하지 않는다(작성일 없음, 2년 이상 보정 금지)', () => {
    // +1년 하면 2025-02-17이 되는데, 오늘(2026-10-14) 기준 여전히 과거라 보정하지 않는다.
    const r = rolloverTargetRddYear('2024-02-17', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-02-17');
  });

  it('경계: 보정 결과가 기준일과 정확히 같아지는 경우도 보정하지 않는다(엄격히 기준일보다 미래여야 함)', () => {
    // +1년 하면 정확히 오늘(2026-10-14)이 되는 경우 — "오늘 당일"은 여전히 의심 대상이라 보정하지 않는다.
    const r = rolloverTargetRddYear('2025-10-14', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2025-10-14');
  });
});
