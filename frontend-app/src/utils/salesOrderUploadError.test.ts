import { describe, it, expect } from 'vitest';
import { classifyUploadFailureCause, buildUploadFailureInfo, resolveUploadFailureToastMessage } from './salesOrderUploadError';

describe('classifyUploadFailureCause (PR-192)', () => {
  it('HTTP 503이면 SERVER_BUSY로 분류한다', () => {
    expect(classifyUploadFailureCause({ response: { status: 503 } })).toBe('SERVER_BUSY');
  });

  it('HTTP 504면 TIMEOUT으로 분류한다', () => {
    expect(classifyUploadFailureCause({ response: { status: 504 } })).toBe('TIMEOUT');
  });

  it('HTTP 422면 TRUNCATED로 분류한다', () => {
    expect(classifyUploadFailureCause({ response: { status: 422 } })).toBe('TRUNCATED');
  });

  it('axios 타임아웃(ECONNABORTED)이면 응답이 있어도 TIMEOUT으로 분류한다', () => {
    expect(classifyUploadFailureCause({ code: 'ECONNABORTED', response: undefined })).toBe('TIMEOUT');
  });

  it('응답 자체가 없는 네트워크 오류면 TIMEOUT으로 분류한다', () => {
    expect(classifyUploadFailureCause({ message: 'Network Error' })).toBe('TIMEOUT');
  });

  it('그 외 상태코드(예: 500)면 UNKNOWN으로 분류한다', () => {
    expect(classifyUploadFailureCause({ response: { status: 500 } })).toBe('UNKNOWN');
  });
});

describe('buildUploadFailureInfo (PR-192)', () => {
  it('원인 라벨·다음 행동·시도 시각·경과초를 모두 담는다', () => {
    const triedAt = new Date('2026-10-13T10:00:00+09:00');
    const info = buildUploadFailureInfo({ response: { status: 503 } }, triedAt, 42);
    expect(info.cause).toBe('SERVER_BUSY');
    expect(info.causeLabel).toBe('AI 서버 혼잡(503)');
    expect(info.nextAction).toContain('1~2분 뒤 다시 시도');
    expect(info.elapsedSec).toBe(42);
    expect(info.triedAt).toBeTruthy();
  });
});

describe('resolveUploadFailureToastMessage (PR-192)', () => {
  it('서버 메시지가 있으면 그대로 우선한다', () => {
    expect(resolveUploadFailureToastMessage('SERVER_BUSY', 'AI 서버가 일시적으로 혼잡합니다.')).toBe('AI 서버가 일시적으로 혼잡합니다.');
  });

  it('서버 메시지가 없으면(빈 문자열) 원인별 안내로 대체한다', () => {
    const message = resolveUploadFailureToastMessage('TIMEOUT', '');
    expect(message).toContain('5페이지 이하로 나눠');
  });
});
