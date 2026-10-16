// PR-199: PR-200이 서버에 넣을 경고 신호를 하네스 안에서 순수 함수로 먼저 구현해
// 각 신호가 실제 오류를 얼마나 잡는지(적중률/오탐률) 잰다. 운영 코드(src/)에는 넣지
// 않는다 — PR-200이 이 파일의 로직을 승격해서 쓴다.

// 신호 ①: 스타일번호 끝 글자가 "영문 코드 뒤 숫자 하나" 형식(흔한 패턴)인데 숫자로
// 끝나면 의심 — 끝 글자가 원래 영문이어야 할 자리에 숫자가 온 경우만 좁게 잡는다
// (완전히 숫자로만 끝나는 정상 스타일번호 체계까지 오탐하지 않도록, "영문 3자+숫자
// 3자" 뒤에 끝 글자가 오는 전형적인 패턴에서만 작동).
const STYLE_NO_WITH_SUFFIX_PATTERN = /^[A-Z]{2}\d{2}[A-Z]{3}\d{3}([A-Z0-9])$/;
export function hasSuspiciousStyleNoSuffix(styleNo: string): boolean {
  const m = STYLE_NO_WITH_SUFFIX_PATTERN.exec(styleNo.trim().toUpperCase());
  if (!m) return false;
  return /[0-9]/.test(m[1]);
}

// 신호 ②: 같은 구분·규격·값(0 초과, 1 제외 — 1은 "개당 1개" 같은 흔한 값이라 오탐이 큼)의
// 행이 2개 이상이면 중복 의심.
export interface DuplicateCheckRow {
  category: string | null;
  spec: string | null;
  consumption: number | null;
}
export function detectDuplicateValueRowIndexes(rows: DuplicateCheckRow[]): number[][] {
  const groups = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    if (row.consumption == null || row.consumption <= 0 || row.consumption === 1) return;
    const key = `${row.category ?? ''}\u0000${row.spec ?? ''}\u0000${row.consumption}`;
    const list = groups.get(key) ?? [];
    list.push(idx);
    groups.set(key, list);
  });
  return [...groups.values()].filter((list) => list.length >= 2);
}

// 신호 ③: 표준 이름 사전/정답 엑셀의 이름 목록에 없는 이름 — 마스터 DB는 쓰지 않는다.
export function isUnknownMaterialName(name: string, knownNames: ReadonlySet<string>): boolean {
  return !knownNames.has(name.trim());
}

// 신호 ④: 요척 × 수량 ≠ 출고량. 올림·반올림·1% 이내는 일치로 본다. 후보 요척은
// 출고량 ÷ 수량으로 역산(소수 2자리로 반올림).
export interface ConsumptionVsShipmentResult {
  mismatch: boolean;
  candidateConsumption: number | null;
}
export function checkConsumptionVsShipment(consumption: number, qty: number, shippedQty: number): ConsumptionVsShipmentResult {
  if (qty <= 0) return { mismatch: false, candidateConsumption: null };
  const expected = consumption * qty;
  const withinOnePercent = Math.abs(expected - shippedQty) <= shippedQty * 0.01;
  const matchesRounding = Math.round(expected) === shippedQty || Math.ceil(expected) === shippedQty;
  const mismatch = !(withinOnePercent || matchesRounding);
  const candidateConsumption = Math.round((shippedQty / qty) * 100) / 100;
  return { mismatch, candidateConsumption };
}

// 신호 ⑤: 작성일이 미래이거나 18개월 넘게 과거.
export function isDocumentDateSuspicious(documentDateIso: string, today: Date = new Date()): boolean {
  const d = new Date(documentDateIso);
  if (Number.isNaN(d.getTime())) return false;
  const eighteenMonthsMs = 18 * 30 * 24 * 60 * 60 * 1000;
  if (d.getTime() > today.getTime()) return true;
  return today.getTime() - d.getTime() > eighteenMonthsMs;
}

// 신호 평가 — 적중률(실제 오류 중 신호가 걸린 비율), 오탐률(정답인데 신호가 걸린
// 비율), 후보 적중(④의 후보가 정답과 같은 비율), 조용한 오류(오류인데 어떤 신호도
// 안 걸린 건수).
export interface SignalEvaluationInput {
  isActualError: boolean;
  signalFired: boolean;
  candidateMatchesGolden?: boolean;
}
export interface SignalEvaluationSummary {
  hitRate: number;
  falsePositiveRate: number;
  candidateAccuracy: number | null;
  silentErrors: number;
}
export function evaluateSignal(inputs: SignalEvaluationInput[]): SignalEvaluationSummary {
  const actualErrors = inputs.filter((i) => i.isActualError);
  const hitRate = actualErrors.length > 0 ? actualErrors.filter((i) => i.signalFired).length / actualErrors.length : 0;

  const notErrors = inputs.filter((i) => !i.isActualError);
  const falsePositiveRate = notErrors.length > 0 ? notErrors.filter((i) => i.signalFired).length / notErrors.length : 0;

  const withCandidate = inputs.filter((i) => i.candidateMatchesGolden != null);
  const candidateAccuracy =
    withCandidate.length > 0 ? withCandidate.filter((i) => i.candidateMatchesGolden).length / withCandidate.length : null;

  const silentErrors = actualErrors.filter((i) => !i.signalFired).length;

  return { hitRate, falsePositiveRate, candidateAccuracy, silentErrors };
}
