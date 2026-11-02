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

// PR-194: 종류 코드(COA_SA/DADE 등)를 규칙 테이블의 displayName으로 바꾼다 — 다품번
// 일괄발주 화면에서 품목군 아래 "종류" 한 줄을 보여줄 때 쓴다. 규칙에 없는 코드가
// 와도(데이터 누락) 추측하지 않고 코드 자체를 그대로 보여준다(화면에서 이상함을
// 눈치챌 수 있게 — 조용히 숨기지 않음).
export function materialSubTypeLabel(materialSubType: string | null | undefined, rules: PackagingRuleNameLike[]): string | null {
  if (!materialSubType) return null;
  return rules.find((r) => r.materialSubType === materialSubType)?.displayName ?? materialSubType;
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

// PR-219: 발주 폼의 "실/테이프 종류 추천" — buildThreadTapeSuggestion(displayName 토큰
// 직접 일치)보다 넓은 "봉제 전문가 관점" 동의어 키워드로 추천한다. 번수(60S/3 등)로는
// 추측하지 않는다(안전모드 원칙 유지). 자동 저장하지 않는다 — 참고 계산에만 쓰고, 사람이
// 확인 후 버튼을 눌러야 기존 classifyThreadTape API로 저장된다.
export interface ThreadTapeKeywordSuggestion {
  materialSubType: string;
  displayName: string;
  reason: string;
  // 이름에 상충되는 키워드가 함께 있어 추천은 내지만 신뢰도가 낮음(사람 확인 필요).
  conflict?: boolean;
  conflictReason?: string;
}

const OBA_KEYWORDS = ['오바', '오버로크', '배색사', '배색 실'];
const COA_KEYWORDS = ['본봉', '스티치'];
const JINUIDO_KEYWORDS = ['지누이도'];
const BAESAEK_KEYWORD = '배색';

export function suggestThreadTapeByKeyword(
  itemName: string | null | undefined,
  rules: PackagingRuleNameLike[],
): ThreadTapeKeywordSuggestion | null {
  const name = itemName ?? '';
  if (!name) return null;
  const upper = name.toUpperCase();
  const hasOba = OBA_KEYWORDS.some((k) => name.includes(k));
  const hasCoa = COA_KEYWORDS.some((k) => name.includes(k)) || upper.includes('QQ');
  const hasJinuido = JINUIDO_KEYWORDS.some((k) => name.includes(k));
  const hasBaesaek = name.includes(BAESAEK_KEYWORD);

  const findRule = (subType: string) => rules.find((r) => r.materialSubType === subType);

  // 다데/암홀(테이프류)은 전용 키워드라 충돌 걱정 없이 displayName을 그대로 쓴다.
  const dadeRule = findRule('DADE');
  if (dadeRule && name.includes(dadeRule.displayName)) {
    return { materialSubType: dadeRule.materialSubType, displayName: dadeRule.displayName, reason: '다데/암홀 테이프' };
  }
  const amholRule = findRule('AMHOL');
  if (amholRule && name.includes(amholRule.displayName)) {
    return { materialSubType: amholRule.materialSubType, displayName: amholRule.displayName, reason: '다데/암홀 테이프' };
  }

  if (hasJinuido) {
    const rule = findRule('POLY_JINUIDO');
    if (rule) return { materialSubType: rule.materialSubType, displayName: rule.displayName, reason: '지누이도' };
  }

  // 충돌: 본봉/스티치/QQ(코아사 계열)와 오버로크/배색 계열이 함께 있으면 코아사를
  // 추천하되(둘 중 하나는 골라야 하므로) 확인 필요 배지를 단다.
  if (hasCoa && (hasOba || hasBaesaek)) {
    const rule = findRule('COA_SA');
    if (rule) {
      return {
        materialSubType: rule.materialSubType,
        displayName: rule.displayName,
        reason: '본봉·스티치용 실',
        conflict: true,
        conflictReason: hasOba ? '이름에 오버로크/배색 계열 키워드도 있어 확인 필요' : '이름에 배색도 있어 확인 필요',
      };
    }
  }
  if (hasOba) {
    const rule = findRule('OBA_SA_SKU_I_SA');
    if (rule) return { materialSubType: rule.materialSubType, displayName: rule.displayName, reason: '오버로크·배색용 실' };
  }
  if (hasCoa) {
    const rule = findRule('COA_SA');
    if (rule) return { materialSubType: rule.materialSubType, displayName: rule.displayName, reason: '본봉·스티치용 실' };
  }
  return null;
}
