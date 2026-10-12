// PR-190: 작업지시서 납기(targetRdd)에 연도가 없는 경우(예: "2/17") AI가 문서 작성일
// (documentDate)과 같은 연도를 붙이는데, 그 결과 납기가 작성일보다 이전이 되는 오인식이
// 실사례로 확인됐다(MB74BLM107: 작성일 2026-07-01, 납기 2026-02-17로 인식). 도메인 규칙
// (제시님 확인): 납기는 항상 작성일 이후이므로, 월/일이 작성일보다 앞서면 다음 해의
// 날짜다. 프롬프트 지시만으로는 재발을 막을 수 없어(PR-158과 같은 이유) 코드로 결정적으로
// 보정한다 — isSuspiciousTargetRdd와 같은 "YYYY-MM-DD 문자열은 사전식 비교가 날짜 비교와
// 같다"는 전제를 그대로 쓴다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 형식(YYYY-MM-DD)뿐 아니라 실제 달력에 존재하는 날짜인지도 확인한다(윤년 2/29 등) —
// Date는 범위를 벗어난 값을 다음 달/해로 "굴려버리므로" 역산해 원래 입력과 같은지로 검증한다.
function isValidIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export interface TargetRddRolloverResult {
  // 보정이 적용됐으면 보정된 값, 아니면 입력받은 targetRdd 그대로(둘 다 null일 수 있음).
  targetRdd: string | null;
  adjusted: boolean;
  // 보정 전 원래 값 — adjusted=true일 때만 채워진다(화면 안내 "원래 인식값"에 쓰인다).
  original: string | null;
}

const NO_CHANGE = (targetRdd: string | null): TargetRddRolloverResult => ({ targetRdd, adjusted: false, original: null });

export function rolloverTargetRddYear(
  targetRdd: string | null,
  documentDate: string | null,
): TargetRddRolloverResult {
  if (!targetRdd || !documentDate) return NO_CHANGE(targetRdd);
  if (!isValidIsoDate(targetRdd) || !isValidIsoDate(documentDate)) return NO_CHANGE(targetRdd);

  // 규칙 3: 납기 == 작성일은 "작성일을 납기로 잘못 인식"한 PR-158 실사례 패턴이므로
  // 절대 보정하지 않는다(보정하면 그 오인식을 더 그럴듯하게 감춰버린다) — 의심 경고로만 알린다.
  if (targetRdd === documentDate) return NO_CHANGE(targetRdd);

  // 규칙 2: targetRdd가 documentDate보다 "엄격히" 이를 때만 보정 대상 — 이미 미래면 손대지 않는다.
  if (targetRdd > documentDate) return NO_CHANGE(targetRdd);

  const [y, m, d] = targetRdd.split('-').map(Number);
  const nextYear = y + 1;
  const candidate = `${String(nextYear).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // 보정은 +1년 한 번만 — 그래도 달력에 없으면(2/29 → 다음 해가 평년) 보정하지 않는다.
  if (!isValidIsoDate(candidate)) return NO_CHANGE(targetRdd);

  // 보정은 +1년 한 번만 — 그래도 작성일 이후가 안 되면(원래 연도가 작성일보다 2년 이상
  // 이전인 경우 등) 억지로 더 보정하지 않고 그대로 둔다(의심 플래그로 계속 걸러진다).
  if (candidate <= documentDate) return NO_CHANGE(targetRdd);

  return { targetRdd: candidate, adjusted: true, original: targetRdd };
}
