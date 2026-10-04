// PR-180: 발주 구분 — 실발주(FIRM, FOB/완사입)는 태일이 공급업체에 직접 발주하고,
// 가발주(PROVISIONAL, CMT)는 본사가 실제 발주하며 태일은 발주 여부를 확인하며 출고/입고/선적을 챙긴다.
export type PurchaseOrderType = 'FIRM' | 'PROVISIONAL';

export const orderTypeLabel = (t: PurchaseOrderType | null | undefined): string =>
  t === 'FIRM' ? '실발주(FOB)' : t === 'PROVISIONAL' ? '가발주(CMT)' : '미지정';

// 가발주는 "본사 발주 확인 필요"를 함께 보여 준다(본사가 실제로 발주했는지 확인하는 역할임을 상기시킨다).
export const orderTypeNote = (t: PurchaseOrderType | null | undefined): string | null =>
  t === 'PROVISIONAL' ? '본사 발주 확인 필요' : null;

// 구분을 골라야 발주를 만들 수 있다 — 제안값이 있으면 미리 채우고, 없으면 사람이 직접 고른다.
export const canCreateWithOrderType = (t: PurchaseOrderType | null | undefined): boolean => t === 'FIRM' || t === 'PROVISIONAL';
