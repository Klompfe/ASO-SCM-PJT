import { rolloverTargetRddYear } from './target-rdd-year-rollover.util';

// PR-201(운영 화면 확인): 기준을 "항상 오늘(한국시간)"에서 "작성일이 신뢰 가능하면
// 작성일, 아니면 오늘"로 되돌렸다 — 작성일이 과거인 작지(보관/시험 문서)는 납기도
// 오늘보다 과거일 수 있는데, 기준이 늘 오늘이면 그런 정상 문서의 납기를 억지로
// 다음 해로 밀어올려 버린다(실사례: 작성일 2025-09-08, 납기 2026-03-17 → 오늘보다
// 이르다는 이유로 2027년으로 보정된 것이 잘못임이 확인됨).
//
// PR-201d(운영 화면 확인): 값을 안 바꿨어도 납기가 오늘보다 과거면 반드시 notice가
// 채워진다('past-kept') — "값은 안 바꿨고 조용히 넘어간" 경우가 생기지 않게 한다.
// 모든 테스트에서 오늘은 2026-10-14로 고정한다.
const TODAY = '2026-10-14';

describe('rolloverTargetRddYear (PR-201 — 기준을 작성일로 되돌림)', () => {
  // PR-190 실사례(MB74BLM107)였던 케이스 — 작성일 2026-01-01이 의심스럽지 않으므로
  // 이제는 작성일을 기준으로 삼는다. 납기 2026-02-17은 작성일보다 뒤(=문서 자체로는
  // 정상적인 근거리 납기)라 더 이상 보정하지 않는다(조회 시점이 나중이라도). PR-201d부터
  // 는 값을 안 바꿔도 오늘보다 과거이므로 notice='past-kept'가 붙는다.
  it('작성일이 신뢰 가능하고 납기가 작성일보다 뒤면 — 보정하지 않지만 오늘보다 과거라 past-kept 안내', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null, basis: null, notice: 'past-kept' });
  });

  // PR-201 배경 실사례 패턴: 작성일이 과거(보관 문서)이고 납기가 작성일 이후·오늘
  // 이전이면 정상이므로 보정하지 않는다(값은 그대로, 대신 past-kept 안내).
  it('작성일 과거 + 납기가 작성일 이후·오늘 이전 → 보정 없음 + past-kept 안내', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-08', TODAY);
    expect(r).toEqual({ targetRdd: '2026-03-17', adjusted: false, original: null, basis: null, notice: 'past-kept' });
  });

  // 작성일이 신뢰 가능하고 납기가 "작성일보다 이르면"(연도 없는 납기에 같은 해를 붙였더니
  // 작성일보다 앞선 날짜가 된 경우) 작성일 기준으로 +1년을 시도한다.
  it('작성일 있고 납기가 작성일보다 이르면 — 작성일 기준으로 +1년 시도, basis=DOCUMENT_DATE, notice=bumped-written', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'DOCUMENT_DATE', notice: 'bumped-written' });
  });

  it('납기가 이미 다음 해(2027-02-17)로 미래면 변경 없음, 안내 없음', () => {
    const r = rolloverTargetRddYear('2027-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: false, original: null, basis: null, notice: 'none' });
  });

  it('납기가 작성일 이후면(기존 "의도된 변화" 케이스) 보정하지 않는다 — 이 경우 오늘보다도 미래라 안내 없음', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-12-30', adjusted: false, original: null, basis: null, notice: 'none' });
  });

  it('납기 == 오늘(당일)이고 작성일이 없으면 변경 없음, 안내 없음', () => {
    const r = rolloverTargetRddYear(TODAY, null, TODAY);
    expect(r).toEqual({ targetRdd: TODAY, adjusted: false, original: null, basis: null, notice: 'none' });
  });

  // 경계: 납기==작성일(PR-158 패턴) — 이 예외 분기도 "오늘보다 과거면 안내" 불변식을
  // 똑같이 적용받는다(의심 경고(targetRddSuspicious)와는 별개의 안내).
  it('납기 == 작성일이면 보정하지 않는다(PR-158 패턴, 경계) — 오늘보다 과거라 past-kept 안내', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null, basis: null, notice: 'past-kept' });
  });

  // 작성일이 없으면 기존 동작 그대로(오늘 기준) — 성공하면 notice=bumped-today.
  it('작성일이 없으면(null) 오늘 기준으로 지난 날짜면 보정된다 — basis=TODAY, notice=bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  // 작성일이 의심스러운 날짜(미래 또는 18개월 초과 과거)면 신뢰할 수 없으므로 오늘을
  // 기준으로 쓴다(기존 동작 유지).
  it('작성일이 18개월 초과 과거(의심스러움)이면 오늘을 기준으로 쓴다 — basis=TODAY, notice=bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2020-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('작성일이 미래(의심스러움)여도 오늘을 기준으로 쓴다 — basis=TODAY, notice=bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2027-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('targetRdd가 없으면 변경 없음(null 그대로), 안내 없음', () => {
    const r = rolloverTargetRddYear(null, '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: null, adjusted: false, original: null, basis: null, notice: 'none' });
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

  // 경계: 원래 연도가 2년 이상 이전이라 +1년을 해도 여전히 오늘 이전이면 보정하지 않는다
  // (작성일 없음, 2년 이상 보정 금지) — PR-201d부터는 보정 시도가 실패해 그대로 과거로
  // 남으므로 notice='past-kept'가 붙는다(불변식: d<오늘인데 안내 없는 경우가 없어야 함).
  it('경계: 2년 이상 이전이라 +1년을 해도 여전히 오늘 이전이면 보정하지 않지만 past-kept 안내는 붙는다', () => {
    // +1년 하면 2025-02-17이 되는데, 오늘(2026-10-14) 기준 여전히 과거라 값은 안 바뀐다.
    const r = rolloverTargetRddYear('2024-02-17', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-02-17');
    expect(r.notice).toBe('past-kept');
  });

  it('경계: 보정 결과가 기준일과 정확히 같아지는 경우도 보정하지 않는다(엄격히 기준일보다 미래여야 함) — past-kept 안내', () => {
    // +1년 하면 정확히 오늘(2026-10-14)이 되는 경우 — "오늘 당일"은 여전히 의심 대상이라 보정하지 않는다.
    const r = rolloverTargetRddYear('2025-10-14', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2025-10-14');
    expect(r.notice).toBe('past-kept');
  });
});

// PR-201d: PR-201c의 합성 입력 ③에서 확인된 사각지대(작성일이 한 해 앞서 잘못 읽히고
// 납기가 그 뒤인 경우, 작성일 기준으로는 "정상"이라 아무 안내 없이 넘어감)를 메운다.
describe('rolloverTargetRddYear (PR-201d — 오늘보다 과거인 납기는 반드시 안내)', () => {
  const TODAY2 = '2026-10-24';

  it('d >= t: 안내 없음', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY2);
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('none');
  });

  it('w 정상, d가 w 이후이고 오늘보다 과거 → 값 유지 + past-kept 안내', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-08', TODAY2);
    expect(r.targetRdd).toBe('2026-03-17');
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('past-kept');
  });

  // ③ 배경의 핵심 시나리오: 작성일이 한 해 앞서 잘못 읽힘(실제 2026-09인데 2025-09로
  // 읽힘), 납기 2026-03 — 조용히 통과하지 않고 past-kept 안내가 뜬다.
  it('③ w가 한 해 앞서 잘못 읽힘(2025-09), d=2026-03 → 값 유지 + past-kept 안내(조용히 통과 안 함)', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-01', TODAY2);
    expect(r.targetRdd).toBe('2026-03-17');
    expect(r.adjusted).toBe(false);
    expect(r.basis).toBeNull();
    expect(r.notice).toBe('past-kept');
  });

  it('w가 없음, d < t → 기존 PR-190 동작(+1 시도), notice=bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY2);
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  it('w가 의심 날짜(4~5년 전), d < t → 기존 PR-190 동작(+1 시도는 실패, past-kept로 안내)', () => {
    const r = rolloverTargetRddYear('2021-02-17', '2021-01-01', TODAY2);
    // +1년(2022-02-17)해도 여전히 오늘 이전이라 2년 이상 보정 금지 규칙에 걸려 값은 안 바뀐다.
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2021-02-17');
    expect(r.notice).toBe('past-kept');
  });

  it('d < w (w 정상) → PR-201 동작 유지(작성일 기준 +1 시도), notice=bumped-written', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY2);
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('DOCUMENT_DATE');
    expect(r.notice).toBe('bumped-written');
  });

  it('경계: d = t → 안내 없음', () => {
    const r = rolloverTargetRddYear(TODAY2, null, TODAY2);
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('none');
  });

  it('경계: d = w → 보정하지 않음(PR-158 패턴), 오늘보다 과거면 past-kept', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY2);
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('past-kept');
  });
});
