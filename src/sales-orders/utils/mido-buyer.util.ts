// PR-168: 작업지시서 이미지 상단의 수기 CMT단가는 미도 건에만 의미가 있다(미도는
// CMT 100% 계약이고 단가 산정 방식이 다른 바이어와 다름 — 사용자 확인). 프롬프트
// 지시만으로는 AI가 조건을 무시하고 다른 바이어 건에도 값을 채울 수 있어(PR-158의
// targetRdd/documentDate 혼동과 같은 종류의 위험), 코드로 결정적으로 재검증한다 —
// 미도가 아니면 AI가 뭘 반환했든 항상 null로 덮어쓴다.
export function isMidoBuyer(buyer: string | null): boolean {
  if (!buyer) return false;
  return buyer.includes('미도');
}
