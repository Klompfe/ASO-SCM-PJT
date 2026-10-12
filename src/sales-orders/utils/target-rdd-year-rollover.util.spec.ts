import { rolloverTargetRddYear } from './target-rdd-year-rollover.util';

describe('rolloverTargetRddYear (PR-190)', () => {
  it('실사례: 작성일 2026-07-01, 납기 2026-02-17(연도 없이 적힌 "2/17"을 AI가 작성일 연도로 채움) → 2027-02-17로 보정', () => {
    const r = rolloverTargetRddYear('2026-02-17', '2026-07-01');
    expect(r).toEqual({ targetRdd: '2027-02-17', adjusted: true, original: '2026-02-17' });
  });

  it('납기가 이미 작성일보다 미래면 그대로 둔다', () => {
    const r = rolloverTargetRddYear('2026-12-30', '2026-07-01');
    expect(r).toEqual({ targetRdd: '2026-12-30', adjusted: false, original: null });
  });

  it('납기 == 작성일이면 보정하지 않는다(작성일을 납기로 잘못 인식한 패턴 — 의심 경고로만 알림)', () => {
    const r = rolloverTargetRddYear('2026-07-01', '2026-07-01');
    expect(r).toEqual({ targetRdd: '2026-07-01', adjusted: false, original: null });
  });

  it('documentDate가 없으면 변경 없음', () => {
    const r = rolloverTargetRddYear('2026-02-17', null);
    expect(r).toEqual({ targetRdd: '2026-02-17', adjusted: false, original: null });
  });

  it('targetRdd가 없으면 변경 없음(null 그대로)', () => {
    const r = rolloverTargetRddYear(null, '2026-07-01');
    expect(r).toEqual({ targetRdd: null, adjusted: false, original: null });
  });

  it('잘못된 형식(YYYY-MM-DD가 아님)이면 변경 없음', () => {
    expect(rolloverTargetRddYear('26-02-17', '2026-07-01').adjusted).toBe(false);
    expect(rolloverTargetRddYear('2026/02/17', '2026-07-01').adjusted).toBe(false);
    expect(rolloverTargetRddYear('2026-02-17', '26-07-01').adjusted).toBe(false);
  });

  it('존재하지 않는 날짜(평년의 2/29)이면 보정하지 않는다(형식은 맞지만 달력에 없음)', () => {
    // 2026년은 평년이라 2026-02-29는 애초에 존재하지 않는 날짜 — 원본 자체가 무효.
    const r = rolloverTargetRddYear('2026-02-29', '2026-07-01');
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2026-02-29');
  });

  it('윤년 2/29 납기인데 다음 해가 평년이라 2/29가 없으면 보정하지 않는다(의심 표시는 유지되는 영역)', () => {
    // 2024-02-29는 실제 존재(윤년). 작성일이 같은 해 더 늦은 날짜라 보정 대상이지만, 2025년엔 2/29가 없다.
    const r = rolloverTargetRddYear('2024-02-29', '2024-07-01');
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-02-29');
  });

  it('작성일 2026-12-20, 납기 2026-01-05 → 2027-01-05로 보정', () => {
    const r = rolloverTargetRddYear('2026-01-05', '2026-12-20');
    expect(r).toEqual({ targetRdd: '2027-01-05', adjusted: true, original: '2026-01-05' });
  });

  it('경계: 원래 연도가 작성일보다 2년 이상 이전이라 +1년을 해도 여전히 작성일 이전이면 보정하지 않는다(2년 이상 보정 금지)', () => {
    // documentDate=2026-07-01, targetRdd=2024-07-01(같은 월/일, 2년 전) → +1년 해도 2025-07-01로 여전히 작성일 이전.
    const r = rolloverTargetRddYear('2024-07-01', '2026-07-01');
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2024-07-01');
  });

  it('보정 결과가 작성일과 정확히 같아지는 경계도 보정하지 않는다(규칙 3과 동일한 이유)', () => {
    // documentDate=2026-07-01, targetRdd=2025-07-01 → +1년 하면 2026-07-01(documentDate와 동일) → 보정 안 함.
    const r = rolloverTargetRddYear('2025-07-01', '2026-07-01');
    expect(r.adjusted).toBe(false);
    expect(r.targetRdd).toBe('2025-07-01');
  });
});
