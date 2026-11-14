// PR-240: 자재명세의 "발주하기"(행별·PR-238 일괄 화면 모두)로 넘어갈 때 공급업체·단가가
// 비어 있던 문제 — 이미 시스템에 있는 정보(BOM 행 공급사/확정 단가, 품목 마스터 vendor,
// 같은 자재의 최근 발주 공급사/단가)를 우선순위대로 미리 채운다. 수량은 기존
// resolveAppliedQuantity/suggestStyleLinkedQuantity(포장 환산·needsColorQty·극단 불일치
// 안전정책 포함)를 그대로 재사용하므로 여기서 새로 다루지 않는다.
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
}

export interface ResolvedPricePrefill {
  unitPrice: number;
  source: PricePrefillSource;
}

export function pickPricePrefill(input: PricePrefillInput): ResolvedPricePrefill | null {
  if (!input.packagingApplies && input.bomUnitPrice != null && input.bomUnitPrice > 0) {
    return { unitPrice: input.bomUnitPrice, source: 'bom' };
  }
  if (input.recentOrderUnitPrice != null && input.recentOrderUnitPrice > 0) {
    return { unitPrice: input.recentOrderUnitPrice, source: 'recentOrder' };
  }
  return null;
}
