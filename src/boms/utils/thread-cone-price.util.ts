// PR-157: 미도 단가표의 실(THREAD) 단가($0.00012)는 미터(M)당 단가이지만, 실제
// 구매/선적 단위는 콘(cone)이다 — 콘 하나에 감긴 길이는 실 종류마다 다르다(사용자
// 확인 자료). 콘가격 = 미터단가 × 콘길이(M).
//
// PR-175: 콘길이를 하드코딩 상수(THREAD_CONE_LENGTH_M)로 두지 않고
// material-packaging-unit-rules 모듈(DB 테이블, brand-prefix-rules와 동일한 설계
// 원칙)에서 조회하도록 리팩터링했다 — 이 함수는 여전히 순수/동기 함수로 남기고
// (테스트하기 쉽게, DI 없이도 호출 가능하게), 호출자가 DB에서 미리 조회한
// lengthByMaterialSubType(자재 서브타입 문자열 → 미터)을 넘겨주는 방식을 택했다.
// materialSubType은 BomItem.threadType/tapeType enum 값과 동일한 문자열이라
// 실/테이프 구분 없이 같은 조회 테이블로 처리된다.
//
// PR-182: 같은 환산식(미터단가 × 단위길이)을 INVOICE 쪽(export-shipments/utils/
// meter-price-conversion.util.ts)에서도 쓰게 되면서, 계산 자체는 그쪽 유틸로
// 합치고 이 함수는 "서브타입 → 길이" 조회 + null 가드만 맡는다(BOM 화면이 기대하는
// 반올림 없는 원시값 반환은 그대로 유지 — 호출부/테스트 회귀 없음).
import { convertMeterPriceToUnitPrice } from '../../export-shipments/utils/meter-price-conversion.util';

export function calculateConePriceUsd(
  pricePerMeterUsd: number,
  materialSubType: string | null | undefined,
  lengthByMaterialSubType: Record<string, number>,
): number | null {
  if (!materialSubType) return null;
  const lengthM = lengthByMaterialSubType[materialSubType];
  if (lengthM == null) return null;
  return convertMeterPriceToUnitPrice(pricePerMeterUsd, lengthM).unitPrice;
}
