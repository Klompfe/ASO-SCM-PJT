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
  // PILOT-2에서 확인: AI 값이 null/빈 값인 것을 "숫자를 다르게 읽음"과 섞으면 안 된다
  // (값을 안 읽은 것과 잘못 읽은 것은 원인이 다르다).
  | 'VALUE_MISSING'
  | 'NAME_DIFF'
  // PILOT-2에서 확인: 값은 정답과 완전히 같은데 정답 쪽 자재명에 괄호 세부사항이
  // 붙어 있어(예: "본봉사(코아사)" ↔ "봉사") 이름만 다르게 보이는 경우 — 오독이
  // 아니라 표기 차이이므로 NAME_DIFF와 분리해서 센다.
  | 'NAME_ABBREV'
  | 'EXTRA_DUPLICATE'
  | 'EXTRA_OTHER'
  | 'EXTRA_HEADER_MATERIAL'
  | 'MISSING'
  | 'SUPPLIER_MERGED'
  | 'SUPPLIER_NAME_DIFF'
  | 'ITEM_CODE_DIGIT_DIFF'
  // PILOT-2에서 확인: 정답의 겉감(소재) 한 줄을 AI가 색상별로 여러 행으로 나눠
  // 돌려주면 MISSING+EXTRA_OTHER 쌍으로 잘못 잡힌다 — 한 줄로 묶어 따로 센다.
  | 'FACE_SPLIT_BY_COLOR';

export type StyleNoErrorType = 'EXACT' | 'SUFFIX_MISSING' | 'SUFFIX_DIGIT' | 'OTHER_MISMATCH';

export interface DigitConfusionPair {
  golden: string;
  read: string;
}

// PILOT-2에서 확인: 모드 A는 PDF 전체를 1번만 호출하고 돌아온 배열을 그 PDF의
// manifest 행들에 results[page-1]로 짝짓는다. 배열 길이가 안 맞거나(PAGE_COUNT_MISMATCH)
// manifest의 정답 시트가 엑셀에 없으면(SHEET_NOT_FOUND) 채점 신뢰도가 다르므로 상태를
// 남긴다 — ALIGNED_BY_STYLE은 길이가 안 맞을 때 스타일번호 편집거리로 대체 매칭한 경우.
export type EntryAlignmentStatus = 'OK' | 'PAGE_COUNT_MISMATCH' | 'ALIGNED_BY_STYLE' | 'SHEET_NOT_FOUND';
