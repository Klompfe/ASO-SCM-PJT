// AllExceptionsFilter가 HttpException.getResponse()를 그대로 message에 담기 때문에,
// 에러 응답의 message가 문자열이 아니라 {statusCode, message, error} 객체이거나
// class-validator 에러 배열(string[])인 경우가 있다. 이를 그대로 JSX에 렌더링하면
// "Objects are not valid as a React child" 크래시가 난다(PR-037에서 발견).
export const getErrorMessage = (err: any, fallback: string): string => {
  const raw = err?.response?.data?.message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join(', ');
  if (raw && typeof raw === 'object') {
    // ValidationPipe가 던지는 class-validator 에러는 {message: string[], error, statusCode}
    // 형태라, AllExceptionsFilter를 거치면 raw.message가 문자열이 아니라 배열이 된다
    // (PR-062에서 발견 — 이 경우 기존 코드는 아래로 빠져 fallback만 보여줬다).
    if (typeof raw.message === 'string') return raw.message;
    if (Array.isArray(raw.message)) return raw.message.join(', ');
  }
  return fallback;
};
