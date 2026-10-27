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
// 날짜(미래/12개월 초과 과거, PR-207에서 18→12개월로 변경)인지 알아야 한다 —
// vision-guardrails.util.ts의 판정을 그대로 재사용한다(순수 함수, 순환 의존 없음).
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

// PR-207: 이 업무에서 새로 올리는 작지의 납기는 항상 미래라는 사용자 결정에 따라
// 'past-kept'(결과가 오늘보다 과거인데도 값을 그대로 두는 경우)를 완전히 없앤다 —
// 'none'=안내 없음(변경 없음, 이미 오늘 이상), 'bumped-today'=오늘 기준으로 연도를
// 올림(PR-190 동작 + 이번 PR의 "항상 미래" 보정), 'bumped-written'=작성일 기준으로
// 연도를 올렸고 그 결과가 이미 오늘 이상인 경우(PR-201 동작).
export type TargetRddNotice = 'none' | 'bumped-today' | 'bumped-written';

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

// 1단계 — 작성일 기준 보정(PR-201). 이 함수의 규칙 자체는 이번 PR에서 바뀌지 않는다 —
// "작성일이 신뢰 가능하면 그것을 기준으로, 아니면 오늘을 기준으로" +1년을 한 번만
// 시도한다. 이 결과가 여전히 오늘보다 과거일 수 있는데, 그건 아래 2단계가 메운다.
function computeRollover(targetRdd: string | null, documentDate: string | null, today: string): InnerResult {
  if (!targetRdd || !isValidIsoDate(targetRdd)) return NO_CHANGE(targetRdd);
  if (!today || !isValidIsoDate(today)) return NO_CHANGE(targetRdd);

  // 예외: 납기 == 작성일은 "작성일을 납기로 잘못 인식"한 PR-158 실사례 패턴이므로
  // 이 1단계에서는 보정하지 않는다(의심 경고로 따로 알린다) — 다만 PR-207부터는
  // 2단계가 "결과가 오늘보다 과거면 항상 올린다"는 불변식을 여기에도 똑같이 적용한다.
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

  // 1단계의 보정은 +1년 한 번만 시도한다 — 달력에 없거나(2/29) 그래도 기준 이후가 안
  // 되면 이 단계에서는 포기한다(2단계가 "오늘 이상"을 끝까지 보장한다).
  if (!isValidIsoDate(candidate)) return NO_CHANGE(targetRdd);
  if (candidate <= baseline) return NO_CHANGE(targetRdd);

  return { targetRdd: candidate, adjusted: true, original: targetRdd, basis };
}

// 2단계(PR-207) — 월·일은 유지한 채 "오늘(Asia/Seoul) 이상이 되는 가장 작은 연도"까지
// 연도를 계속 올린다. 2/29처럼 그 연도에 날짜가 존재하지 않으면 건너뛰고 다음 연도를
// 본다. 월/일 자체가 유효한 값으로 들어온다는 전제(isValidIsoDate를 호출부에서 먼저
// 확인)라 무한 루프가 되지 않는다(연 단위로 증가하는 문자열은 결국 today를 넘어선다).
function bumpYearToAtLeast(dateStr: string, today: string): string {
  const mm = dateStr.slice(5, 7);
  const dd = dateStr.slice(8, 10);
  let year = Number(dateStr.slice(0, 4));
  for (let i = 0; i < 400; i++) {
    const candidate = `${String(year).padStart(4, '0')}-${mm}-${dd}`;
    if (isValidIsoDate(candidate) && candidate >= today) return candidate;
    year++;
  }
  // 400년을 돌아도 못 찾으면(이론상 도달 불가 — 월/일 자체가 애초에 무효했다는 뜻)
  // 원본을 그대로 돌려준다(보정 없음과 동일한 안전한 결과).
  return dateStr;
}

// today는 KST(한국시간) 기준 "오늘" 날짜(YYYY-MM-DD)를 호출자가 넘긴다(vision.service.ts의
// todayKstIso) — 이 함수 자체는 시각을 읽지 않는다(순수 함수 유지, 테스트에서 임의의
// "오늘"을 고정해 검증할 수 있게).
//
// PR-207(사용자 결정): "이 업무에서 새로 올리는 작지의 납기는 항상 미래다." 1단계
// (computeRollover, 작성일 기준 보정)를 그대로 적용한 뒤, 그 결과(또는 보정이 없었던
// 원래 값)가 여전히 오늘보다 과거이면 — 1단계가 왜 보정을 안 했는지와 무관하게(기준
// 불일치, 2년 이상 차이, 작성일==납기 예외 전부 포함) — 월/일은 유지하고 연도만 "오늘
// 이상이 되는 가장 작은 연도"로 끝까지 올린다. 'past-kept'는 더 이상 만들지 않는다
// (PR-201/201d가 도입한 안내였으나, 이번 결정으로 그 경우 자체가 없어진다). 두 기준이
// 겹치면(1단계가 이미 올렸는데도 여전히 과거라 2단계가 다시 올리는 경우) 2단계가
// 이겨 basis='TODAY'/notice='bumped-today'가 된다 — 사용자가 결정한 우선순위.
export function rolloverTargetRddYear(
  targetRdd: string | null,
  documentDate: string | null,
  today: string,
): TargetRddRolloverResult {
  const inner = computeRollover(targetRdd, documentDate, today);

  const canCompareToToday =
    inner.targetRdd != null && isValidIsoDate(inner.targetRdd) && !!today && isValidIsoDate(today);

  if (canCompareToToday && (inner.targetRdd as string) < today) {
    const bumped = bumpYearToAtLeast(inner.targetRdd as string, today);
    if (bumped !== inner.targetRdd) {
      return {
        targetRdd: bumped,
        adjusted: true,
        original: inner.original ?? targetRdd,
        basis: 'TODAY',
        notice: 'bumped-today',
      };
    }
  }

  const notice: TargetRddNotice = inner.adjusted ? (inner.basis === 'DOCUMENT_DATE' ? 'bumped-written' : 'bumped-today') : 'none';
  return { ...inner, notice };
}
