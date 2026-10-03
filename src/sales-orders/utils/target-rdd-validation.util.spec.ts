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
});
