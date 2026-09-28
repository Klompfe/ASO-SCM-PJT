import { ThreadType } from '../entities/bom-item.entity';

// PR-157: 미도 단가표의 실(THREAD) 단가($0.00012)는 미터(M)당 단가이지만, 실제
// 구매/선적 단위는 콘(cone)이다 — 콘 하나에 감긴 길이는 실 종류마다 다르다(사용자
// 확인 자료). 콘가격 = 미터단가 × 콘길이(M). 향후 종류가 늘거나 콘길이가 바뀔 수
// 있어 화면에서 고칠 수 있는 설정값으로 관리하는 게 이상적이지만, 이번 PR은 우선
// 상수로 시작한다(완료 보고에서 설정 테이블 필요 여부를 다시 제안).
export const THREAD_CONE_LENGTH_M: Record<ThreadType, number> = {
  [ThreadType.COA_SA]: 2500, // 코아사
  [ThreadType.OBA_SA_SKU_I_SA]: 4000, // 오바사 / 스쿠이사
  [ThreadType.POLY_JINUIDO]: 500, // 폴리지누이도
};

// threadType이 없으면(미지정) 추측하지 않고 null을 돌려준다 — 호출 측이 "실 종류
// 미지정 — 콘가격 계산 불가" 경고를 띄우는 신호로 쓴다.
export function calculateConePriceUsd(
  pricePerMeterUsd: number,
  threadType: ThreadType | null | undefined,
): number | null {
  if (!threadType) return null;
  const coneLengthM = THREAD_CONE_LENGTH_M[threadType];
  return pricePerMeterUsd * coneLengthM;
}
