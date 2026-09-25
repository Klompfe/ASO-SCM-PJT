// PR-151: 이용계약서 [부록 1] 과금표 기준 파싱 문서 과금 산식 — "기본 문서 요금(품목 5개까지
// 포함) + (6번째 품목부터 초과 품목 수 × 라인당 단가)". 순수 함수라 어느 파이프라인(작업지시서
// AI분석 / 수입통관 업로드)에도 자유롭게 연결할 수 있게 독립 모듈로 뒀다 — 이번 PR에서는
// 어디에도 연결하지 않는다(연결 여부/방식은 사용자 확인 후 별도 PR).
//
// 기존 sales-orders/ai-usage-log.service.ts의 calculateCharge()는 페이지 수 기준의
// 별도 과금 체계라 건드리지 않는다 — 이 유틸리티는 품목(라인) 수 기준의 새 체계다.
//
// 단가표를 상수로 분리해뒀다 — 계약 갱신 등으로 단가가 바뀌면 이 객체만 고치면 된다.
export type ParsingFeeCategory = 'AUTO' | 'MANUAL_OURS' | 'MANUAL_CUSTOMER';

export const PARSING_FEE_TABLE: Record<ParsingFeeCategory, { baseFeeKrw: number; perExcessItemKrw: number }> = {
  AUTO: { baseFeeKrw: 50, perExcessItemKrw: 10 },
  MANUAL_OURS: { baseFeeKrw: 500, perExcessItemKrw: 100 },
  MANUAL_CUSTOMER: { baseFeeKrw: 50, perExcessItemKrw: 10 },
};

// 기본 요금에 포함되는 품목 수(6번째 품목부터 초과 요금이 붙는다).
export const BASE_INCLUDED_ITEM_COUNT = 5;

export function calculateParsingFee(category: ParsingFeeCategory, itemCount: number): number {
  if (!Number.isFinite(itemCount) || itemCount < 0) {
    throw new RangeError(`itemCount는 0 이상의 유한한 숫자여야 합니다: ${itemCount}`);
  }
  const { baseFeeKrw, perExcessItemKrw } = PARSING_FEE_TABLE[category];
  const excessItemCount = Math.max(0, Math.floor(itemCount) - BASE_INCLUDED_ITEM_COUNT);
  return baseFeeKrw + excessItemCount * perExcessItemKrw;
}
