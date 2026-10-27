import type { DigitConfusionPair } from '../types';

// PR-199 보완: "공급사)자재명" 표기 — ')' 앞이 공급사, 뒤가 자재명/코드.
export interface SupplierItemParsed {
  supplier: string | null;
  itemName: string;
}

export function parseSupplierItemName(raw: string): SupplierItemParsed {
  const idx = raw.indexOf(')');
  if (idx === -1) return { supplier: null, itemName: raw.trim() };
  return { supplier: raw.slice(0, idx).trim(), itemName: raw.slice(idx + 1).trim() };
}

// 숫자 자리만 비교(길이가 같을 때만 자리별 비교, 다르면 통째로 기록) — bom-match의
// digitDiff와 같은 규칙이지만 문자열(자재 코드) 대상이라 별도로 둔다.
export function stringDigitDiff(golden: string, read: string): DigitConfusionPair[] {
  if (golden.length !== read.length) return [{ golden, read }];
  const pairs: DigitConfusionPair[] = [];
  for (let i = 0; i < golden.length; i++) {
    if (golden[i] !== read[i] && /[0-9]/.test(golden[i]) && /[0-9]/.test(read[i])) {
      pairs.push({ golden: golden[i], read: read[i] });
    }
  }
  return pairs;
}

export type SupplierItemClassification = 'OK' | 'SUPPLIER_MERGED' | 'SUPPLIER_NAME_DIFF' | 'ITEM_CODE_DIGIT_DIFF';

export interface SupplierItemScoreResult {
  type: SupplierItemClassification;
  digitDiff?: DigitConfusionPair[];
}

// PR-199 보완: 헤더 라벨에 "공급"이 있을 때만(호출하는 쪽이 판단) 쓴다 — 없으면 이
// 채점은 건너뛰고 보고서에 "건너뜀"으로 적는다.
export function scoreSupplierItemName(goldenRaw: string, readRaw: string): SupplierItemScoreResult {
  const golden = parseSupplierItemName(goldenRaw);
  const read = parseSupplierItemName(readRaw);

  // 공급사와 자재명이 ')' 없이 붙어 나옴(구분자 소실) — 정답에는 공급사가 있는데
  // 읽은 쪽은 ')' 자체가 없을 때만 해당(공급사가 아예 없는 정상 표기와 구분).
  if (golden.supplier != null && read.supplier == null) {
    return { type: 'SUPPLIER_MERGED' };
  }

  if (golden.supplier === read.supplier && golden.itemName === read.itemName) {
    return { type: 'OK' };
  }

  if (golden.supplier !== read.supplier) {
    return { type: 'SUPPLIER_NAME_DIFF' };
  }

  // 공급사는 같은데 자재코드가 다름 — 숫자 한 자리 오독 여부를 함께 기록한다.
  return { type: 'ITEM_CODE_DIGIT_DIFF', digitDiff: stringDigitDiff(golden.itemName, read.itemName) };
}
