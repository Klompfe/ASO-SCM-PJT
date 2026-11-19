// PR-240: 자재명세의 "발주하기"(행별·PR-238 일괄 화면 모두)로 넘어갈 때 공급업체·단가가
// 비어 있던 문제 — 이미 시스템에 있는 정보(BOM 행 공급사/확정 단가, 품목 마스터 vendor,
// 같은 자재의 최근 발주 공급사/단가)를 우선순위대로 미리 채운다. 수량은 기존
// resolveAppliedQuantity/suggestStyleLinkedQuantity(포장 환산·needsColorQty·극단 불일치
// 안전정책 포함)를 그대로 재사용하므로 여기서 새로 다루지 않는다.
import { normalizeCurrency, type Currency } from './currency';

export interface SupplierRefLike {
  id: number;
  name: string;
}

export type SupplierPrefillSource = 'bom' | 'vendor' | 'recentOrder';
export type PricePrefillSource = 'bom' | 'recentOrder';

export const SUPPLIER_SOURCE_LABEL: Record<SupplierPrefillSource, string> = {
  bom: 'BOM 공급사',
  vendor: '자재 마스터',
  recentOrder: '최근 발주',
};

export const PRICE_SOURCE_LABEL: Record<PricePrefillSource, string> = {
  bom: 'BOM 확정 단가',
  recentOrder: '최근 발주 단가',
};

// BOM 행/품목 마스터의 공급사는 자유 텍스트라 "미정"/빈 값/"N/A"는 값이 없는 것으로
// 본다(추측 매칭 없음 — 정확히 같은 이름일 때만 실제 공급업체로 본다, 이 파일의
// findExactSupplierMatch와 짝).
export function normalizeSupplierNameForMatch(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n || n === 'N/A' || n === '미정') return '';
  return n;
}

// 공백/대소문자만 다른 표기는 같은 공급업체로 본다(정확히 일치하는 이름만 — 약어·부분
// 일치 추측 매칭은 하지 않는다, 기존 normalizeColorForMatch와 같은 안전모드 원칙).
export function findExactSupplierMatch<T extends SupplierRefLike>(name: string | null | undefined, candidates: T[]): T | null {
  const norm = normalizeSupplierNameForMatch(name);
  if (!norm) return null;
  const target = norm.toLocaleUpperCase('ko-KR');
  return candidates.find((c) => c.name.trim().toLocaleUpperCase('ko-KR') === target) ?? null;
}

export interface SupplierPrefillCandidates<T extends SupplierRefLike> {
  bom: T | null;
  vendor: T | null;
  recentOrder: T | null;
}

export interface ResolvedSupplierPrefill<T extends SupplierRefLike> {
  supplier: T;
  source: SupplierPrefillSource;
}

// 우선순위: ① BOM 행 공급사 → ② 품목 마스터(vendor) → ③ 같은 자재의 최근 발주 공급사 →
// ④ 없으면 null(비움). 이름 매칭(findExactSupplierMatch)은 호출하는 쪽에서 미리 끝내고
// 그 결과(실제 존재하는 공급업체 또는 null)만 넘긴다 — 이 함수는 순수 우선순위 결정만 한다.
export function pickSupplierPrefill<T extends SupplierRefLike>(candidates: SupplierPrefillCandidates<T>): ResolvedSupplierPrefill<T> | null {
  if (candidates.bom) return { supplier: candidates.bom, source: 'bom' };
  if (candidates.vendor) return { supplier: candidates.vendor, source: 'vendor' };
  if (candidates.recentOrder) return { supplier: candidates.recentOrder, source: 'recentOrder' };
  return null;
}

export interface PricePrefillInput {
  // BOM 행 확정 단가 — 0 또는 null이면 "없음"으로 취급한다(미입력과 진짜 0원을 구분하지
  // 않는다, 기존 BomItemRow.unitPrice 관례와 동일).
  bomUnitPrice: number | null | undefined;
  // 같은 자재 + (가능하면) 같은 공급사의 가장 최근 발주 단가.
  recentOrderUnitPrice: number | null | undefined;
  // 이 자재에 포장 환산(N콘/N롤)이 적용되는지 — true면 BOM 확정 단가(길이 기준으로 저장된
  // 값)를 포장 단위 수량에 그대로 쓰면 금액이 틀리므로(자동 환산 금지 요구사항) BOM 확정
  // 단가는 후보에서 제외하고 최근 발주 단가(이미 같은 포장 단위 기준으로 쌓인 값)만 쓴다.
  packagingApplies: boolean;
  // PR-244b: 단가의 통화. 생략하면 KRW(기존 호출·데이터와 동일).
  // bomCurrency = BOM 행의 통화(BOM 확정 단가의 통화이자, BOM 에서 넘어올 때 폼의 통화로 함께 채운다).
  // recentOrderCurrency = 최근 발주의 통화. 폼의 통화(formCurrency, 생략 시 bomCurrency)와 다르면 채우지 않는다.
  bomCurrency?: string | null;
  recentOrderCurrency?: string | null;
  formCurrency?: string | null;
}

export interface ResolvedPricePrefill {
  unitPrice: number;
  source: PricePrefillSource;
  // 이 단가가 입력된 통화 — 화면은 통화 칸을 이 값으로 채우고 출처(source)를 함께 보여 준다.
  currency: Currency;
}

// 폼의 통화: 명시되면 그 값, 아니면 BOM 행의 통화(BOM 에서 발주하러 넘어온 경우 폼은 BOM 통화로 시작한다).
function targetCurrency(input: PricePrefillInput): Currency {
  return normalizeCurrency(input.formCurrency ?? input.bomCurrency);
}

// 최근 발주 단가는 통화가 폼과 같을 때만 쓸 수 있다 — 다르면 값을 환산해서 넣지 않고 비운다.
export function recentOrderPriceUsable(input: PricePrefillInput): boolean {
  return input.recentOrderUnitPrice != null && input.recentOrderUnitPrice > 0
    && normalizeCurrency(input.recentOrderCurrency) === targetCurrency(input);
}

export function pickPricePrefill(input: PricePrefillInput): ResolvedPricePrefill | null {
  if (!input.packagingApplies && input.bomUnitPrice != null && input.bomUnitPrice > 0) {
    return { unitPrice: input.bomUnitPrice, source: 'bom', currency: normalizeCurrency(input.bomCurrency) };
  }
  if (recentOrderPriceUsable(input)) {
    return { unitPrice: input.recentOrderUnitPrice as number, source: 'recentOrder', currency: targetCurrency(input) };
  }
  return null;
}

// 최근 발주 단가가 있는데 통화가 달라 채우지 않았다면 그 이유(없으면 null).
// 이미 BOM 단가로 채워졌다면(= 최근 발주 단가를 쓰지 않는 경우) 안내하지 않는다.
export function recentPriceSkippedNotice(input: PricePrefillInput): string | null {
  if (pickPricePrefill(input)) return null;
  if (input.recentOrderUnitPrice == null || !(input.recentOrderUnitPrice > 0)) return null;
  const recent = normalizeCurrency(input.recentOrderCurrency);
  if (recent === targetCurrency(input)) return null;
  return `최근 발주 단가는 다른 통화(${recent})라 채우지 않았습니다.`;
}

// PR-242: BOM에 적힌 공급사 원문이 "공급업체 마스터"와 왜 연결되지 않았는지(findExactSupplierMatch
// 실패 사유) — 채움 결과(pickSupplierPrefill)는 그대로 두고, 이유만 화면에 보여주기 위한 것이다.
// 매칭 규칙은 바꾸지 않는다(정확 일치 + 공백·대소문자·괄호 기호 정규화까지, 부분 일치/추측 금지).
export type BomSupplierMismatchReason = 'bomSupplierNotInMaster' | 'bomSupplierEmpty' | 'bomSupplierPlaceholder';

export interface BomSupplierMismatch {
  reason: BomSupplierMismatchReason;
  // 'bomSupplierNotInMaster'일 때만 의미 있는 원문 이름(다른 사유는 null).
  rawName: string | null;
}

// bomMatch가 이미 있으면(정상 매칭) 사유가 없다(null). 없으면 원문이 비어 있었는지(empty),
// "미정"/"N/A"였는지(placeholder), 아니면 실제 이름인데 마스터에 없는지(notInMaster)를 구분한다.
export function describeBomSupplierMismatch(
  bomSupplierRaw: string | null | undefined,
  bomMatch: SupplierRefLike | null,
): BomSupplierMismatch | null {
  if (bomMatch) return null;
  const raw = (bomSupplierRaw ?? '').trim();
  if (!raw) return { reason: 'bomSupplierEmpty', rawName: null };
  if (raw === 'N/A' || raw === '미정') return { reason: 'bomSupplierPlaceholder', rawName: raw };
  return { reason: 'bomSupplierNotInMaster', rawName: raw };
}

// PR-238 일괄 발주 화면의 "공급사 미지정" 표/요약에 쓰는 짧은 라벨.
export function bomSupplierMismatchShortLabel(m: BomSupplierMismatch): string {
  switch (m.reason) {
    case 'bomSupplierNotInMaster':
      return `마스터에 없음: ${m.rawName}`;
    case 'bomSupplierEmpty':
      return 'BOM 공급사 비어 있음';
    case 'bomSupplierPlaceholder':
      return '미정';
  }
}

// 행별 발주 입력 칸/BOM 행 수정 화면에 보여줄 전체 안내 문구 — "마스터에 없음"(실제 이름이
// 있는데 등록이 안 된 경우)만 사람이 조치할 수 있는 상황이라 안내한다. 비어 있음/미정은
// 애초에 BOM에 적힌 값이 없을 뿐이라 안내할 "이유"가 없다(소음 방지).
export function bomSupplierMismatchNotice(m: BomSupplierMismatch): string | null {
  if (m.reason !== 'bomSupplierNotInMaster') return null;
  return `BOM 공급사 '${m.rawName}'는 공급업체 마스터에 없습니다. 마스터·설정 > 공급업체에서 등록하거나 직접 선택하세요.`;
}
