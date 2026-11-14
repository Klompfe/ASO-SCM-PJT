import { describe, it, expect } from 'vitest';
import {
  normalizeSupplierNameForMatch,
  findExactSupplierMatch,
  pickSupplierPrefill,
  pickPricePrefill,
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
      unitPrice: 1000, source: 'bom',
    });
  });

  it('BOM 확정 단가가 0이거나 없으면(미입력) 최근 발주 단가를 쓴다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 0, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({
      unitPrice: 2000, source: 'recentOrder',
    });
    expect(pickPricePrefill({ bomUnitPrice: null, recentOrderUnitPrice: 2000, packagingApplies: false })).toEqual({
      unitPrice: 2000, source: 'recentOrder',
    });
  });

  it('포장 환산이 적용되는 행은(단위 기준이 달라 자동 환산 금지) BOM 확정 단가를 쓰지 않고 최근 발주 단가만 쓴다', () => {
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: 2000, packagingApplies: true })).toEqual({
      unitPrice: 2000, source: 'recentOrder',
    });
  });

  it('둘 다 없으면 null(비움)', () => {
    expect(pickPricePrefill({ bomUnitPrice: null, recentOrderUnitPrice: null, packagingApplies: false })).toBeNull();
    expect(pickPricePrefill({ bomUnitPrice: 1000, recentOrderUnitPrice: null, packagingApplies: true })).toBeNull();
  });
});
