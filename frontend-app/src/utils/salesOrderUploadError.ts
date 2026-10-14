// PR-192: 작업지시서 업로드 AI 분석이 실패했을 때(Gemini 503 과부하, 타임아웃, 응답 잘림
// 등) 화면에 "결과 없이 멈춘 것처럼" 보이지 않도록, 실패 원인을 분류하고 안내 영역에
// 보여줄 내용을 만드는 순수 함수들. DOM 렌더 없이 유닛 테스트할 수 있게 컴포넌트 밖으로 뺐다.
export type UploadFailureCause = 'SERVER_BUSY' | 'TIMEOUT' | 'TRUNCATED' | 'UNKNOWN';

export interface UploadFailureInfo {
  cause: UploadFailureCause;
  causeLabel: string;
  nextAction: string;
  triedAt: string;
  elapsedSec: number;
}

const CAUSE_LABELS: Record<UploadFailureCause, string> = {
  SERVER_BUSY: 'AI 서버 혼잡(503)',
  TIMEOUT: '응답 시간 초과',
  TRUNCATED: '결과가 길어 잘림',
  UNKNOWN: '기타 오류',
};

const NEXT_ACTIONS: Record<UploadFailureCause, string> = {
  SERVER_BUSY: '파일 문제가 아니라 서버 혼잡이니 1~2분 뒤 다시 시도해 주세요.',
  TIMEOUT: '파일이 크거나 페이지가 많을 수 있습니다. 5페이지 이하로 나눠 다시 올려 주세요.',
  TRUNCATED: '페이지를 나눠 다시 올려 주세요.',
  UNKNOWN: '잠시 후 다시 시도해 주세요.',
};

// axios 에러(또는 그와 비슷한 shape)에서 HTTP 상태코드와 타임아웃 여부로 원인을 분류한다.
// 모르면(알 수 없는 상태코드 등) 추측하지 않고 UNKNOWN으로 둔다.
export function classifyUploadFailureCause(err: any): UploadFailureCause {
  if (err?.code === 'ECONNABORTED') return 'TIMEOUT';
  const status = err?.response?.status;
  if (status === 503) return 'SERVER_BUSY';
  if (status === 504) return 'TIMEOUT';
  if (status === 422) return 'TRUNCATED';
  if (status == null && !err?.response) return 'TIMEOUT'; // 응답 자체가 없는 네트워크 오류
  return 'UNKNOWN';
}

export function buildUploadFailureInfo(err: any, triedAt: Date, elapsedSec: number): UploadFailureInfo {
  const cause = classifyUploadFailureCause(err);
  return {
    cause,
    causeLabel: CAUSE_LABELS[cause],
    nextAction: NEXT_ACTIONS[cause],
    triedAt: triedAt.toLocaleTimeString('ko-KR'),
    elapsedSec,
  };
}

// 토스트에 쓸 문구 — 서버가 준 메시지(getErrorMessage로 이미 추출된 값)가 있으면 그것을
// 우선하고, 없으면(타임아웃처럼 응답 자체가 없는 경우) 원인별 안내로 대체한다.
export function resolveUploadFailureToastMessage(cause: UploadFailureCause, serverMessage: string): string {
  return serverMessage || `AI 분석 응답이 없습니다. ${NEXT_ACTIONS[cause]}`;
}
