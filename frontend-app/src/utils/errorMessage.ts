// AllExceptionsFilter가 HttpException.getResponse()를 그대로 message에 담기 때문에,
// 에러 응답의 message가 문자열이 아니라 {statusCode, message, error} 객체이거나
// class-validator 에러 배열(string[])인 경우가 있다. 이를 그대로 JSX에 렌더링하면
// "Objects are not valid as a React child" 크래시가 난다(PR-037에서 발견).
export const getErrorMessage = (err: any, fallback: string): string => {
  const raw = err?.response?.data?.message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join(', ');
  if (raw && typeof raw === 'object' && typeof raw.message === 'string') return raw.message;
  return fallback;
};
