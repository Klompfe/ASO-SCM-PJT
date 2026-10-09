import type { ExchangeRateLookupResult, ExchangeRateStatus } from '../api/customsExchangeRates.service';

// PR-184: 관세청 주간환율 화면/팝업이 쓰는 순수 로직. 날짜 계산과 "자동 적용 금지" 규칙처럼
// 실제로 틀릴 수 있는 부분만 뽑아서 입출력으로 검증한다(DOM 상호작용은 이 프로젝트 테스트
// 환경에서 검증할 수 없음 — renderToStaticMarkup만 사용).

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 시작일을 고르면 종료일을 시작일+6일로 제안한다(관세청 주간환율이 일주일 단위라는 편의
// 기본값일 뿐 — 강제하지 않음, 사용자가 고칠 수 있다).
export function suggestValidTo(validFrom: string): string {
  return addDaysUtc(validFrom, 6);
}

// 적용 시작일 기본값: 직전 등록 주(previous)의 validTo 다음 날이 오늘보다 이전이면 그 날,
// 아니면 오늘. 특정 요일 경계를 코드에 박아 넣지 않는다 — 사용자가 입력하는 기간을 그대로 신뢰.
export function suggestValidFrom(previous: { validTo: string } | null | undefined, today: string): string {
  if (!previous) return today;
  const nextDay = addDaysUtc(previous.validTo, 1);
  return nextDay < today ? nextDay : today;
}

// 팝업을 띄울지 — 수출·수입 중 하나라도 등록돼 있지 않으면 띄운다. 둘 다 있으면 안 띄운다.
export function shouldShowWeeklyRatePopup(status: ExchangeRateStatus | null): boolean {
  if (!status) return false;
  return !status.EXPORT.found || !status.IMPORT.found;
}

const DISMISS_KEY = 'customsExchangeRatePopupDismissedAt';

// sessionStorage 접근이 막히면(프라이빗 모드, 또는 sessionStorage 자체가 없는 환경) 조용히
// 이 메모리 변수로만 동작한다 — 탭을 새로 열면 사라지지만, 같은 로그인 세션 안에서는
// 기억해야 할 요구사항은 충족한다.
let inMemoryDismissed = false;

// 같은 세션 동안만 "나중에"를 기억한다.
export function markPopupDismissedThisSession(): void {
  inMemoryDismissed = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore — 세션 저장소에 접근할 수 없으면 메모리 상태만 쓴다.
  }
}

export function wasPopupDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1' || inMemoryDismissed;
  } catch {
    return inMemoryDismissed;
  }
}

// 역할에 따라 팝업(쓰기 가능) vs 상단 안내(읽기 전용)을 가른다.
export function canEnterWeeklyRate(role: string | null | undefined): boolean {
  return role === 'MANAGER' || role === 'ADMIN';
}

const RATE_TYPE_LABEL: Record<string, string> = { EXPORT: '수출', IMPORT: '수입' };

// "1,343 (2026-10-05~2026-10-11)" 형식의 참고 표시 문구.
export function formatRateRange(result: { rate: number; validFrom: string; validTo: string }): string {
  return `${result.rate.toLocaleString()} (${result.validFrom}~${result.validTo})`;
}

export function formatPreviousHint(lookup: ExchangeRateLookupResult | null | undefined): string | null {
  if (!lookup?.previous) return null;
  return `직전 등록 주: ${formatRateRange(lookup.previous)} (참고)`;
}

export const sourceLabel = (source?: string | null): string => {
  if (source === 'CUSTOMS_WEEKLY_EXPORT') return '관세청 주간환율(수출) 적용';
  if (source === 'CUSTOMS_WEEKLY_IMPORT') return '관세청 주간환율(수입) 적용';
  if (source === 'MANUAL') return '수동 입력';
  return '출처 미기록';
};

// INVOICE 폼의 환율 추천 배지 상태. 사용자가 값을 입력한 뒤 수정하면(touched) "수동 수정"으로
// 바뀌고, 추천값을 그대로 두면 "확인 필요"로 남는다.
export type InvoiceRateBadge =
  | { kind: 'none' }
  | { kind: 'suggested'; rateType: 'EXPORT' | 'IMPORT'; validFrom: string; validTo: string }
  | { kind: 'manual' }
  | { kind: 'not_found'; previous: string | null };

export function buildInvoiceRateBadge(
  lookup: ExchangeRateLookupResult | null,
  rateType: 'EXPORT' | 'IMPORT',
  touchedByUser: boolean,
): InvoiceRateBadge {
  if (!lookup) return { kind: 'none' };
  if (touchedByUser) return { kind: 'manual' };
  if (lookup.found) {
    return { kind: 'suggested', rateType, validFrom: lookup.validFrom!, validTo: lookup.validTo! };
  }
  return { kind: 'not_found', previous: lookup.previous ? formatRateRange(lookup.previous) : null };
}

export { RATE_TYPE_LABEL };
