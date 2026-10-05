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

// PR-181: 미도 작지 수기 CMT단가 — AI 후보를 "사용" 버튼 없이 입력란에 초안으로 미리
// 채운다(기존 PR-168의 "사용" 2단계 확인을 없애고, 대신 계약 승인 때 한 번 더 확인하는
// 방식으로 바뀜). cmtPrice가 이미 있으면(사람이 이미 손댔거나 재분석) 덮어쓰지 않는다.
export function prefillHandwrittenCmtDraft(results: AiSalesOrderResult[]): AiSalesOrderResult[] {
  return results.map((r) => {
    const { handwrittenCmtPriceCandidate, handwrittenCmtPriceMemo, cmtPrice, cmtPriceNote } = r.overview;
    if (handwrittenCmtPriceCandidate == null || cmtPrice != null) return r;
    return {
      ...r,
      overview: {
        ...r.overview,
        cmtPrice: handwrittenCmtPriceCandidate,
        cmtPriceNote: cmtPriceNote ?? handwrittenCmtPriceMemo ?? null,
      },
    };
  });
}
