import { describe, it, expect } from 'vitest';
import { buildFieldOnlyQuery, filterExpandedOrders } from './workOrdersByStyleView';
import type { WorkOrder } from '../api/workOrders.service';

describe('buildFieldOnlyQuery (PR-159)', () => {
  const drafts = { itemName: '셔츠', itemCode: 'MB6', styleNo: 'MB62SLM103Z' };

  it('styleNo 돋보기를 누르면 styleNo만 조건에 실리고 나머지 두 필드는 빠진다', () => {
    expect(buildFieldOnlyQuery('styleNo', drafts, undefined)).toEqual({
      page: 1, status: undefined, itemName: undefined, itemCode: undefined, styleNo: 'MB62SLM103Z',
    });
  });

  it('itemName 돋보기를 누르면 itemName만 조건에 실린다', () => {
    expect(buildFieldOnlyQuery('itemName', drafts, undefined)).toEqual({
      page: 1, status: undefined, itemName: '셔츠', itemCode: undefined, styleNo: undefined,
    });
  });

  it('itemCode 돋보기를 누르면 itemCode만 조건에 실린다', () => {
    expect(buildFieldOnlyQuery('itemCode', drafts, undefined)).toEqual({
      page: 1, status: undefined, itemName: undefined, itemCode: 'MB6', styleNo: undefined,
    });
  });

  it('이미 선택된 상태 필터는 그대로 유지된다("다른 두 칸"에 상태는 포함되지 않음)', () => {
    expect(buildFieldOnlyQuery('styleNo', drafts, 'IN_PROGRESS')).toEqual({
      page: 1, status: 'IN_PROGRESS', itemName: undefined, itemCode: undefined, styleNo: 'MB62SLM103Z',
    });
  });

  it('세 칸을 모두 채운 뒤 하나만 돋보기를 눌러도 나머지 두 값은 이번 조회에서만 빠진다(draft 자체는 이 함수가 건드리지 않음)', () => {
    const result = buildFieldOnlyQuery('itemCode', drafts, undefined);
    expect(result.itemName).toBeUndefined();
    expect(result.styleNo).toBeUndefined();
    expect(result.itemCode).toBe('MB6');
    // drafts 원본 객체는 변형되지 않는다(불변).
    expect(drafts).toEqual({ itemName: '셔츠', itemCode: 'MB6', styleNo: 'MB62SLM103Z' });
  });
});

describe('filterExpandedOrders (PR-159)', () => {
  const wo = (id: number, status: string): WorkOrder => ({ id, status, itemId: 1, targetQuantity: 1 });
  const orders = [wo(1, 'PENDING'), wo(2, 'IN_PROGRESS'), wo(3, 'COMPLETED'), wo(4, 'CANCELLED')];

  it('기본(showAll=false)은 대기/진행중만 남긴다', () => {
    expect(filterExpandedOrders(orders, false).map((o) => o.id)).toEqual([1, 2]);
  });

  it('전체보기(showAll=true)면 완료/취소 건도 포함해 전부 돌려준다', () => {
    expect(filterExpandedOrders(orders, true)).toEqual(orders);
  });

  it('빈 배열이면 빈 배열', () => {
    expect(filterExpandedOrders([], false)).toEqual([]);
  });
});
