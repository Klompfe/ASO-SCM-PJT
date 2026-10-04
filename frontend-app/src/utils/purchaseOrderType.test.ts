import { describe, it, expect } from 'vitest';
import { orderTypeLabel, orderTypeNote, canCreateWithOrderType } from './purchaseOrderType';

// PR-180: 구분 표시와 발주 생성 가능 여부.
describe('발주 구분 표시 (PR-180)', () => {
  it('실발주/가발주/미지정 라벨을 구분한다', () => {
    expect(orderTypeLabel('FIRM')).toBe('실발주(FOB)');
    expect(orderTypeLabel('PROVISIONAL')).toBe('가발주(CMT)');
    expect(orderTypeLabel(null)).toBe('미지정');
    expect(orderTypeLabel(undefined)).toBe('미지정');
  });

  it('가발주에만 본사 발주 확인 안내를 붙인다', () => {
    expect(orderTypeNote('PROVISIONAL')).toBe('본사 발주 확인 필요');
    expect(orderTypeNote('FIRM')).toBeNull();
    expect(orderTypeNote(null)).toBeNull();
  });

  it('구분이 정해진 경우에만 발주를 만들 수 있다', () => {
    expect(canCreateWithOrderType('FIRM')).toBe(true);
    expect(canCreateWithOrderType('PROVISIONAL')).toBe(true);
    expect(canCreateWithOrderType(null)).toBe(false);
  });
});
