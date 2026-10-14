import { rolloverTargetRddYear } from './target-rdd-year-rollover.util';

// PR-190 보강: 기준을 "작성일보다 이른가"에서 "오늘(한국시간)보다 이른가"로 단순화했다.
// 모든 테스트에서 오늘은 2026-10-14로 고정한다(보고서/실사례와 동일한 기준일).
const TODAY = '2026-10-14';

describe('rolloverTargetRddYear (PR-190 보강 — 오늘 기준)', () => {
  it('실사례: 작성일 2026-01-01, 납기 2026-02-17(오늘 2026-10-14 기준 이미 지난 날짜) → 2027-02-17로 보정', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17' });
  });

  it('작성일이 달라도(2026-07-01) 오늘 기준으로 지난 날짜면 똑같이 보정된다 — 작성일은 더 이상 기준이 아니다', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17' });
  });

  it('납기가 이미 다음 해(2027-02-17)로 미래면 변경 없음', () => {
    const r = rolloverTargetRddYear('2027-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: false, original: null });
  });

  it('납기가 오늘보다 아직 미래(2026-12-30)면 작성일보다 이르더라도 변경 없음(의도된 변화)', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-01-01', TODAY);
    expect(r).toEqual({ targetRdd: '2026-12-30', adjusted: false, original: null });
  });

  it('납기 == 오늘(당일)이면 변경 없음', () => {
    const r = rolloverTargetRddYear(TODAY, null, TODAY);
    expect(r).toEqual({ targetRdd: TODAY, adjusted: false, original: null });
  });

  it('납기 == 작성일이면 오늘보다 과거라도 보정하지 않는다(작성일을 납기로 잘못 인식한 PR-158 패턴 — 의심 경고로만 알림)', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-02-17', TODAY);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null });
  });

  it('작성일이 null이어도 오늘 기준으로 지난 날짜면 보정된다', () => {
    const r = rolloverTargetRddYear('2026-02-17', null, TODAY);
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17' });
  });

  it('targetRdd가 없으면 변경 없음(null 그대로)', () => {
    const r = rolloverTargetRddYear(null, '2026-07-01', TODAY);
    expect(r).toEqual({ targetRdd: null, adjusted: false, original: null });
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

  it('경계: 원래 연도가 2년 이상 이전이라 +1년을 해도 여전히 오늘 이전이면 보정하지 않는다(2년 이상 보정 금지)', () => {
    // +1년 하면 2025-02-17이 되는데, 오늘(2026-10-14) 기준 여전히 과거라 보정하지 않는다.
    const r = rolloverTargetRddYear('2024-02-17', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-02-17');
  });

  it('경계: 보정 결과가 오늘과 정확히 같아지는 경우도 보정하지 않는다(엄격히 오늘보다 미래여야 함)', () => {
    // +1년 하면 정확히 오늘(2026-10-14)이 되는 경우 — "오늘 당일"은 여전히 의심 대상이라 보정하지 않는다.
    const r = rolloverTargetRddYear('2025-10-14', null, TODAY);
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2025-10-14');
  });
});
