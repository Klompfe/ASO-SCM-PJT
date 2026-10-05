// PR-182: INVOICE의 실(THREAD)/테이프 단가는 미도 단가표에 미터(M)당 가격으로 있지만,
// 실제 INVOICE는 콘(CONE)/롤(ROLL) 단위로 수량·단가를 적는다. 콘/롤 단가 = 미터단가 ×
// 단위길이(M) — 단위길이는 material-packaging-unit-rules(PR-175)에서 조회한 값을
// 호출자가 넘긴다(이 함수는 boms/thread-cone-price.util.ts의 calculateConePriceUsd와
// 같은 원칙으로 순수/동기 함수로 남긴다).
//
// 최종 USD 단가는 소수 4자리로 반올림한다(INVOICE 단가 표기 관례, PR-157 이후 화면에서
// toFixed(4)로 보여주는 것과 맞춘다). formula는 담당자가 검산할 수 있도록 식을 그대로 남긴다.
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export interface MeterPriceConversionResult {
  unitPrice: number;
  formula: string;
}

export function convertMeterPriceToUnitPrice(
  pricePerMeterUsd: number,
  unitLengthM: number,
  unitLabel = 'UNIT',
): MeterPriceConversionResult {
  const unitPrice = round4(pricePerMeterUsd * unitLengthM);
  return {
    unitPrice,
    formula: `${pricePerMeterUsd}/m × ${unitLengthM}m = ${unitPrice}/${unitLabel}`,
  };
}

// 라인(INVOICE 행)의 단위 표기가 콘/롤인지 판별한다 — 자재마스터(Item.unit)가 자유
// 텍스트라 "CONE"/"cone"/"콘"/"ROLL"/"롤" 등 표기가 섞일 수 있어 대소문자 무시 +
// 부분일치로 느슨하게 판별한다(PR-182 요구사항: "콘/롤 표기 포함, 대소문자 무시").
// 둘 다 해당하지 않으면(M, EA, YD 등) null — 그 경우 미터단가를 그대로 쓴다(환산 안 함).
export type PackagingUnitCategory = 'CONE' | 'ROLL';

export function classifyPackagingUnit(unit: string | null | undefined): PackagingUnitCategory | null {
  if (!unit) return null;
  const u = unit.toUpperCase();
  if (u.includes('CONE') || unit.includes('콘')) return 'CONE';
  if (u.includes('ROLL') || unit.includes('롤')) return 'ROLL';
  return null;
}
