import { describe, it, expect } from 'vitest';
import { describeApprovalFailure, resolveUploadReviewStatus, buildFailureCopyText, applyApprovalOutcomes } from './uploadReviewStatus';

describe('describeApprovalFailure (PR-237)', () => {
  it('서버 응답이 전혀 없으면(네트워크/서버 문제) network로 분류하고 "잠시 후 다시 시도"를 안내한다', () => {
    const r = describeApprovalFailure(new Error('Network Error'));
    expect(r.kind).toBe('network');
    expect(r.message).toContain('잠시 후 다시 시도');
  });

  it('PR-236이 이미 한글로 번역해 둔 문구는 그대로 쓴다(validation)', () => {
    const err = { response: { data: { message: "14번째 자재 행의 '색상' 값이 올바르지 않습니다" } } };
    const r = describeApprovalFailure(err);
    expect(r.kind).toBe('validation');
    expect(r.message).toBe("14번째 자재 행의 '색상' 값이 올바르지 않습니다");
  });

  it('영문 bomItems.N.field must be 패턴이 새면(안전망) 한글로 번역한다', () => {
    const err = { response: { data: { message: 'bomItems.13.colorOf must be a string' } } };
    const r = describeApprovalFailure(err);
    expect(r.kind).toBe('validation');
    expect(r.message).toBe("14번째 자재 행의 '색상' 값이 올바르지 않습니다");
  });

  it('알 수 없는 오류는 unknown으로 분류하고 원문을 detail에 담는다(자세히 펼침용)', () => {
    const err = { response: { data: { message: '합성-알수없는-오류-문구' } } };
    const r = describeApprovalFailure(err);
    expect(r.kind).toBe('unknown');
    expect(r.message).toBe('저장 중 오류가 발생했습니다');
    expect(r.detail).toBe('합성-알수없는-오류-문구');
  });
});

describe('resolveUploadReviewStatus (PR-237)', () => {
  it('파싱 실패가 가장 먼저 판단된다', () => {
    expect(resolveUploadReviewStatus({ parseError: '파싱 실패', approvalFailure: null, alreadyRegistered: true })).toBe('parseFailed');
  });

  it('승인 실패가 이미 등록됨보다 먼저 판단된다', () => {
    expect(resolveUploadReviewStatus({ approvalFailure: { kind: 'unknown', message: 'x' }, alreadyRegistered: true })).toBe('approvalFailed');
  });

  it('이미 등록된 스타일은 alreadyRegistered', () => {
    expect(resolveUploadReviewStatus({ alreadyRegistered: true })).toBe('alreadyRegistered');
  });

  it('아무 조건도 없으면 pending(확인 대기)', () => {
    expect(resolveUploadReviewStatus({ alreadyRegistered: false })).toBe('pending');
  });
});

describe('buildFailureCopyText (PR-237)', () => {
  it('스타일번호와 이유만 담고, 업무 데이터(자재명·수량 등)는 포함하지 않는다', () => {
    const text = buildFailureCopyText([
      { styleNo: 'SYN-STYLE-001', reason: "14번째 자재 행의 '색상' 값이 올바르지 않습니다" },
      { styleNo: 'SYN-STYLE-002', reason: '서버 응답이 없습니다' },
    ]);
    expect(text).toBe(
      "SYN-STYLE-001 — 승인 실패: 14번째 자재 행의 '색상' 값이 올바르지 않습니다\n" +
      'SYN-STYLE-002 — 승인 실패: 서버 응답이 없습니다',
    );
  });

  it('빈 목록이면 빈 문자열', () => {
    expect(buildFailureCopyText([])).toBe('');
  });
});

// PR-237: 재현 — 사용자가 겪은 문제는 "실패한 스타일이 목록에서 사라짐"이었다. 이
// 함수가 실패 스타일을 목록에 남기고, 성공 스타일만 지우는지 직접 확인한다.
describe('applyApprovalOutcomes (PR-237)', () => {
  const styles = [{ sheetName: 'S1' }, { sheetName: 'S2' }, { sheetName: 'S3' }];
  const failReason = { kind: 'validation' as const, message: "14번째 자재 행의 '색상' 값이 올바르지 않습니다" };

  it('재현: 실패한 스타일(S2)은 목록에서 사라지지 않고, 성공한 스타일(S1)만 지워진다', () => {
    const { styles: next, failuresBySheet } = applyApprovalOutcomes(
      styles, {},
      [{ sheetName: 'S1', outcome: { success: true } }, { sheetName: 'S2', outcome: { success: false, reason: failReason } }],
    );
    expect(next.map((s) => s.sheetName)).toEqual(['S2', 'S3']);
    expect(failuresBySheet).toEqual({ S2: failReason });
  });

  it('재시도 후 성공하면 목록에서 지워지고 실패 기록도 함께 지워진다', () => {
    const { styles: next, failuresBySheet } = applyApprovalOutcomes(
      [{ sheetName: 'S2' }, { sheetName: 'S3' }],
      { S2: failReason },
      [{ sheetName: 'S2', outcome: { success: true } }],
    );
    expect(next.map((s) => s.sheetName)).toEqual(['S3']);
    expect(failuresBySheet).toEqual({});
  });

  it('건드리지 않은 스타일의 기존 실패 기록은 그대로 남는다', () => {
    const { failuresBySheet } = applyApprovalOutcomes(styles, { S3: failReason }, [{ sheetName: 'S1', outcome: { success: true } }]);
    expect(failuresBySheet).toEqual({ S3: failReason });
  });

  it('결과가 없으면(빈 배열) 아무것도 바뀌지 않는다', () => {
    const result = applyApprovalOutcomes(styles, { S1: failReason }, []);
    expect(result.styles).toEqual(styles);
    expect(result.failuresBySheet).toEqual({ S1: failReason });
  });
});
