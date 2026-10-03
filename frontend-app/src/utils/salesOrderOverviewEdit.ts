import type { AiSalesOrderResult, AiOverview } from '../api/salesOrders.service';

// PR-158: 검토 화면(저장 전)에서 오더개요 필드를 직접 수정할 때 쓰는 순수 업데이트
// 함수 — 컴포넌트 밖으로 뽑아 DOM 없이 유닛 테스트할 수 있게 한다. index가 아닌
// 항목/필드는 절대 건드리지 않고, 불변으로 새 배열을 반환한다.
export function updateOverviewField<K extends keyof AiOverview>(
  results: AiSalesOrderResult[],
  index: number,
  field: K,
  value: AiOverview[K],
): AiSalesOrderResult[] {
  return results.map((r, i) => (i === index ? { ...r, overview: { ...r.overview, [field]: value } } : r));
}
