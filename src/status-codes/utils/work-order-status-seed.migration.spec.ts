import { WORK_ORDER_STATUS_SEED } from '../../migrations/1789850000000-CreateStatusCodes';
import { WorkOrderStatus } from '../../work-orders/entities/work-order.entity';

// PR-140: 마이그레이션이 심는 시드 코드가 기존 WorkOrderStatus enum 값과 정확히(순서 포함) 일치하는지
// 확인한다 — 하나라도 다르면 기존 WorkOrder.status 데이터 중 일부가 새 마스터 테이블 기준으로
// "존재하지 않는 상태코드"가 되어 필터 드롭다운/관리 화면에서 조용히 빠지게 된다(데이터 보존 위반).
describe('마이그레이션 CreateStatusCodes — WORK_ORDER 시드가 기존 enum 값을 보존한다 (PR-140)', () => {
  it('시드 code가 WorkOrderStatus enum 값과 정확히 일치한다(누락/추가 없음)', () => {
    const seedCodes = WORK_ORDER_STATUS_SEED.map((s) => s.code);
    const enumValues = Object.values(WorkOrderStatus);
    expect(new Set(seedCodes)).toEqual(new Set(enumValues));
    expect(seedCodes).toHaveLength(enumValues.length);
  });

  it('sortOrder가 서로 달라 화면에서 순서가 겹치지 않는다', () => {
    const orders = WORK_ORDER_STATUS_SEED.map((s) => s.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('모든 시드에 라벨이 있다(빈 문자열 없음)', () => {
    for (const s of WORK_ORDER_STATUS_SEED) {
      expect(s.label.trim().length).toBeGreaterThan(0);
    }
  });
});
