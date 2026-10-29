import { isSuspiciousTargetRdd } from './target-rdd-validation.util';

describe('isSuspiciousTargetRdd (PR-158)', () => {
  it('targetRdd가 documentDate보다 이전이면 의심스럽다(작성일을 납기로 잘못 인식한 실사례 패턴)', () => {
    expect(isSuspiciousTargetRdd('2026-06-22', '2026-06-22', '2026-01-01')).toBe(true);
    expect(isSuspiciousTargetRdd('2026-06-20', '2026-06-22', '2026-01-01')).toBe(true);
  });

  it('targetRdd가 오늘(분석 시점) 이전이거나 같으면 의심스럽다', () => {
    expect(isSuspiciousTargetRdd('2026-01-01', null, '2026-01-01')).toBe(true);
    expect(isSuspiciousTargetRdd('2025-12-31', null, '2026-01-01')).toBe(true);
  });

  it('targetRdd가 documentDate와 오늘 둘 다보다 미래면 의심스럽지 않다', () => {
    expect(isSuspiciousTargetRdd('2026-12-30', '2026-06-22', '2026-06-25')).toBe(false);
  });

  it('targetRdd가 null이면 검증 대상이 아니다(의심 아님)', () => {
    expect(isSuspiciousTargetRdd(null, '2026-06-22', '2026-06-25')).toBe(false);
  });

  it('documentDate가 null이어도 targetRdd가 오늘 이전이면 의심스럽다', () => {
    expect(isSuspiciousTargetRdd('2026-06-01', null, '2026-06-25')).toBe(true);
  });

  it('documentDate가 null이고 targetRdd가 오늘보다 미래면 의심스럽지 않다', () => {
    expect(isSuspiciousTargetRdd('2026-12-30', null, '2026-06-25')).toBe(false);
  });

  // PR-207: rolloverTargetRddYear가 과거 납기를 항상 미래로 올려버리므로, 보정된
  // targetRdd만으로는 "작성일을 납기로 잘못 읽음" 패턴(targetRdd==documentDate)이
  // 가려진다 — rawTargetRdd(보정 전 원본)로 판정해야 계속 잡힌다.
  it('[PR-207] 보정된 targetRdd가 documentDate와 달라도, 보정 전 원본이 documentDate와 같으면 여전히 의심스럽다', () => {
    expect(isSuspiciousTargetRdd('2027-06-22', '2026-06-22', '2026-10-14', '2026-06-22')).toBe(true);
  });

  it('[PR-207] rawTargetRdd를 안 주면 기존처럼 targetRdd 자체로 판정한다(호출 호환)', () => {
    expect(isSuspiciousTargetRdd('2026-06-22', '2026-06-22', '2026-01-01')).toBe(true);
    expect(isSuspiciousTargetRdd('2026-12-30', '2026-06-22', '2026-06-25')).toBe(false);
  });
});
