// PR-222: 수주등록 저장 화면(자재명세 초안)의 "발주수량(적용)" 열 — 저장 전에도
// [A] 부족자재 표(StyleShortagePanel.tsx)가 실제로 쓰는 것과 같은 규칙으로 "지금
// 저장하면 적용될 수량"을 미리 보여준다. 이 규칙은 백엔드
// src/work-orders/utils/material-requirements.util.ts의 BOM 행 하나짜리 결정과
// 같다(프론트/백엔드가 별도 TS 프로젝트라 그대로 import할 수 없어 복제한다 —
// materialRequirementDisplay.ts/warningChips.ts와 같은 기존 패턴). 계산 로직 자체는
// 바꾸지 않는다 — 여기서 새로 계산하지 않고 백엔드와 같은 식을 그대로 옮긴다.
//
// PR-226(사용자 확정): "계산값 우선, 작지 값은 대조·대체 근거" — 색상×사이즈
// 수량표 합계 또는 총수량×요척(계산값)이 있으면 그 값을 적용한다. 작지 수량
// (sheetQty)은 더 이상 1순위가 아니다: 계산값과 함께 있으면 비교해 ±5% 넘게
// 다르면 mismatch만 표시하고(적용은 계산값), 계산값이 전혀 없을 때만(색상이
// 수량표에 없음) 작지 값을 적용한다. material-requirements.util.ts와 같은 순서.
export type AppliedQuantityBasis = 'sheet' | 'color-qty' | 'computed' | 'unknown';

export interface AppliedQuantityResult {
  basis: AppliedQuantityBasis;
  // basis==='unknown'이면 0(화면은 숫자를 보여주지 않는다 — needsColorQty와 같은 의미).
  qty: number;
  // perUnit × totalQty(색상 구분과 무관하게 항상 계산) — 화면의 "계산수량" 참고용.
  // basis가 'color-qty'면 실제 적용값(qty)과 다를 수 있다(qty는 그 색상 합계 기준).
  computedQty: number;
  // 단위가 맞는 작지 수량이 있었으면 그 값(적용 여부와 무관, 대조용) — 없으면 null.
  sheetQty: number | null;
  // basis가 'computed'/'color-qty'이고 작지 값도 있을 때만 의미 있음 — 그 행의
  // 계산값(qty)과 작지 값 차이가 ±5% 넘으면 true(적용은 그래도 계산값).
  mismatch: boolean;
  formula: string;
  // PR-226 추가(사용자 확인): mismatch일 때 작지 값이 스타일 총수량과 정확히 같으면
  // (소수 오차 허용 안 함) 출고량 칸이 아니라 총수량(또는 다른 칸)을 읽었을 가능성이
  // 크다는 표시 — 적용은 그래도 계산값(또는 basis='sheet'면 작지 값) 그대로.
  sheetQtyLooksLikeTotalQtyMisread: boolean;
}

const normUnit = (u: string | null | undefined): string => (u ?? '').trim().toUpperCase();
const SHEET_QTY_MISMATCH_THRESHOLD_PCT = 0.05;

// 백엔드 material-requirements.util.ts의 같은 이름 함수와 동일한 순수 로직 — 두 TS
// 프로젝트가 분리돼 있어 복제한다(이 파일의 다른 함수들과 같은 기존 패턴).
export function sheetQtyLooksLikeTotalQtyMisread(sheetQty: number | null | undefined, totalQty: number | null | undefined, mismatch: boolean): boolean {
  if (!mismatch) return false;
  if (sheetQty == null || totalQty == null) return false;
  return sheetQty === totalQty;
}

// 백엔드 normalizeColorForMatch와 동일: 앞뒤 공백 제거 + 대소문자 무시 + 내부 연속
// 공백을 1칸으로만. 약어↔전체명 추측 매칭은 하지 않는다.
export function normalizeColorForMatch(color: string | null | undefined): string {
  return (color ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}
const FREE_COLOR_KEY = 'FREE';
// mapping-commit.service.ts의 normalizeKeyPart()가 "색상 없음"을 'N/A'로 저장하는
// 기존 관례 — 공통(FREE)과 같은 "색상 구분 없음"으로 본다.
const NA_COLOR_KEY = 'N/A';

export function buildColorQtyMap(colorQuantities: { color: string; qty: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of colorQuantities) {
    const key = normalizeColorForMatch(c.color);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + (Number(c.qty) || 0));
  }
  return map;
}

export function resolveAppliedQuantity(opts: {
  consumption: number | null;
  totalQty: number | null;
  sheetQty: number | null;
  sheetQtyUnit: string | null;
  itemUnit: string | null;
  colorCode: string | null;
  colorQtyMap: Map<string, number>;
}): AppliedQuantityResult {
  const perUnit = Number(opts.consumption) || 0;
  const target = Number(opts.totalQty) || 0;
  const computedRowQty = perUnit * target;

  const sheetQtyRaw = Number(opts.sheetQty);
  const hasValidSheetQty = opts.sheetQty != null && Number.isFinite(sheetQtyRaw) && sheetQtyRaw > 0;
  const rowUnit = normUnit(opts.itemUnit);
  const sheetUnit = normUnit(opts.sheetQtyUnit);
  const unitMatches = hasValidSheetQty && !!rowUnit && !!sheetUnit && rowUnit === sheetUnit;
  const sheetQty = unitMatches ? sheetQtyRaw : null;

  const colorKeyNorm = normalizeColorForMatch(opts.colorCode);
  const isCommonColor = !colorKeyNorm || colorKeyNorm === FREE_COLOR_KEY || colorKeyNorm === NA_COLOR_KEY;
  const colorQtyValue = !isCommonColor ? opts.colorQtyMap.get(colorKeyNorm) : undefined;

  let basis: AppliedQuantityBasis;
  let qty: number;
  let formula: string;
  if (isCommonColor) {
    basis = 'computed';
    qty = computedRowQty;
    formula = `기획수량 ${target.toLocaleString('ko-KR')} × 요척 ${perUnit} = ${computedRowQty.toLocaleString('ko-KR')}`;
  } else if (colorQtyValue != null) {
    basis = 'color-qty';
    qty = perUnit * colorQtyValue;
    formula = `색상 합계 ${colorQtyValue.toLocaleString('ko-KR')} × 요척 ${perUnit} = ${qty.toLocaleString('ko-KR')}`;
  } else if (unitMatches) {
    basis = 'sheet';
    qty = sheetQtyRaw;
    formula = `작지수량 ${sheetQtyRaw.toLocaleString('ko-KR')}${opts.sheetQtyUnit ? ' ' + opts.sheetQtyUnit : ''}`;
  } else {
    basis = 'unknown';
    qty = 0;
    formula = '';
  }

  // PR-226: 계산값을 적용했으면 그 행 자신의 적용값(qty)과 작지 값을 비교한다.
  // basis==='sheet'(이 색상에 계산값이 전혀 없음)는 비교할 "그 행만의" 계산값이
  // 없으므로, 백엔드(material-requirements.util.ts)가 그런 행에 쓰는 것과 같은
  // 폴백 비교(총수량×요척 참고값 vs 작지 값)를 그대로 쓴다 — PR-220부터 있던
  // "참고 사실 확인"과 같은 취지.
  let mismatch = false;
  if ((basis === 'computed' || basis === 'color-qty') && sheetQty != null) {
    const diffPct = qty !== 0 ? Math.abs(qty - sheetQty) / Math.abs(qty) : (sheetQty !== 0 ? 1 : 0);
    mismatch = diffPct > SHEET_QTY_MISMATCH_THRESHOLD_PCT;
  } else if (basis === 'sheet') {
    const diffPct = computedRowQty !== 0 ? Math.abs(computedRowQty - sheetQtyRaw) / Math.abs(computedRowQty) : 0;
    mismatch = diffPct > SHEET_QTY_MISMATCH_THRESHOLD_PCT;
  }

  return {
    basis, qty, computedQty: computedRowQty, sheetQty, mismatch, formula,
    sheetQtyLooksLikeTotalQtyMisread: sheetQtyLooksLikeTotalQtyMisread(sheetQty, target || null, mismatch),
  };
}

// PR-226: 작지 출고량이 LOT 여러 줄로 나뉘어 있을 때(requiredQtyLots, 서버가 이미
// requiredQty에 합산해 둠) 근거 배지 title/불일치 안내에 "LOT1 a + LOT2 b = 합"
// 내역을 보여주기 위한 표시용 문자열 — 계산에는 쓰이지 않는다.
export function formatLotBreakdown(lots: number[] | null | undefined): string | null {
  if (!Array.isArray(lots) || lots.length < 2) return null;
  const sum = lots.reduce((a, b) => a + b, 0);
  const parts = lots.map((v, i) => `LOT${i + 1} ${v.toLocaleString('ko-KR')}`);
  return `${parts.join(' + ')} = ${sum.toLocaleString('ko-KR')}`;
}

export const APPLIED_BASIS_LABEL: Record<AppliedQuantityBasis, string> = {
  sheet: '작지',
  'color-qty': '색상수량표',
  computed: '계산',
  unknown: '',
};
