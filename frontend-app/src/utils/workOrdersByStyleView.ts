import type { WorkOrder } from '../api/workOrders.service';
import type { WorkOrderListQuery } from './listQueries';

// PR-159: 작업지시 목록 화면 2단계 구조 개편에서 쓰는 순수 로직 — 컴포넌트 밖으로 뽑아
// DOM 없이 유닛 테스트한다.

// 필드별 돋보기 — 그 필드 값만으로 조회하도록 query를 새로 만든다. 다른 두 텍스트 필드는
// 화면(draft)엔 남겨두되 이번 조회 조건에서는 뺀다. 상태 필터는 이미 선택된 값을 유지한다
// ("다른 두 칸"에 상태는 포함되지 않는다는 지시서 해석 — 완료 보고 참고).
export type TextField = 'itemName' | 'itemCode' | 'styleNo';

export function buildFieldOnlyQuery(
  field: TextField,
  drafts: { itemName: string; itemCode: string; styleNo: string },
  currentStatus: string | undefined,
): WorkOrderListQuery {
  return {
    page: 1,
    status: currentStatus,
    itemName: field === 'itemName' ? drafts.itemName : undefined,
    itemCode: field === 'itemCode' ? drafts.itemCode : undefined,
    styleNo: field === 'styleNo' ? drafts.styleNo : undefined,
  };
}

const IN_PROGRESS_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);

// 2단계 세부 목록 — 기본은 진행중(대기/진행중)만, "전체 보기"면 전부.
export function filterExpandedOrders(orders: WorkOrder[], showAll: boolean): WorkOrder[] {
  if (showAll) return orders;
  return orders.filter((wo) => IN_PROGRESS_STATUSES.has(wo.status));
}
