import { suggestOrderType } from './purchase-order-type.util';
import { ProductionType } from '../../styles/entities/style-overview.entity';
import { PurchaseOrderType } from '../entities/purchase-order.entity';

// PR-180: 발주 구분 제안 규칙 — 확신할 수 없으면 제안하지 않는다(안전모드).
describe('suggestOrderType (PR-180)', () => {
  it('연결된 스타일이 없으면 제안하지 않는다', () => {
    expect(suggestOrderType([]).orderType).toBeNull();
  });

  it('FOB 스타일만 있으면 실발주(FIRM)를 제안한다', () => {
    expect(suggestOrderType([ProductionType.FOB, ProductionType.FOB]).orderType).toBe(PurchaseOrderType.FIRM);
  });

  it('CMT 스타일만 있으면 가발주(PROVISIONAL)를 제안한다', () => {
    expect(suggestOrderType([ProductionType.CMT]).orderType).toBe(PurchaseOrderType.PROVISIONAL);
  });

  it('FOB와 CMT가 섞이면 제안하지 않고 이유를 남긴다', () => {
    const s = suggestOrderType([ProductionType.FOB, ProductionType.CMT]);
    expect(s.orderType).toBeNull();
    expect(s.reason).toContain('직접 고르세요');
  });

  it('계약방식이 없는 스타일이 하나라도 있으면 제안하지 않는다', () => {
    expect(suggestOrderType([ProductionType.FOB, null]).orderType).toBeNull();
    expect(suggestOrderType([undefined]).orderType).toBeNull();
  });
});
