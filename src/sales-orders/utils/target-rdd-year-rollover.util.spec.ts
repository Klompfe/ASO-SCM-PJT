import { rolloverTargetRddYear } from './target-rdd-year-rollover.util';

// PR-201(운영 화면 확인): 기준을 "항상 오늘(한국시간)"에서 "작성일이 신뢰 가능하면
// 작성일, 아니면 오늘"로 되돌렸다 — 작성일이 과거인 작지(보관/시험 문서)는 납기도
// 오늘보다 과거일 수 있는데, 기준이 늘 오늘이면 그런 정상 문서의 납기를 억지로
// 다음 해로 밀어올려 버린다.
//
// PR-207(사용자 결정, 이번 PR): "이 업무에서 새로 올리는 작지의 납기는 항상 미래다."
// 1단계(작성일 기준 보정)는 그대로 두되, 그 결과가 여전히 오늘보다 과거이면 2단계가
// 월/일을 유지한 채 "오늘 이상이 되는 가장 작은 연도"까지 끝까지 올린다. 이 때문에
// PR-201/201d가 만들던 'past-kept'(값을 그대로 두고 안내만 띄움)는 더 이상 나오지
// 않는다 — 아래 테스트들을 전부 'bumped-today'/'bumped-written' 기대값으로 고쳤다.
// 또한 작성일 의심 기준이 18개월→12개월로 좁혀져(vision-guardrails.util.ts, PR-207),
// 일부 테스트는 그 때문에 basis 자체가 DOCUMENT_DATE→TODAY로도 바뀐다(아래 각주 참고).
// 모든 테스트에서 오늘은 2026-10-14로 고정한다.
const TODAY = '2026-10-14';

describe('rolloverTargetRddYear (PR-201 — 작성일 기준 1단계는 유지)', () => {
  // PR-190 실사례(MB74BLM107)였던 케이스. 작성일 2026-01-01은 여전히 신뢰 가능해
  // 1단계는 "납기가 작성일보다 뒤"라 보정하지 않는다. 하지만 PR-207부터는 그 결과가
  // 오늘(2026-10-14)보다 과거이므로 2단계가 오늘 기준으로 다음 해까지 올린다.
  it('[PR-207로 바뀜] 작성일 기준 1단계는 보정 안 함 → 2단계가 오늘 기준으로 끝까지 올린다 — bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  // PR-207: 작성일 2025-09-08은 오늘(2026-10-14) 기준 12개월(2025-10-14) 넘게 과거라
  // 이제는 의심스러운 날짜로 분류된다(18개월 기준이었던 PR-201 시절에는 신뢰 가능이었다)
  // — basis가 DOCUMENT_DATE→TODAY로 바뀌어 오늘 기준으로 다음 해까지 올라간다.
  it('[PR-207로 바뀜] 작성일이 12개월 넘게 과거(의심)라 오늘 기준으로 전환, 끝까지 올림 — bumped-today', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-08', TODAY);
    expect(r).toEqual({ targetRdd: '2027-03-17', adjusted: true, original: '2026-03-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  // 작성일이 신뢰 가능하고 납기가 "작성일보다 이르면" 작성일 기준으로 +1년 — 결과가
  // 이미 오늘보다 미래라 2단계가 더 손대지 않는다(변경 없음).
  it('작성일 있고 납기가 작성일보다 이르면 — 작성일 기준으로 +1년, basis=DOCUMENT_DATE, notice=bumped-written', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'DOCUMENT_DATE', notice: 'bumped-written' });
  });

  it('납기가 이미 다음 해(2027-02-17)로 미래면 변경 없음, 안내 없음', () => {
    const r = rolloverTargetRddYear('2027-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: false, original: null, basis: null, notice: 'none' });
  });

  it('납기가 작성일 이후이고 오늘보다도 미래면 보정하지 않는다 — 안내 없음(변경 없음)', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-12-30', adjusted: false, original: null, basis: null, notice: 'none' });
  });

  it('납기 == 오늘(당일)이고 작성일이 없으면 변경 없음, 안내 없음', () => {
    const r = rolloverTargetRddYear(TODAY, null, TODAY);
    expect(r).toEqual({ targetRdd: TODAY, adjusted: false, original: null, basis: null, notice: 'none' });
  });

  // 경계: 납기==작성일(PR-158 패턴) — 1단계는 여전히 보정하지 않지만(의심 경고는 별개로
  // isSuspiciousTargetRdd가 계속 잡는다), PR-207부터는 "오늘보다 과거면 항상 올린다"는
  // 불변식이 이 예외에도 똑같이 적용된다 — past-kept가 아니라 bumped-today가 된다.
  it('[PR-207로 바뀜] 납기 == 작성일(PR-158 패턴)이어도 오늘보다 과거면 끝까지 올린다 — bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  // 작성일이 없으면 기존 동작 그대로(오늘 기준) — 변경 없음.
  it('작성일이 없으면(null) 오늘 기준으로 지난 날짜면 보정된다 — basis=TODAY, notice=bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('작성일이 12개월 초과 과거(의심스러움)이면 오늘을 기준으로 쓴다 — basis=TODAY, notice=bumped-today', () => {
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

  it('존재하지 않는 날짜(평년의 2/29 — 2026-02-29)이면 원본 자체가 무효라 보정하지 않는다', () => {
    const r = rolloverTargetRddYear('2026-02-29', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2026-02-29');
  });

  // PR-207: 2024-02-29(유효, 윤년)는 1단계가 +1년(2025-02-29, 평년이라 무효)에 실패해도
  // 2단계가 "2/29가 존재하는 가장 가까운 미래 연도"까지 계속 찾는다 — 2028년(윤년)까지
  // 건너뛰어 그 해로 확정한다.
  it('[PR-207 신규] 2/29(윤년) 보정 — 다음 2/29가 존재하는 연도(2028)까지 건너뛴다', () => {
    const r = rolloverTargetRddYear('2024-02-29', null, TODAY);
    expect(r).toEqual({ targetRdd: '2028-02-29', adjusted: true, original: '2024-02-29', basis: 'TODAY', notice: 'bumped-today' });
  });

  // PR-207: 예전엔 "원래 연도가 2년 이상 이전이면 보정 금지"라는 별도 규칙이 있었는데,
  // 이번 PR로 그 규칙 자체가 없어졌다 — PR-190이 원래 의도했던 2027로의 보정이 복원된다.
  it('[PR-190 동작 복원] 2년 이상 이전이라도 오늘 이상이 될 때까지 끝까지 올린다 — bumped-today', () => {
    const r = rolloverTargetRddYear('2024-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2024-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('[PR-207로 바뀜] 보정 결과가 기준일과 정확히 같아지는 경우도 2단계가 오늘까지는 올린다 — bumped-today', () => {
    // 1단계는 "정확히 같음"은 엄격히 미래가 아니라며 포기하지만(기존 규칙 그대로),
    // 2단계는 "오늘 이상"이면 되므로 정확히 오늘(2026-10-14)로 올린다.
    const r = rolloverTargetRddYear('2025-10-14', null, TODAY);
    expect(r).toEqual({ targetRdd: '2026-10-14', adjusted: true, original: '2025-10-14', basis: 'TODAY', notice: 'bumped-today' });
  });
});

// PR-201d 배경이었던 사각지대(작성일이 한 해 앞서 잘못 읽히고 납기가 그 뒤인 경우)는
// PR-207에서 'past-kept' 자체가 없어지면서 전부 'bumped-today'로 바뀐다.
describe('rolloverTargetRddYear (PR-207 — 오늘보다 과거인 납기는 항상 미래로)', () => {
  const TODAY2 = '2026-10-24';

  it('d >= t: 안내 없음(변경 없음)', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY2);
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('none');
  });

  // [PR-207로 바뀜] 작성일 2025-09-08은 오늘(2026-10-24) 기준 12개월(2025-10-24) 넘게
  // 과거라 의심스러운 날짜로 바뀌어(18개월 기준이던 PR-201d 시절엔 신뢰 가능) basis가
  // TODAY로 전환되고, 그 결과 과거로 남지 않고 끝까지 올라간다.
  it('[PR-207로 바뀜] w가 12개월 넘게 과거(의심)로 바뀜 → 오늘 기준으로 끝까지 올림 — bumped-today', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-08', TODAY2);
    expect(r.targetRdd).toBe('2027-03-17');
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  // ③ 배경의 핵심 시나리오: 작성일이 한 해 앞서 잘못 읽힘(실제 2026-09인데 2025-09로
  // 읽힘) — 이것도 12개월 기준에서는 의심스러운 과거로 잡혀 오늘 기준으로 전환된다.
  it('[PR-207로 바뀜] ③ w가 한 해 앞서 잘못 읽힘(2025-09), d=2026-03 → 오늘 기준으로 끝까지 올림(조용히 과거로 안 남음)', () => {
    const r = rolloverTargetRddYear('2026-03-17', '2025-09-01', TODAY2);
    expect(r.targetRdd).toBe('2027-03-17');
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  it('w가 없음, d < t → 기존 PR-190 동작(+1 시도), notice=bumped-today(변경 없음)', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY2);
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  // [PR-207로 바뀜] 1단계(+1년 한 번)는 여전히 실패하지만(원래 연도가 5년 전이라
  // +1년으로는 모자람), 이번 PR부터는 2단계가 끝까지 올려 과거로 남지 않는다.
  it('[PR-207로 바뀜] w가 의심 날짜(4~5년 전), d < t → 1단계 실패해도 2단계가 끝까지 올림 — bumped-today', () => {
    const r = rolloverTargetRddYear('2021-02-17', '2021-01-01', TODAY2);
    expect(r.targetRdd).toBe('2027-02-17');
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  it('d < w (w 정상) → PR-201 동작 유지(작성일 기준 +1 시도), notice=bumped-written(변경 없음)', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY2);
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('DOCUMENT_DATE');
    expect(r.notice).toBe('bumped-written');
  });

  it('경계: d = t → 안내 없음(변경 없음)', () => {
    const r = rolloverTargetRddYear(TODAY2, null, TODAY2);
    expect(r.adjusted).toBe(false);
    expect(r.notice).toBe('none');
  });

  it('[PR-207로 바뀜] 경계: d = w → 1단계는 보정 안 함(PR-158 패턴)이지만 오늘보다 과거라 2단계가 끝까지 올린다 — bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY2);
    expect(r.adjusted).toBe(true);
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });
});

// PR-207이 지시서에서 명시적으로 요구한 합성 입력들 — 오늘 2026-10-26 고정.
describe('rolloverTargetRddYear (PR-207 — 지시서 합성 입력)', () => {
  const TODAY3 = '2026-10-26';

  it('납기 2/17(연도 2026, 작성일 없음) → 2027-02-17, bumped-today', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY3);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('납기 12/20(2026, 작성일 없음) → 변경 없음, none', () => {
    const r = rolloverTargetRddYear('2026-12-20', null, TODAY3);
    expect(r).toEqual({ targetRdd: '2026-12-20', adjusted: false, original: null, basis: null, notice: 'none' });
  });

  it('납기 == 오늘 → 변경 없음, none', () => {
    const r = rolloverTargetRddYear(TODAY3, null, TODAY3);
    expect(r).toEqual({ targetRdd: TODAY3, adjusted: false, original: null, basis: null, notice: 'none' });
  });

  // 작성일 2025-09-08 문서 — 납기의 연도를 2026 또는 2025로 읽은 두 경우 모두 2027-02-17로
  // 수렴해야 한다(작성일 자체가 12개월 넘게 과거라 의심스러워 오늘 기준으로 전환됨).
  it('작성일 2025-09-08 + 납기 2026-02-17 → 2027-02-17', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2025-09-08', TODAY3);
    expect(r.targetRdd).toBe('2027-02-17');
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  it('작성일 2025-09-08 + 납기 2025-02-17 → 2027-02-17(1단계는 2026에서 멈추지만 2단계가 더 올림)', () => {
    const r = rolloverTargetRddYear('2025-02-17', '2025-09-08', TODAY3);
    expect(r.targetRdd).toBe('2027-02-17');
    expect(r.basis).toBe('TODAY');
    expect(r.notice).toBe('bumped-today');
  });

  // 작성일을 한 해 앞서(미래로) 잘못 읽은 합성 — 작성일이 미래라 의심스러워 오늘
  // 기준으로 전환되고, 그 결과가 작성일 기준으로 그대로 두지 않는다는 것을 확인한다.
  it('작성일이 미래로 잘못 읽힘(2027-03-01) + 납기 2026-02-17 → 작성일 기준이 아니라 오늘 기준으로 2027-02-17', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2027-03-01', TODAY3);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17', basis: 'TODAY', notice: 'bumped-today' });
  });

  it('2/29(윤년) 합성 — 다음 2/29가 존재하는 연도(2028)까지 올린다', () => {
    const r = rolloverTargetRddYear('2024-02-29', null, TODAY3);
    expect(r).toEqual({ targetRdd: '2028-02-29', adjusted: true, original: '2024-02-29', basis: 'TODAY', notice: 'bumped-today' });
  });
});
