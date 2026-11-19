// PR-244b: 단가 통화(KRW/USD) 공통 유틸. 서버(PR-244a)가 BOM 행·발주의 currency 를 내려주고,
// NULL/빈 값은 KRW 로 본다. 통화가 다른 금액은 절대 더하지 않고 통화별로 따로 합산한다.
// 환산(≈ 원화)은 표시 전용이며 어디에도 저장하지 않는다.
export const CURRENCIES = ['KRW', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'KRW';

// 서버 값(NULL/빈 문자열/소문자)을 화면용 통화로 — 알 수 없는 값은 KRW 가 아니라 그대로 두면
// 합계가 엉키므로, 허용 목록에 없으면 KRW 로 본다(서버가 KRW/USD 만 저장한다).
export function normalizeCurrency(v: unknown): Currency {
  const s = String(v ?? '').trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(s) ? (s as Currency) : DEFAULT_CURRENCY;
}

export const CURRENCY_CHANGE_NOTICE =
  '통화를 바꿔도 단가 숫자는 자동 환산되지 않습니다. 새 통화 기준 단가인지 확인해 주세요.';

export const UPLOAD_KRW_NOTICE =
  '업로드한 단가는 원화(KRW)로 저장됩니다. USD 단가는 저장 후 자재·BOM 조회 행에서 통화를 USD 로 바꾸고 단가를 다시 입력해 주세요.';

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 금액 표시 문자열. KRW 는 기존 표기(ko-KR, 소수 최대 2자리)와 완전히 같다 — KRW 만 있는 화면은
// 이전과 동일한 문자열이어야 한다. USD 는 소수 2자리 고정.
export function formatAmount(n: number, currency: Currency | string | null | undefined): string {
  if (normalizeCurrency(currency) === 'USD') {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

// 단가 표시: KRW 는 기존 표기, USD 는 단가표 정밀도(소수 최대 6자리, 예 0.00012)까지 — 2자리로 반올림하면 단가가 틀려 보인다.
export function formatUnitPrice(n: number, currency: Currency | string | null | undefined): string {
  if (normalizeCurrency(currency) === 'USD') return 'USD ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

// 기존 화면이 인자 없는 toLocaleString() 을 쓰던 곳용(발주 관리 목록) — KRW 는 그 문자열 그대로.
export function formatAmountDefaultLocale(n: number, currency: Currency | string | null | undefined): string {
  if (normalizeCurrency(currency) === 'USD') return `USD ${formatAmount(n, 'USD')}`;
  return n.toLocaleString();
}

// 단가 표시: KRW 는 값 그대로(이전 표기), USD 는 "USD " 접두.
export function withCurrencyLabel(text: string, currency: Currency | string | null | undefined): string {
  return normalizeCurrency(currency) === 'USD' ? `USD ${text}` : text;
}

export type CurrencyTotals = Partial<Record<Currency, number>>;

// 통화별 합계. 항목이 있는 통화만 키가 생긴다(빈 목록 = {}).
export function sumByCurrency<T>(
  items: readonly T[],
  amountOf: (item: T) => number,
  currencyOf: (item: T) => unknown,
): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const item of items) {
    const c = normalizeCurrency(currencyOf(item));
    totals[c] = (totals[c] ?? 0) + toNum(amountOf(item));
  }
  return totals;
}

// 통화별 합계 문자열. KRW 만 있거나 비어 있으면 기존 문자열(KRW 금액만)과 같다.
// 섞이면 "KRW 1,234,000 / USD 1,250.00".
export function formatTotals(totals: CurrencyTotals): string {
  const present = CURRENCIES.filter((c) => totals[c] !== undefined);
  if (present.length === 0) return formatAmount(0, 'KRW');
  if (present.length === 1 && present[0] === 'KRW') return formatAmount(totals.KRW ?? 0, 'KRW');
  return present.map((c) => `${c} ${formatAmount(totals[c] ?? 0, c)}`).join(' / ');
}

export const hasForeignCurrency = (totals: CurrencyTotals): boolean => totals.USD !== undefined;

// 발주일(ISO 시각) → 한국 날짜(YYYY-MM-DD). 환율 구간 조회의 기준일.
export function toKstDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10) || null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
