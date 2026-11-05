// PR-222: 수주등록 저장 화면(자재명세 초안)의 "발주수량(적용)" 열 — 저장 전에도
// [A] 부족자재 표(StyleShortagePanel.tsx)가 실제로 쓰는 것과 같은 규칙으로 "지금
// 저장하면 적용될 수량"을 미리 보여준다. 이 규칙은 백엔드
// src/work-orders/utils/material-requirements.util.ts의 BOM 행 하나짜리 결정(241~275행)
// 과 같다(프론트/백엔드가 별도 TS 프로젝트라 그대로 import할 수 없어 복제한다 —
// materialRequirementDisplay.ts/warningChips.ts와 같은 기존 패턴). 계산 로직 자체는
// 바꾸지 않는다 — 여기서 새로 계산하지 않고 백엔드와 같은 식을 그대로 옮긴다.
export type AppliedQuantityBasis = 'sheet' | 'color-qty' | 'computed' | 'unknown';

export interface AppliedQuantityResult {
  basis: AppliedQuantityBasis;
  // basis==='unknown'이면 0(화면은 숫자를 보여주지 않는다 — needsColorQty와 같은 의미).
  qty: number;
  // perUnit × totalQty(색상 구분과 무관하게 항상 계산) — mismatch 비교/보조 표시용.
  computedQty: number;
  // basis==='sheet'일 때만 의미 있음 — 작지수량과 계산값 차이가 ±5% 넘으면 true
  // (백엔드 SHEET_QTY_MISMATCH_THRESHOLD_PCT와 동일한 기준).
  mismatch: boolean;
  formula: string;
}

const normUnit = (u: string | null | undefined): string => (u ?? '').trim().toUpperCase();
const SHEET_QTY_MISMATCH_THRESHOLD_PCT = 0.05;

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
  const computedQty = perUnit * target;

  const sheetQtyRaw = Number(opts.sheetQty);
  const hasValidSheetQty = opts.sheetQty != null && Number.isFinite(sheetQtyRaw) && sheetQtyRaw > 0;
  const rowUnit = normUnit(opts.itemUnit);
  const sheetUnit = normUnit(opts.sheetQtyUnit);
  const unitMatches = hasValidSheetQty && !!rowUnit && !!sheetUnit && rowUnit === sheetUnit;

  if (unitMatches) {
    const diffPct = computedQty !== 0 ? Math.abs(computedQty - sheetQtyRaw) / Math.abs(computedQty) : 0;
    return {
      basis: 'sheet',
      qty: sheetQtyRaw,
      computedQty,
      mismatch: diffPct > SHEET_QTY_MISMATCH_THRESHOLD_PCT,
      formula: `작지수량 ${sheetQtyRaw.toLocaleString('ko-KR')}${opts.sheetQtyUnit ? ' ' + opts.sheetQtyUnit : ''}`,
    };
  }

  const colorKeyNorm = normalizeColorForMatch(opts.colorCode);
  const isCommonColor = !colorKeyNorm || colorKeyNorm === FREE_COLOR_KEY || colorKeyNorm === NA_COLOR_KEY;

  if (isCommonColor) {
    return {
      basis: 'computed',
      qty: computedQty,
      computedQty,
      mismatch: false,
      formula: `기획수량 ${target.toLocaleString('ko-KR')} × 요척 ${perUnit} = ${computedQty.toLocaleString('ko-KR')}`,
    };
  }

  const colorQty = opts.colorQtyMap.get(colorKeyNorm);
  if (colorQty != null) {
    const qty = perUnit * colorQty;
    return {
      basis: 'color-qty',
      qty,
      computedQty,
      mismatch: false,
      formula: `색상 합계 ${colorQty.toLocaleString('ko-KR')} × 요척 ${perUnit} = ${qty.toLocaleString('ko-KR')}`,
    };
  }

  return { basis: 'unknown', qty: 0, computedQty, mismatch: false, formula: '' };
}

export const APPLIED_BASIS_LABEL: Record<AppliedQuantityBasis, string> = {
  sheet: '작지',
  'color-qty': '색상수량표',
  computed: '계산',
  unknown: '',
};
