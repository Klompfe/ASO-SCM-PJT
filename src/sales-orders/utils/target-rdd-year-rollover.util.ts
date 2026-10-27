// PR-190: 작업지시서 납기(targetRdd)에 연도가 없는 경우(예: "2/17") AI가 문서 작성일
// (documentDate)과 같은 연도를 붙이는데, 그 결과 납기가 지나버린 날짜가 되는 오인식이
// 실사례로 확인됐다(MB74BLM107: 작성일 2026-01-01, 납기 2026-02-17로 인식, 조회 시점
// 오늘은 2026-10-14라 이미 지난 날짜). 프롬프트 지시만으로는 재발을 막을 수 없어
// (PR-158과 같은 이유) 코드로 결정적으로 보정한다 — isSuspiciousTargetRdd와 같은
// "YYYY-MM-DD 문자열은 사전식 비교가 날짜 비교와 같다"는 전제를 그대로 쓴다.
//
// PR-190 보강: 최초 버전은 "납기 < 작성일"을 기준으로 보정했는데, 이 사례(작성일이
// 2026-01-01로 인식돼 납기 2026-02-17보다 더 이름)처럼 작성일 자체가 신뢰할 수 없는
// 값일 때는 전혀 보정되지 않는 사각지대가 있었다. 기준을 "오늘(한국시간) 날짜"로
// 단순화한다 — 작성일은 더 이상 보정 여부 판단에 쓰지 않고(값도 건드리지 않음),
// PR-158의 "작성일을 납기로 잘못 읽은" 패턴(targetRdd === documentDate)만 여전히
// 예외로 남겨 보정하지 않는다(보정하면 그 오인식을 감추게 되므로).

// PR-201: "오늘" 대신 작성일을 기준으로 쓸 수 있는지 판단하려면 작성일이 의심스러운
// 날짜(미래/18개월 초과 과거)인지 알아야 한다 — vision-guardrails.util.ts의 판정을
// 그대로 재사용한다(순수 함수, 순환 의존 없음).
import { checkDocumentDateSuspicious } from './vision-guardrails.util';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 형식(YYYY-MM-DD)뿐 아니라 실제 달력에 존재하는 날짜인지도 확인한다(윤년 2/29 등) —
// Date는 범위를 벗어난 값을 다음 달/해로 "굴려버리므로" 역산해 원래 입력과 같은지로 검증한다.
function isValidIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export type TargetRddRolloverBasis = 'DOCUMENT_DATE' | 'TODAY';

// PR-201d: 값을 바꿨는지와 별개로, 화면에 어떤 안내를 띄울지 — 'none'=안내 없음,
// 'past-kept'=납기가 오늘보다 과거인데 작성일 기준으로는 정상이라 값을 그대로 둠(또는
// 보정을 시도했지만 끝내 오늘을 못 넘겨 과거로 남음), 'bumped-today'=오늘 기준으로
// 연도 +1(PR-190 기존 동작), 'bumped-written'=작성일 기준으로 연도 +1(PR-201 동작).
export type TargetRddNotice = 'none' | 'past-kept' | 'bumped-today' | 'bumped-written';

export interface TargetRddRolloverResult {
  // 보정이 적용됐으면 보정된 값, 아니면 입력받은 targetRdd 그대로(둘 다 null일 수 있음).
  targetRdd: string | null;
  adjusted: boolean;
  // 보정 전 원래 값 — adjusted=true일 때만 채워진다(화면 안내 "원래 인식값"에 쓰인다).
  original: string | null;
  // 어느 기준으로 보정했는지(adjusted=true일 때만 의미있음, 화면 문구 선택용).
  basis: TargetRddRolloverBasis | null;
  notice: TargetRddNotice;
}

interface InnerResult {
  targetRdd: string | null;
  adjusted: boolean;
  original: string | null;
  basis: TargetRddRolloverBasis | null;
}

const NO_CHANGE = (targetRdd: string | null): InnerResult => ({
  targetRdd,
  adjusted: false,
  original: null,
  basis: null,
});

// 보정 자체(값을 바꿀지 말지)는 기존 PR-201 로직 그대로다 — 이 함수는 바뀌지 않는다.
function computeRollover(targetRdd: string | null, documentDate: string | null, today: string): InnerResult {
  if (!targetRdd || !isValidIsoDate(targetRdd)) return NO_CHANGE(targetRdd);
  if (!today || !isValidIsoDate(today)) return NO_CHANGE(targetRdd);

  // 예외: 납기 == 작성일은 "작성일을 납기로 잘못 인식"한 PR-158 실사례 패턴이므로
  // 절대 보정하지 않는다(보정하면 그 오인식을 더 그럴듯하게 감춰버린다) — 의심 경고로만
  // 알린다.
  if (targetRdd === documentDate) return NO_CHANGE(targetRdd);

  const documentDateReliable =
    documentDate != null && isValidIsoDate(documentDate) && checkDocumentDateSuspicious(documentDate, today) == null;
  const basis: TargetRddRolloverBasis = documentDateReliable ? 'DOCUMENT_DATE' : 'TODAY';
  const baseline = basis === 'DOCUMENT_DATE' ? (documentDate as string) : today;

  // 기준(작성일 또는 오늘)보다 같거나 미래면 손대지 않는다(해당 날짜 당일 포함).
  if (targetRdd >= baseline) return NO_CHANGE(targetRdd);

  const [y, m, d] = targetRdd.split('-').map(Number);
  const nextYear = y + 1;
  const candidate = `${String(nextYear).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // 보정은 +1년 한 번만 — 그래도 달력에 없으면(2/29 → 다음 해가 평년) 보정하지 않는다.
  if (!isValidIsoDate(candidate)) return NO_CHANGE(targetRdd);

  // 보정은 +1년 한 번만 — 그래도 기준 이후가 안 되면(원래 연도가 2년 이상 이전인 경우 등)
  // 억지로 더 보정하지 않고 그대로 둔다(의심 플래그로 계속 걸러진다).
  if (candidate <= baseline) return NO_CHANGE(targetRdd);

  return { targetRdd: candidate, adjusted: true, original: targetRdd, basis };
}

// today는 KST(한국시간) 기준 "오늘" 날짜(YYYY-MM-DD)를 호출자가 넘긴다(vision.service.ts의
// todayKstIso) — 이 함수 자체는 시각을 읽지 않는다(순수 함수 유지, 테스트에서 임의의
// "오늘"을 고정해 검증할 수 있게).
//
// PR-201(운영 화면 확인): 작성일이 과거인 작지(보관 문서 등)는 납기도 오늘보다 과거일 수
// 있는데, 기준을 항상 "오늘"로 두면 이런 정상 문서의 납기를 잘못 다음 해로 밀어올린다
// (실사례: 작성일 2025-09-08, 납기 2026-03-17로 읽힘 — 오늘(2026-10-*)보다 이르다는
// 이유로 2027년으로 보정했으나, 작성일 기준으로는 보정이 필요 없었다). 작성일이 있고
// 그 자체가 의심스러운 날짜(미래/18개월 초과 과거, checkDocumentDateSuspicious)가
// 아니면 작성일을 기준으로 쓰고, 그렇지 않으면(작성일 없음/의심스러움) 기존처럼 오늘을
// 기준으로 쓴다.
//
// PR-201d(운영 화면 확인): 작성일 기준으로는 "정상"이라 값을 안 바꿨는데, 작성일 자체가
// 한 해쯘 잘못 읽혀 있으면 납기가 오늘보다 과거인데도 아무 안내 없이 조용히 넘어가는
// 사각지대가 있었다(PR-201c 합성 입력 ③에서 확인됨). "값을 바꿨는지"와 "오늘보다 과거인
// 납기를 안내할지"를 분리한다 — 보정 로직(computeRollover)은 그대로 두고, 최종값이
// 오늘보다 과거면(바뀌었든 안 바뀌었든) 반드시 notice를 채운다. 이렇게 하면 "d<오늘인데
// 안내가 없는" 경우가 구조적으로 생기지 않는다(보정 시도가 실패해 그대로 과거로 남는
// 경우까지 전부 포함).
export function rolloverTargetRddYear(
  targetRdd: string | null,
  documentDate: string | null,
  today: string,
): TargetRddRolloverResult {
  const inner = computeRollover(targetRdd, documentDate, today);

  let notice: TargetRddNotice = 'none';
  if (inner.adjusted) {
    notice = inner.basis === 'DOCUMENT_DATE' ? 'bumped-written' : 'bumped-today';
  } else if (
    inner.targetRdd != null &&
    isValidIsoDate(inner.targetRdd) &&
    today &&
    isValidIsoDate(today) &&
    inner.targetRdd < today
  ) {
    notice = 'past-kept';
  }

  return { ...inner, notice };
}
