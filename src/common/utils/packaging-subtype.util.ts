// PR-186: 실/테이프 종류 판별을 한 곳에만 둔다 — 소요량 계산(work-orders), 발주 폼,
// 수출선적서류(export-shipments)가 전부 이 헬퍼만 쓰게 해서 "어디서는 BOM 행만 보고
// 어디서는 Item도 본다" 같은 불일치를 막는다.

export interface BomItemSubtypeLike {
  threadType?: string | null;
  tapeType?: string | null;
}

export interface ItemSubtypeLike {
  materialSubType?: string | null;
}

// BOM 행에 종류가 지정돼 있으면 그것이 우선(그 스타일에서만 다른 종류를 쓰는 경우를
// 덮어쓰지 않기 위함). 없으면 자재(Item) 단위 지정을 쓴다.
export function effectiveSubType(bomItem: BomItemSubtypeLike, item: ItemSubtypeLike | null | undefined): string | null {
  return bomItem.threadType ?? bomItem.tapeType ?? item?.materialSubType ?? null;
}

export interface PackagingRuleNameLike {
  materialSubType: string;
  displayName: string;
}

// 규칙의 displayName은 "오바사·스쿠이사"처럼 여러 종류를 한데 묶어 표기하기도 한다(실제
// 운영 자재명은 "오바사"만 단독으로 쓰여 있는 경우가 대부분이라, 묶음 표기 그대로
// substring 비교하면 전혀 안 걸린다) — 가운뎃점(·)/슬래시(/) 기준으로 쪼갠 각 토큰도
// 함께 비교 대상으로 쓴다.
function displayNameTokens(displayName: string): string[] {
  return [displayName, ...displayName.split(/[·/]/)].map((t) => t.trim()).filter(Boolean);
}

// 보수적 키워드 판별 — 단독 "사"는 쓰지 않는다(사이즈/라벨 등 오탐이 너무 많음, 실데이터로 확인됨).
// 1) 규칙 테이블의 displayName(코아사/오바사/스쿠이사/지누이도/다데/암홀 등)이 포함되면 해당.
// 2) "THREAD"/"TAPE"(대소문자 무시) 또는 "테이프"가 포함되면 해당.
// 3) 단독 단어 "실"이 괄호/공백/문장 경계로 둘러싸여 있으면 해당("확실", "사실" 같은 단어 안의
//    "실"은 제외) — 줄바꿈도 경계로 센다(운영 BOM 카테고리 텍스트에 \r\n이 섞여 있음, PR-185 조사).
const STANDALONE_SIL = /(^|[\s(),./\\\-])실($|[\s(),./\\\-])/;

export function looksLikeThreadOrTape(itemName: string | null | undefined, rules: PackagingRuleNameLike[]): boolean {
  const name = itemName ?? '';
  if (!name) return false;
  if (rules.some((r) => displayNameTokens(r.displayName).some((t) => name.includes(t)))) return true;
  const upper = name.toUpperCase();
  if (upper.includes('THREAD') || upper.includes('TAPE')) return true;
  if (name.includes('테이프')) return true;
  if (STANDALONE_SIL.test(name)) return true;
  return false;
}

export interface ThreadTapeSuggestion {
  materialSubType: string;
  displayName: string;
  reason: string;
}

// 자재명에 규칙의 displayName이 정확히 1개만 포함되면 그 종류를 추천한다. 0개/2개 이상이면
// 추천하지 않는다(사람이 고르게 — 안전모드).
export function buildThreadTapeSuggestion(itemName: string | null | undefined, rules: PackagingRuleNameLike[]): ThreadTapeSuggestion | null {
  const name = itemName ?? '';
  const matches = rules
    .map((r) => ({ rule: r, token: displayNameTokens(r.displayName).find((t) => name.includes(t)) }))
    .filter((m): m is { rule: PackagingRuleNameLike; token: string } => !!m.token);
  if (matches.length !== 1) return null;
  const [m] = matches;
  return { materialSubType: m.rule.materialSubType, displayName: m.rule.displayName, reason: `자재명에 "${m.token}" 포함` };
}
