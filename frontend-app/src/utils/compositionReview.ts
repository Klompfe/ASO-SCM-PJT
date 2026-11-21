import type { AiBomItem } from '../api/salesOrders.service';

// PR-246: 혼용률(자재 행 단위) 저장 화면용 순수 로직 — 값은 입력된 문자열 그대로 다룬다
// (대소문자 변환·번역·정규화 없음, 앞뒤 공백 제거만).

// 오더개요 요약·"미기재" 경고의 대상 행(원단류). 작지의 소재 표 행은 구분이 "겉감"으로, 안감·배색
// 계열은 각각 해당 구분으로 들어온다. 엑셀(MATERIAL LIST)은 ITEM 칸 원문이 구분이 되므로 영문 별칭
// (OUT SHELL, LINING, COMBINATION)도 인식한다(PR-254). 단추·라벨 같은 부자재는 혼용률이 없는 게 정상이라
// 경고 대상에서 뺀다(값을 입력한 행은 구분과 상관없이 요약에 포함된다).
// 서버(vision-guardrails.util.ts)의 COMPOSITION_FABRIC_ALIASES / COMPOSITION_OUTER_ALIASES / COMPOSITION_NON_FABRIC_WORDS 와 같은 목록 — 백엔드 테스트가 대조한다.
export const COMPOSITION_FABRIC_ALIASES: readonly string[] = ['겉감', 'OUT SHELL', 'SHELL', 'OUTER SHELL', '안감', 'LINING', '퀼팅안감', '폴리트윌안감', '배색', '배색감', 'COMBINATION'];
// PR-255: 원단류 중 "겉감" 계열(완제품 재수입 세율 기준이 되는 혼용률) — 더 강하게 경고한다.
export const COMPOSITION_OUTER_ALIASES: readonly string[] = ['겉감', 'OUT SHELL', 'SHELL', 'OUTER SHELL'];
// PR-255: 이 단어가 구분에 들어 있으면 별칭이 같이 있어도 원단류로 보지 않는다(예: "배색 … THREAD" 실, "SHELL BUTTON").
export const COMPOSITION_NON_FABRIC_WORDS: readonly string[] = ['THREAD', 'TAPE', 'ZIPPER', 'BUTTON', 'LABEL', 'TAG', 'PAD', 'HOOK', '단추', '테이프', '지퍼', '라벨', '실'];

// 구분 문자열을 공백·줄바꿈·하이픈·괄호·슬래시 등으로 쪼갠 "단어 목록"(대문자). 별칭은 단어 경계에서만 인식한다 — 부분 문자열
// 일치는 쓰지 않는다(LINING 은 INTERLINING 안에서 인식되지 않는다). 한글이 공백으로 떨어진 표기("안 감")는 이웃 단어를
// 최대 3개까지 이어 붙여 별칭과 비교한다.
const tokenizeCategory = (s: string): string[] => s.toUpperCase().split(/[\s\-_/,()[\]<>.:;·]+/).filter((t) => t !== '');
const aliasKey = (s: string): string => tokenizeCategory(s).join('');
const FABRIC_KEYS: ReadonlySet<string> = new Set(COMPOSITION_FABRIC_ALIASES.map(aliasKey));
const OUTER_KEYS: ReadonlySet<string> = new Set(COMPOSITION_OUTER_ALIASES.map(aliasKey));
const NON_FABRIC_WORDS: ReadonlySet<string> = new Set(COMPOSITION_NON_FABRIC_WORDS.map((w) => w.toUpperCase()));

function matchesAliasKeys(category: string | null | undefined, keys: ReadonlySet<string>): boolean {
  if (typeof category !== 'string') return false;
  const tokens = tokenizeCategory(category);
  if (tokens.some((t) => NON_FABRIC_WORDS.has(t))) return false;
  for (let i = 0; i < tokens.length; i++) {
    for (let len = 1; len <= 3 && i + len <= tokens.length; len++) {
      if (keys.has(tokens.slice(i, i + len).join(''))) return true;
    }
  }
  return false;
}

export const isCompositionTargetCategory = (category: string | null | undefined): boolean => matchesAliasKeys(category, FABRIC_KEYS);
export const isOuterFabricCategory = (category: string | null | undefined): boolean => matchesAliasKeys(category, OUTER_KEYS);

export const cleanComposition = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

// PR-255: 겉감 상태 — noRow(겉감 행 없음) / blank(겉감 행은 있으나 혼용률이 비어 있는 행이 하나라도 있음) / filled(모두 값 있음).
// 알 수 없는 입력(배열이 아님 등)은 안전한 쪽(noRow)으로 본다. 제외 체크된 행은 저장되지 않으므로 뺀다.
export type OuterFabricStatus =
  | { kind: 'noRow' }
  | { kind: 'blank'; rowCount: number; blankRows: number }
  | { kind: 'filled'; rowCount: number; values: string[] };

export function outerFabricStatus(
  rows: readonly { category?: string | null; composition?: string | null }[] | null | undefined,
  excludedIndexes: Set<number> = new Set(),
): OuterFabricStatus {
  if (!Array.isArray(rows)) return { kind: 'noRow' };
  const values: string[] = [];
  let rowCount = 0;
  let blankRows = 0;
  rows.forEach((row, i) => {
    if (excludedIndexes.has(i) || row == null || !isOuterFabricCategory(row.category)) return;
    rowCount++;
    const v = cleanComposition(typeof row.composition === 'string' ? row.composition : null);
    if (v == null) blankRows++;
    else if (!values.includes(v)) values.push(v);
  });
  if (rowCount === 0) return { kind: 'noRow' };
  if (blankRows > 0) return { kind: 'blank', rowCount, blankRows };
  return { kind: 'filled', rowCount, values };
}

export interface CompositionGroup {
  value: string;
  rowCount: number;
}

export interface CompositionSummary {
  groups: CompositionGroup[];
  // 겉감이 아닌 원단류(안감·배색 등)인데 혼용률이 비어 있는 행 수. 겉감은 outer 로 따로 센다(중복 경고 없음).
  missingRows: number;
  // PR-255: 겉감 상태(강한 경고용).
  outer: OuterFabricStatus;
}

// 제외 체크된 행은 저장되지 않으므로 요약에서도 뺀다.
export function summarizeCompositions(
  bomItems: Pick<AiBomItem, 'category' | 'composition'>[],
  excludedIndexes: Set<number> = new Set(),
): CompositionSummary {
  const counts = new Map<string, number>();
  let missingRows = 0;
  bomItems.forEach((item, i) => {
    if (excludedIndexes.has(i)) return;
    const value = cleanComposition(item.composition);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    else if (isCompositionTargetCategory(item.category) && !isOuterFabricCategory(item.category)) missingRows++;
  });
  return { groups: [...counts.entries()].map(([value, rowCount]) => ({ value, rowCount })), missingRows, outer: outerFabricStatus(bomItems, excludedIndexes) };
}

// 예: "COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)". 값이 없으면 빈 문자열.
export function formatCompositionSummary(summary: CompositionSummary): string {
  return summary.groups.map((g) => `${g.value} (${g.rowCount}행)`).join(' / ');
}

// PR-247: 값이 `%` 없이 `/`·`=` 와 숫자가 섞인 약어형(예: R/N/SP=56/40/4, C/P=60/40)으로 보이는지 —
// 저장 화면에서 "수입서류에 쓸 표기를 확인해 주세요" 안내를 띄우는 용도일 뿐이다. 값은 절대 바꾸지 않는다.
export function looksLikeAbbreviatedComposition(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (v === '' || v.includes('%')) return false;
  return /[/=]/.test(v) && /\d/.test(v);
}

// PR-248: 한 스타일 안에서 선택한 행들에 같은 혼용률을 채우는 순수 로직(화면 상태만 바꾼다).
export interface CompositionRowLike {
  category?: string | null;
  composition?: string | null;
}

export interface BulkCompositionResult<T> {
  rows: T[];
  filled: number;
  skipped: number;
}

// 이미 값이 있는 행은 건너뛰고(덮어쓰지 않음), 값은 입력한 그대로(trim 만) 넣는다. 값이 비어 있거나
// 선택이 없으면 아무것도 바꾸지 않는다. 원본 배열·행은 바꾸지 않는다.
export function applyBulkComposition<T extends CompositionRowLike>(
  rows: T[],
  selectedIndexes: Set<number>,
  value: string | null | undefined,
): BulkCompositionResult<T> {
  const v = cleanComposition(value);
  if (v == null || selectedIndexes.size === 0) return { rows, filled: 0, skipped: 0 };
  let filled = 0;
  let skipped = 0;
  const next = rows.map((row, i) => {
    if (!selectedIndexes.has(i)) return row;
    if (cleanComposition(row.composition) != null) {
      skipped++;
      return row;
    }
    filled++;
    return { ...row, composition: v };
  });
  return { rows: next, filled, skipped };
}

// "원단류 행 선택" 빠른 버튼 — PR-246 의 원단류 판정(isCompositionTargetCategory, PR-254 영문 별칭 포함)을 재사용한다.
export function selectFabricRowIndexes(rows: CompositionRowLike[]): Set<number> {
  const out = new Set<number>();
  rows.forEach((r, i) => {
    if (isCompositionTargetCategory(r.category)) out.add(i);
  });
  return out;
}

// PR-255: "겉감만 선택" 빠른 버튼 — 겉감 계열 행만 고른다.
export function selectOuterFabricRowIndexes(rows: CompositionRowLike[]): Set<number> {
  const out = new Set<number>();
  rows.forEach((r, i) => {
    if (isOuterFabricCategory(r.category)) out.add(i);
  });
  return out;
}

// 선택된 행 중 원단류가 아닌 행 수(확인 문구용).
export function countNonFabricSelected(rows: CompositionRowLike[], selectedIndexes: Set<number>): number {
  let n = 0;
  selectedIndexes.forEach((i) => {
    if (rows[i] && !isCompositionTargetCategory(rows[i].category)) n++;
  });
  return n;
}

export function formatBulkResult(r: { filled: number; skipped: number }): string {
  return `${r.filled}행 채움, ${r.skipped}행은 이미 값이 있어 건너뜀`;
}
