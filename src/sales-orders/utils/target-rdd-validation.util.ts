// PR-158: AI가 "12/30"으로 명확히 적힌 납기를 문서 상단 작성일("6/22")로 잘못 인식해
// 저장한 실사례가 있었다 — 프롬프트 지시만으로는 재발을 100% 막을 수 없어, 코드로
// 결정적으로 검증하는 안전장치를 둔다. 납기는 항상 문서 작성일보다 나중이고, 이
// 문서를 시스템에 입력하는 오늘보다도 나중이어야 한다(사용자 확인 도메인 규칙).
//
// YYYY-MM-DD 문자열은 사전식 비교가 곧 날짜 비교와 같아 Date로 바꾸지 않고 그대로
// 비교한다(타임존 이슈 없음).
//
// PR-207: rolloverTargetRddYear가 이제 "오늘보다 과거인 납기는 항상 미래로" 올리기
// 때문에, 호출부(vision.service.ts)가 넘기는 targetRdd는 이미 보정된(미래로 밀린)
// 값일 수 있다. documentDate와의 "작성일을 납기로 잘못 읽음" 패턴은 AI가 실제로 읽은
// 원본값으로 판정해야 한다 — 보정으로 미래로 밀려버리면 이 패턴이 가려진다. 그래서
// rawTargetRdd(보정 전 원본, 안 주면 targetRdd와 같다고 봄 — 기존 호출 호환)를 받아
// documentDate 비교에는 이 값을 쓴다. "오늘 이전" 비교는 그대로 targetRdd(표시값)를
// 쓴다 — PR-207 이후로는 거의 항상 false가 되어(보정이 이미 미래로 만들어 둠) 자연히
// 무해해진다.
export function isSuspiciousTargetRdd(
  targetRdd: string | null,
  documentDate: string | null,
  today: string,
  rawTargetRdd?: string | null,
): boolean {
  if (!targetRdd) return false;
  if (targetRdd <= today) return true;
  const original = rawTargetRdd ?? targetRdd;
  if (documentDate && original && original <= documentDate) return true;
  return false;
}
