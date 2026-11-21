import type { AiBomItem } from '../api/salesOrders.service';

// PR-246: 혼용률(자재 행 단위) 저장 화면용 순수 로직 — 값은 입력된 문자열 그대로 다룬다
// (대소문자 변환·번역·정규화 없음, 앞뒤 공백 제거만).

// 오더개요 요약·"미기재" 경고의 대상 행(원단류). 작지의 소재 표 행은 구분이 "겉감"으로, 안감·배색
// 계열은 각각 해당 구분으로 들어온다. 엑셀(MATERIAL LIST)은 ITEM 칸 원문이 구분이 되므로 영문 별칭
// (OUT SHELL, LINING, COMBINATION)도 인식한다(PR-254). 단추·라벨 같은 부자재는 혼용률이 없는 게 정상이라
// 경고 대상에서 뺀다(값을 입력한 행은 구분과 상관없이 요약에 포함된다).
// 서버(vision-guardrails.util.ts)의 COMPOSITION_FABRIC_ALIASES 와 같은 목록 — 백엔드 테스트가 두 목록을 대조한다.
export const COMPOSITION_FABRIC_ALIASES: readonly string[] = ['겉감', 'OUT SHELL', 'SHELL', 'OUTER SHELL', '안감', 'LINING', '퀼팅안감', '폴리트윌안감', '배색', '배색감', 'COMBINATION'];

// 공백·하이픈·밑줄 제거 + 대문자 비교 키.
const normalizeCategoryKey = (s: string): string => s.replace(/[\s\-_]+/g, '').toUpperCase();
const COMPOSITION_FABRIC_KEYS: ReadonlySet<string> = new Set(COMPOSITION_FABRIC_ALIASES.map(normalizeCategoryKey));

// 칸을 줄바꿈·연속 공백(2칸 이상) 조각으로 나눠 어느 한 조각이 별칭과 정확히 일치하면 원단류(부분 일치 없음).
export const isCompositionTargetCategory = (category: string | null | undefined): boolean => {
  if (typeof category !== 'string') return false;
  return category.split(/\r?\n|\s{2,}/).some((seg) => {
    const key = normalizeCategoryKey(seg);
    return key !== '' && COMPOSITION_FABRIC_KEYS.has(key);
  });
};

export const cleanComposition = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

export interface CompositionGroup {
  value: string;
  rowCount: number;
}

export interface CompositionSummary {
  groups: CompositionGroup[];
  // 대상 구분(원단류)인데 혼용률이 비어 있는 행 수.
  missingRows: number;
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
    else if (isCompositionTargetCategory(item.category)) missingRows++;
  });
  return { groups: [...counts.entries()].map(([value, rowCount]) => ({ value, rowCount })), missingRows };
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
