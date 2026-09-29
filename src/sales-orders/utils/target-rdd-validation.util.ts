// PR-158: AI가 "12/30"으로 명확히 적힌 납기를 문서 상단 작성일("6/22")로 잘못 인식해
// 저장한 실사례가 있었다 — 프롬프트 지시만으로는 재발을 100% 막을 수 없어, 코드로
// 결정적으로 검증하는 안전장치를 둔다. 납기는 항상 문서 작성일보다 나중이고, 이
// 문서를 시스템에 입력하는 오늘보다도 나중이어야 한다(사용자 확인 도메인 규칙).
//
// YYYY-MM-DD 문자열은 사전식 비교가 곧 날짜 비교와 같아 Date로 바꾸지 않고 그대로
// 비교한다(타임존 이슈 없음).
export function isSuspiciousTargetRdd(
  targetRdd: string | null,
  documentDate: string | null,
  today: string,
): boolean {
  if (!targetRdd) return false;
  if (targetRdd <= today) return true;
  if (documentDate && targetRdd <= documentDate) return true;
  return false;
}
