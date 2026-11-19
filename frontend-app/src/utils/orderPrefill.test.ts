import { describe, it, expect } from 'vitest';
import {
  normalizeSupplierNameForMatch,
  findExactSupplierMatch,
  pickSupplierPrefill,
  pickPricePrefill,
  recentPriceSkippedNotice,
  describeBomSupplierMismatch,
  bomSupplierMismatchShortLabel,
  bomSupplierMismatchNotice,
  type SupplierRefLike,
} from './orderPrefill';

const SUP_A: SupplierRefLike = { id: 1, name: '합성공급사A' };
const SUP_B: SupplierRefLike = { id: 2, name: '합성공급사B' };

describe('normalizeSupplierNameForMatch (PR-240)', () => {
  it('빈 값/공백/"미정"/"N/A"는 값 없음으로 본다', () => {
    expect(normalizeSupplierNameForMatch(null)).toBe('');
    expect(normalizeSupplierNameForMatch(undefined)).toBe('');
    expect(normalizeSupplierNameForMatch('')).toBe('');
    expect(normalizeSupplierNameForMatch('   ')).toBe('');
    expect(normalizeSupplierNameForMatch('미정')).toBe('');
    expect(normalizeSupplierNameForMatch('N/A')).toBe('');
  });

  it('실제 이름은 앞뒤 공백만 제거하고 그대로 돌려준다', () => {
    expect(normalizeSupplierNameForMatch('  합성공급사A  ')).toBe('합성공급사A');
  });
});

describe('findExactSupplierMatch (PR-240)', () => {
  it('공백/대소문자만 다른 정확히 같은 이름은 매칭된다(추측 매칭 아님)', () => {
    expect(findExactSupplierMatch('합성공급사A', [SUP_A, SUP_B])).toEqual(SUP_A);
    expect(findExactSupplierMatch('  합성공급사A  ', [SUP_A, SUP_B])).toEqual(SUP_A);
  });

  it('부분 일치/약어는 매칭하지 않는다', () => {
    expect(findExactSupplierMatch('합성공급사', [SUP_A, SUP_B])).toBeNull();
  });

  it('값이 없거나(미정 등) 후보에 없으면 null', () => {
    expect(findExactSupplierMatch('미정', [SUP_A, SUP_B])).toBeNull();
    expect(findExactSupplierMatch('없는공급사', [SUP_A, SUP_B])).toBeNull();
  });
});

describe('pickSupplierPrefill (PR-240)', () => {
  it('우선순위: BOM 공급사 > 자재 마스터 > 최근 발주 > 없음', () => {
    expect(pickSupplierPrefill({ bom: SUP_A, vendor: SUP_B, recentOrder: SUP_B })).toEqual({ supplier: SUP_A, source: 'bom' });
    expect(pickSupplierPrefill({ bom: null, vendor: SUP_B, recentOrder: SUP_A })).toEqual({ supplier: SUP_B, source: 'vendor' });
    expect(pickSupplierPrefill({ bom: null, vendor: null, recentOrder: SUP_A })).toEqual({ supplier: SUP_A, source: 'recentOrder' });
    expect(pickSupplierPrefill({ bom: null, vendor: null, recentOrder: null })).toBeNull();
  });
});

describe('pickPricePrefill (PR-240)', () => {
  it('포장 환산이 적용되지 않는 행은 BOM 확정 단가를 1순위로 쓴다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({
      unitPrice: 1000, source: 'bom', currency: 'KRW',
    });
  });

  it('BOM 확정 단가가 0이거나 없으면(미입력) 최근 발주 단가를 쓴다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 0, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({
      unitPrice: 2000, source: 'recentOrder', currency: 'KRW',
    });
    expect(pickPricePrefill({ bomUnitPrice: null, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({
      unitPrice: 2000, source: 'recentOrder', currency: 'KRW',
    });
  });

  it('포장 환산이 적용되는 행은(단위 기준이 달라 자동 환산 금지) BOM 확정 단가를 쓰지 않고 최근 발주 단가만 쓴다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: 2000, packagingApplies: true })).toEqual({
      unitPrice: 2000, source: 'recentOrder', currency: 'KRW',
    });
  });

  it('둘 다 없으면 null(비움)', () => {
    expect(pickPricePrefill({ bomUnitPrice: null, recentOrderUnitPrice: null, packagingApplies: false })).toBeNull();
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: null, packagingApplies: true })).toBeNull();
  });
});

// PR-241 C: BOM 행 수정에서 공급업체/단가를 저장하면, 이 PR이 전혀 건드리지 않은 PR-240
// 미리 채움(발주하기/일괄 발주)이 그 "수정된 값"을 그대로 1순위로 읽는지 확인한다 —
// PurchaseOrdersManager.tsx/BomBulkOrderPanel.tsx는 매번 getBomByStyleNo로 새로 받아온
// BOM 행을 그대로 pickSupplierPrefill/pickPricePrefill에 넘기므로, 새 캐시 계층이 없어
// "저장한 값이 곧 다음 조회의 BOM 공급사/확정 단가"가 된다(새로고침 없이 반영).
describe('PR-241 C 저장값을 PR-240 미리 채움이 그대로 읽는다', () => {
  it('BOM 행 수정에서 방금 저장한 공급업체가 최근 발주 이력보다 우선 적용된다', () => {
    const justEditedBomSupplier = findExactSupplierMatch('합성공급사A', [SUP_A, SUP_B]);
    const recentOrderSupplier = SUP_B; // 이력상으로는 B가 최근이었더라도
    const result = pickSupplierPrefill({ bom: justEditedBomSupplier, vendor: null, recentOrder: recentOrderSupplier });
    expect(result).toEqual({ supplier: SUP_A, source: 'bom' });
  });

  it('BOM 행 수정에서 방금 저장한 단가(포장 환산 없는 일반 행)가 최근 발주 단가보다 우선 적용된다', () => {
    const justEditedBomUnitPrice = 9999;
    const result = pickPricePrefill({ bomUnitPrice: justEditedBomUnitPrice, recentOrderUnitPrice: 1, packagingApplies: false });
    expect(result).toEqual({ unitPrice: 9999, source: 'bom', currency: 'KRW' });
  });
});

// PR-242: BOM 공급사가 마스터에 없을 때 조용히 비던 것 — 이유를 구분해서 보여준다(채움
// 결과는 그대로, 이유만 추가). 매칭 자체는 findExactSupplierMatch(정확 일치 + 정규화)가
// 이미 하므로, 여기서는 "왜 안 됐는지"만 합성 데이터로 검증한다.
describe('describeBomSupplierMismatch (PR-242)', () => {
  it('매칭된 경우(bomMatch 있음) 사유가 없다', () => {
    expect(describeBomSupplierMismatch('합성공급사A', SUP_A)).toBeNull();
  });

  it('BOM 공급사가 비어 있으면 bomSupplierEmpty', () => {
    expect(describeBomSupplierMismatch('', null)).toEqual({ reason: 'bomSupplierEmpty', rawName: null });
    expect(describeBomSupplierMismatch(null, null)).toEqual({ reason: 'bomSupplierEmpty', rawName: null });
    expect(describeBomSupplierMismatch('   ', null)).toEqual({ reason: 'bomSupplierEmpty', rawName: null });
  });

  it('"미정"/"N/A"면 bomSupplierPlaceholder', () => {
    expect(describeBomSupplierMismatch('미정', null)).toEqual({ reason: 'bomSupplierPlaceholder', rawName: '미정' });
    expect(describeBomSupplierMismatch('N/A', null)).toEqual({ reason: 'bomSupplierPlaceholder', rawName: 'N/A' });
  });

  it('실제 이름인데 매칭되지 않으면(마스터 미등록) bomSupplierNotInMaster — 원문 이름을 그대로 담는다', () => {
    expect(describeBomSupplierMismatch('본사', null)).toEqual({ reason: 'bomSupplierNotInMaster', rawName: '본사' });
  });

  it('부분 일치(약어 등)로 실제로는 매칭되지 않은 경우도 호출하는 쪽이 넘긴 bomMatch=null을 그대로 따른다(여기서 추가 매칭을 하지 않음)', () => {
    expect(describeBomSupplierMismatch('합성공급사', null)).toEqual({ reason: 'bomSupplierNotInMaster', rawName: '합성공급사' });
  });
});

describe('bomSupplierMismatchShortLabel / bomSupplierMismatchNotice (PR-242)', () => {
  it('마스터에 없는 경우 — 짧은 라벨과 전체 안내 문구 모두 원문 이름을 담는다', () => {
    const m = { reason: 'bomSupplierNotInMaster' as const, rawName: '본사' };
    expect(bomSupplierMismatchShortLabel(m)).toBe('마스터에 없음: 본사');
    expect(bomSupplierMismatchNotice(m)).toContain("'본사'");
    expect(bomSupplierMismatchNotice(m)).toContain('공급업체 마스터에 없습니다');
  });

  it('비어 있음/미정은 짧은 라벨만 있고, 전체 안내 문구는 없다(소음 방지 — 조치할 게 없음)', () => {
    expect(bomSupplierMismatchShortLabel({ reason: 'bomSupplierEmpty', rawName: null })).toBe('BOM 공급사 비어 있음');
    expect(bomSupplierMismatchShortLabel({ reason: 'bomSupplierPlaceholder', rawName: '미정' })).toBe('미정');
    expect(bomSupplierMismatchNotice({ reason: 'bomSupplierEmpty', rawName: null })).toBeNull();
    expect(bomSupplierMismatchNotice({ reason: 'bomSupplierPlaceholder', rawName: '미정' })).toBeNull();
  });
});

describe('pickPricePrefill — 통화 규칙 (PR-244b)', () => {
  it('통화 정보가 없으면(기존 호출) 이전과 같고 통화는 KRW', () => {
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({ unitPrice: 1000, source: 'bom', currency: 'KRW' });
    expect(pickPricePrefill({ bomUnitPrice: 0, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({ unitPrice: 2000, source: 'recentOrder', currency: 'KRW' });
  });

  it('BOM 확정 단가는 BOM 행의 통화로 함께 채운다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 2.5, bomCurrency: 'USD', recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({ unitPrice: 2.5, source: 'bom', currency: 'USD' });
  });

  it('최근 발주 단가는 통화가 폼(=BOM 통화)과 같을 때만 채운다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 0, bomCurrency: 'USD', recentOrderUnitPrice: 3, recentOrderCurrency: 'USD', packagingApplies: false })).toEqual({ unitPrice: 3, source: 'recentOrder', currency: 'USD' });
    expect(pickPricePrefill({ bomUnitPrice: 0, bomCurrency: 'USD', recentOrderUnitPrice: 2000, recentOrderCurrency: 'KRW', packagingApplies: false })).toBeNull();
    expect(pickPricePrefill({ bomUnitPrice: 0, recentOrderUnitPrice: 3, recentOrderCurrency: 'USD', packagingApplies: false })).toBeNull();
  });

  it('포장 환산 자재: BOM 단가 제외 + 통화가 다른 최근 단가도 비움(값을 환산해 넣지 않는다)', () => {
    expect(pickPricePrefill({ bomUnitPrice: 2.5, bomCurrency: 'USD', recentOrderUnitPrice: 2000, recentOrderCurrency: 'KRW', packagingApplies: true })).toBeNull();
  });

  it('명시한 폼 통화(formCurrency)가 우선한다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 0, bomCurrency: 'USD', formCurrency: 'KRW', recentOrderUnitPrice: 2000, recentOrderCurrency: 'KRW', packagingApplies: false })?.currency).toBe('KRW');
  });
});

describe('recentPriceSkippedNotice (PR-244b)', () => {
  it('통화 불일치로 못 채웠을 때만 이유를 낸다', () => {
    expect(recentPriceSkippedNotice({ bomUnitPrice: 0, bomCurrency: 'USD', recentOrderUnitPrice: 2000, recentOrderCurrency: 'KRW', packagingApplies: false }))
      .toBe('최근 발주 단가는 다른 통화(KRW)라 채우지 않았습니다.');
    // 채워졌거나 최근 단가가 없거나 같은 통화면 안내 없음
    expect(recentPriceSkippedNotice({ bomUnitPrice: 5, bomCurrency: 'USD', recentOrderUnitPrice: 2000, recentOrderCurrency: 'KRW', packagingApplies: false })).toBeNull();
    expect(recentPriceSkippedNotice({ bomUnitPrice: 0, recentOrderUnitPrice: null, packagingApplies: false })).toBeNull();
    expect(recentPriceSkippedNotice({ bomUnitPrice: 0, recentOrderUnitPrice: 2000, packagingApplies: false })).toBeNull();
  });
});
