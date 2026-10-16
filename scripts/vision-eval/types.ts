// PR-199: 측정 하네스 전역 타입. 운영 코드(src/)와는 독립이며, 운영 DTO가 필요하면
// vision.service.ts의 export(PROMPT/RESPONSE_SCHEMA)만 참조한다(그 외 import 없음).

export type EvalMode = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ManifestEntry {
  pdf: string;
  page: number;
  sheet: string;
}

export interface GoldenColorQty {
  color: string;
  qtyBySize: number[];
  total: number;
}

export interface GoldenBomItem {
  itemName: string;
  // 색상마다 요척이 다르면 배열, 같으면 단일 숫자.
  consumption: number | number[];
  unit: string | null;
  // "MAIN+SIZE..." 라벨 구역(필수 소모품) 이후 항목 — 요척 비교에서 제외.
  isLabelZone: boolean;
}

export interface GoldenStyle {
  sheetName: string;
  styleNo: string | null;
  documentDate: string | null;
  targetRdd: string | null;
  colors: GoldenColorQty[];
  totalQty: number;
  bomItems: GoldenBomItem[];
}

// 운영 AiSalesOrderResultDto의 부분집합 — 하네스가 실제로 쓰는 필드만(의존 최소화).
export interface AiBomItemLike {
  category?: string | null;
  itemName: string;
  spec?: string | null;
  colorCode?: string | null;
  consumption?: number | null;
  requiredQty?: number | null;
  supplier?: string | null;
  remarks?: string | null;
}

export interface AiOverviewLike {
  styleNo?: string | null;
  totalQty?: number | null;
  targetRdd?: string | null;
  documentDate?: string | null;
}

export interface AiResultLike {
  overview: AiOverviewLike;
  bomItems: AiBomItemLike[];
}

export type FieldErrorType =
  | 'OK'
  | 'VALUE_DIFF'
  | 'NAME_DIFF'
  | 'EXTRA_DUPLICATE'
  | 'EXTRA_OTHER'
  | 'EXTRA_HEADER_MATERIAL'
  | 'MISSING'
  | 'SUPPLIER_MERGED'
  | 'SUPPLIER_NAME_DIFF'
  | 'ITEM_CODE_DIGIT_DIFF';

export type StyleNoErrorType = 'EXACT' | 'SUFFIX_MISSING' | 'SUFFIX_DIGIT' | 'OTHER_MISMATCH';

export interface DigitConfusionPair {
  golden: string;
  read: string;
}
