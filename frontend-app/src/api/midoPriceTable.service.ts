import apiClient from './client';

// PR-182: 종류(실/테이프)가 확정돼 있으면 환산값 하나만(determined), 모르면 가능한
// 종류별 환산값을 전부(안전모드 — 자동 확정 금지) 내려준다.
export interface MeterPriceConversionOption {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  unitPriceUsd: number;
  formula: string;
  unitPriceUsdMax?: number;
  formulaMax?: string;
}

export interface MeterPriceConversionInfo {
  determined: boolean;
  options: MeterPriceConversionOption[];
  warning?: string;
  referenceNote?: string;
}

export interface MidoPriceItem {
  id: number;
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
  note?: string | null;
  // PR-182: lineUnit이 콘/롤이고 이 후보 단위가 M일 때만 채워진다.
  conversion?: MeterPriceConversionInfo;
}

// PR-157: 자재명 부분일치로 후보를 찾는다(자동 확정 없음 — 담당자가 직접 골라 연결).
// PR-182: lineUnit(라인 단위)이 콘/롤이면 콘/롤단가 환산 후보(conversion)도 함께 온다.
// materialSubType(BomItem.threadType/tapeType)이 있으면 그 종류 하나로만, 없으면
// 가능한 종류를 전부 나열한다 — 둘 다 생략하면 기존(PR-157) 동작과 동일하다.
export const findMidoPriceCandidates = (
  materialName: string,
  opts?: { lineUnit?: string; materialSubType?: string | null },
): Promise<MidoPriceItem[]> =>
  apiClient.get('/mido-price-table/candidates', {
    params: { materialName, lineUnit: opts?.lineUnit, materialSubType: opts?.materialSubType ?? undefined },
  });
