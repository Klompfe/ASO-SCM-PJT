import { ProductionType } from '../../styles/entities/style-overview.entity';
import { PurchaseOrderType } from '../entities/purchase-order.entity';

export interface OrderTypeSuggestion {
  orderType: PurchaseOrderType | null;
  reason: string;
}

// PR-180: 발주에는 연결된 스타일이 없어(자재 단위) 자재를 쓰는 활성 BOM들의 스타일 계약방식으로 제안한다.
// 안전모드: 한 곳이라도 계약방식이 없거나 FOB/CMT가 섞이면 제안하지 않는다(null) — 추측해서 채우지 않는다.
export function suggestOrderType(productionTypes: (ProductionType | null | undefined)[]): OrderTypeSuggestion {
  if (productionTypes.length === 0) {
    return { orderType: null, reason: '이 자재를 쓰는 활성 BOM 스타일이 없어 구분을 제안할 수 없습니다.' };
  }
  if (productionTypes.some((t) => !t)) {
    return { orderType: null, reason: '연결된 스타일 중 계약방식(FOB/CMT)이 없는 스타일이 있어 제안하지 않습니다.' };
  }
  const distinct = new Set(productionTypes);
  if (distinct.size > 1) {
    return { orderType: null, reason: 'FOB 스타일과 CMT 스타일이 함께 쓰는 자재라 직접 고르세요.' };
  }
  return distinct.has(ProductionType.FOB)
    ? { orderType: PurchaseOrderType.FIRM, reason: '연결된 스타일이 FOB(완사입) 계약입니다.' }
    : { orderType: PurchaseOrderType.PROVISIONAL, reason: '연결된 스타일이 CMT 계약입니다 — 본사 발주 여부를 확인하세요.' };
}
