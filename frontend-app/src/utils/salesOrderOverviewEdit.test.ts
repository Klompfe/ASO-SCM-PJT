import { describe, it, expect } from 'vitest';
import { updateOverviewField } from './salesOrderOverviewEdit';
import type { AiSalesOrderResult } from '../api/salesOrders.service';

const buildResult = (styleNo: string): AiSalesOrderResult => ({
  overview: {
    styleNo, styleName: null, itemType: null, brand: null, productionType: null,
    factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null,
  },
  bomItems: [],
  sizeSpecs: [],
  workNotes: null,
});

describe('updateOverviewField (PR-158)', () => {
  it('지정한 index/field만 값이 바뀌고 다른 항목은 그대로 유지된다', () => {
    const results = [buildResult('A'), buildResult('B')];
    const next = updateOverviewField(results, 1, 'targetRdd', '2026-12-30');

    expect(next[0]).toBe(results[0]); // 건드리지 않은 항목은 참조까지 동일(불변 업데이트)
    expect(next[1].overview.targetRdd).toBe('2026-12-30');
    expect(next[1].overview.styleNo).toBe('B'); // 다른 필드는 그대로
  });

  it('원본 배열/객체를 변형하지 않는다(불변)', () => {
    const results = [buildResult('A')];
    const next = updateOverviewField(results, 0, 'buyer', '새 바이어');

    expect(results[0].overview.buyer).toBeNull(); // 원본 안 바뀜
    expect(next[0].overview.buyer).toBe('새 바이어');
    expect(next).not.toBe(results);
    expect(next[0]).not.toBe(results[0]);
  });

  it('총수량처럼 숫자 필드도 그대로 반영된다', () => {
    const results = [buildResult('A')];
    const next = updateOverviewField(results, 0, 'totalQty', 500);
    expect(next[0].overview.totalQty).toBe(500);
  });

  it('빈 문자열/삭제는 null로 반영할 수 있다', () => {
    const results = [{ ...buildResult('A'), overview: { ...buildResult('A').overview, buyer: '기존값' } }];
    const next = updateOverviewField(results, 0, 'buyer', null);
    expect(next[0].overview.buyer).toBeNull();
  });
});
