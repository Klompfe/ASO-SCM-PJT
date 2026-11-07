import { classifyPackagingUnit } from '../../export-shipments/utils/meter-price-conversion.util';
import { effectiveSubType, looksLikeThreadOrTape, suggestThreadTapeByKeyword } from '../../common/utils/packaging-subtype.util';

export interface RequirementMaterialLike {
  id: number;
  code?: string | null;
  name: string;
  unit?: string | null;
  // PR-186: 자재(Item) 단위로 지정한 실/테이프 종류와 검토 여부 — BOM 행에 종류가 없으면
  // 이 값을 쓴다(effectiveSubType). packagingReviewedAt은 "실/테이프 아님"으로 확정한
  // 자재를 일반 자재처럼 취급하기 위한 표시.
  materialSubType?: string | null;
  packagingReviewedAt?: Date | string | null;
  // PR-194: 다품번 일괄발주 화면의 품목군 묶음 1순위 키(Item.category — MaterialCategory,
  // PR-183 선택 입력). 없으면 화면이 BOM 구분(categories[0])으로 폴백한다.
  category?: { name: string } | null;
}

export interface RequirementBomItem {
  id: number;
  category?: string | null;
  colorCode?: string | null;
  consumption: unknown;
  material?: RequirementMaterialLike | null;
  // PR-185 B-2: 실(threadType)/테이프(tapeType) 종류 — BOM 행에 값이 있으면 Item의
  // materialSubType보다 우선한다(effectiveSubType).
  threadType?: string | null;
  tapeType?: string | null;
  // PR-220: 작업지시서(작지) AI 인식 경로에서만 채워지는, 이 행에 인쇄된 수량("출고량")
  // 원문값·단위. 있고 단위가 자재(Item) 단위와 일치할 때만 이 행의 필요량으로 그대로
  // 쓴다(perUnit × targetQuantity 대신) — 1518 버그(색상별 실제 수량을 무시하고 스타일
  // 전체 물량을 모든 색상 행에 곱하던 문제)의 근본 수정.
  sheetQty?: number | null;
  sheetQtyUnit?: string | null;
  // PR-231: 사람이 직접 지정한 이 행의 총 필요수량 — 있으면 계산값/작지 값보다 항상
  // 우선 적용된다(색상×사이즈 수량표 매칭 여부와 무관). 경고(불일치/오독/비정상 요척)
  // 대상에서도 빠진다.
  manualRequiredQty?: number | null;
}

// PR-185 B-2 / PR-186: material_packaging_unit_rules(PR-175) 한 행 — materialSubType →
// 포장단위/단위길이. displayName은 PR-186의 looksLikeThreadOrTape 판별에 쓴다.
export interface PackagingUnitRuleLike {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
}

export interface PackagingConversion {
  packagingUnitLabel: string;
  unitLengthM: number;
  // 색상별로 ceil(필요미터 ÷ 단위길이) 한 뒤 합산한 값(단순 전체 합산 올림과 다를 수 있음).
  requiredPackages: number;
  shortagePackages: number;
  conversionFormula: string;
}

export interface MaterialRequirementRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  categories: string[];
  colors: string[];
  // 제품 1개당 소요량(요척). 같은 자재가 색상/규격별로 BOM 행이 여러 개면 합산한 값.
  consumptionPerUnit: number;
  // 필요 총수량 = 제품 1개당 소요량 × 작업지시 물량(targetQuantity)
  requiredQty: number;
  // PR-185 B: 이 자재로 "같은 styleNo에 연결된" 발주(취소 제외) 수량 합. 기존에는 그
  // 자재의 모든 발주 합계였다 — 스타일별 부족분이 서로 섞이던 문제를 고치기 위해
  // 호출자가 styleNo로 미리 걸러진 맵을 넘긴다(이 함수는 집계만 한다).
  orderedQty: number;
  // PR-185 B: 같은 자재의 "스타일 미연결" 발주(취소 제외) 수량 합 — 참고 표시용이며
  // shortageQty 계산에서 차감하지 않는다(어느 스타일 몫인지 몰라 자동 배정하지 않음).
  unlinkedOrderedQty: number;
  // 부족 수량 = max(0, 필요 총수량 - orderedQty)
  shortageQty: number;
  lineCount: number;
  // PR-194: 실/테이프 종류 코드(COA_SA/DADE 등) — BOM 행에 여러 색상/규격이 섞여 있어도
  // 종류 자체가 일관되면(subtypeMixed=false) 채워진다. 다품번 일괄발주 화면에서 품목군
  // 아래 종류 라벨을 보여주는 용도(materialSubTypeLabel과 함께 사용) — 환산 로직 자체는
  // 그대로이고 이 필드는 결과를 그대로 노출만 한다.
  materialSubType?: string | null;
  // PR-194: 품목군 묶음 1순위 키(Item.category.name) — 없으면 화면이 categories[0]로 폴백.
  itemCategoryName?: string | null;
  // PR-186: BOM 행(threadType/tapeType) 또는 자재(Item.materialSubType) 둘 중 하나로
  // 종류가 정해지고 규칙 테이블에 그 종류가 있으면 채워진다(Item.unit과 무관, 요구사항 B).
  packaging?: PackagingConversion;
  // 종류가 없고(미검토) 실/테이프로 보이거나, 종류는 있는데 규칙에 없거나, 단위가 콘/롤인데
  // 종류가 없을 때(기존 PR-185 폴백) — 추측해서 환산하지 않고 경고만 준다.
  conversionWarning?: string;
  // PR-219: conversionWarning이 "종류 미지정"일 때, 자재명 키워드로 추천된 종류가 있고
  // 그 종류에 포장 규칙이 있으면 "참고" 환산값을 함께 보여준다([A] 부족자재 표의 단위
  // 불일치 버그 — 미터 필요량에서 콘 수를 그대로 빼던 문제의 완화). 종류를 확정하지는
  // 않는다(packaging과 별개 필드 — 실제 지정 전까지는 추천값일 뿐).
  suggestedPackaging?: SuggestedPackagingConversion;
  // PR-220: 이 자재의 필요량이 작지 수량(sheetQty)을 썼는지(이 자재의 BOM 행이 전부/일부/
  // 전혀 sheetQty를 썼는지), 계산값(요척×기획수량, 항상 제공 — 비교·화면 표시용)과,
  // 작지 수량과 계산값이 크게 다를 때의 확인 필요 표시.
  // PR-220b: 'color-qty'(색상×사이즈 수량표 기준) 'unknown'(색상 있는 행인데 sheetQty도
  // 수량표도 없어 숫자를 만들 수 없음) 추가.
  // PR-231: 'manual' 추가 — 이 자재의 BOM 행 중 하나 이상이 수동 지정이면 basis에
  // 섞여 들어간다(모든 행이 수동이면 'manual', 다른 basis와 섞이면 'mixed').
  basis?: 'sheet' | 'color-qty' | 'computed' | 'manual' | 'mixed' | 'unknown';
  // PR-231: basis와 무관하게 "이 자재의 BOM 행 중 하나 이상이 수동 지정됐는지" —
  // basis가 'mixed'라도 화면이 "수동" 배지를 보여줄 수 있게 별도로 노출한다.
  hasManualOverride?: boolean;
  computedQty?: number;
  sheetQty?: number;
  mismatch?: boolean;
  // PR-220b: 이 자재에 색상이 있는 BOM 행이 있는데 sheetQty도 색상×사이즈 수량표도 없어
  // (스타일 전체 수량으로 추측하지 않고) 필요량을 확정할 수 없다는 표시. true면
  // requiredQty/shortageQty/packaging은 참고용이 아니라 "불완전한 값"이다 — 화면은 숫자
  // 대신 "색상별 수량 확인 필요"를 보여줘야 한다.
  needsColorQty?: boolean;
  // PR-226(사용자 확인): 작지 값이 스타일 총수량과 정확히 같고(소수 오차 허용 안 함)
  // 계산값과 크게 다르면, 출고량 칸이 아니라 총수량(또는 다른 칸)을 잘못 읽었을
  // 가능성이 크다 — mismatch는 그대로 두고(적용은 여전히 계산값) 이 표시만 추가한다.
  sheetQtyLooksLikeTotalQtyMisread?: boolean;
  // PR-228: 화면이 sheetQtyLooksLikeTotalQtyMisread 문구에 "단위를 확인해 주세요"를
  // 덧붙일지 결정하는 데 쓴다(unitKind==='unknown'일 때만) — 개수 단위면 그 경고
  // 자체가 뜨지 않으므로(위 함수가 false를 돌려줌) 이 필드는 그 경우엔 의미가 없다.
  quantityUnitKind?: QuantityUnitKind;
  // PR-228: 계산값과 작지 값의 비율이 10배를 넘거나 1/10 미만이면 true — 요척 자체가
  // 틀렸을 가능성이 크다는 강한 경고(기존 ±5% mismatch와 별도). true면 화면은 "이
  // 자재로 발주하기"를 눌러도 [B] 수량을 비워 둔다(계산값을 그대로 넣지 않음).
  extremeConsumptionMismatch?: boolean;
}

export interface SuggestedPackagingConversion extends PackagingConversion {
  materialSubType: string;
  displayName: string;
  reason: string;
  conflict?: boolean;
  conflictReason?: string;
}

// pg decimal은 문자열로 올 수 있어 Number()로 통일한다. 소수 4자리로 반올림해 부동소수 오차(0.1*3 등)를 없앤다.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const MISSING_SUBTYPE_WARNING = '실/테이프 종류 미지정 — 선택해 주세요';
const NEEDS_COLOR_QTY_WARNING = '색상별 수량 확인 필요 — 작지 재업로드(수량 포함) 또는 MATERIAL LIST 재업로드로 색상×사이즈 수량을 채워 주세요';
const normUnit = (u: string | null | undefined): string => (u ?? '').trim().toUpperCase();
// PR-220: 작지 수량과 계산값(요척×기획수량)의 차이율이 이 값을 넘으면 mismatch(확인 필요).
const SHEET_QTY_MISMATCH_THRESHOLD_PCT = 0.05;

// PR-226(사용자 확인 사실): 작지 값이 스타일 총수량과 정확히 같으면(소수 오차 허용
// 안 함 — "499 vs 499.0001"도 다른 값으로 본다, 추측 금지) 출고량 칸이 아니라 다른
// 칸(총수량 등)을 읽었을 가능성이 크다. mismatch가 이미 나 있을 때만 의미가 있다 —
// mismatch 자체가 없으면(계산값과 거의 같으면) 이 표시는 붙이지 않는다.
// PR-228: 개수 단위(EA/PC/PCS/개/SET/장 등) 품목은 "1개당 1" 이 정상이라, 작지 값이
// 총수량과 같은 것이 오히려 맞는 값이다 — sheetQtyLooksLikeTotalQtyMisread를 그런
// 품목에는 적용하지 않는다(사용자 보고: 수기로 추가한 금속장식(EA) 행에서 정상적인
// "작지=총수량"을 오독으로 오경고). 길이 단위(yd/m/mm/cm 등)에서만 그대로 적용하고,
// 단위를 모르면(비어 있거나 분류 불가) 기존처럼 경고하되 화면이 "단위를 확인해
// 주세요"를 덧붙일 수 있게 unitKind를 노출한다.
export type QuantityUnitKind = 'count' | 'length' | 'unknown';

const COUNT_UNIT_TOKENS = new Set(['EA', 'PC', 'PCS', '개', 'SET', '세트', '장', 'PAIR', '족']);
const LENGTH_UNIT_TOKENS = new Set(['M', 'YD', 'Y', 'MM', 'CM', 'KM', 'MT']);

export function classifyQuantityUnit(unit: string | null | undefined): QuantityUnitKind {
  const u = (unit ?? '').trim().toUpperCase();
  if (!u) return 'unknown';
  if (COUNT_UNIT_TOKENS.has(u)) return 'count';
  if (LENGTH_UNIT_TOKENS.has(u)) return 'length';
  return 'unknown';
}

export function sheetQtyLooksLikeTotalQtyMisread(
  sheetQty: number | null | undefined,
  totalQty: number | null | undefined,
  mismatch: boolean,
  unitKind: QuantityUnitKind = 'unknown',
): boolean {
  if (unitKind === 'count') return false;
  if (!mismatch) return false;
  if (sheetQty == null || totalQty == null) return false;
  return sheetQty === totalQty;
}

// PR-228: 계산값(consumptionPerUnit × totalQty)과 작지 값의 비율이 10배를 넘거나
// 1/10 미만이면, 기존 ±5% 불일치(mismatch)와는 별도로 "요척 자체가 틀렸을 가능성이
// 크다"는 강한 경고를 낸다(사용자 보고 사례: 요척에 수량(499)이 잘못 들어가
// 499×499=249,001처럼 부풀려진 값이 나온 경우).
const EXTREME_CONSUMPTION_RATIO = 10;
export function isExtremeConsumptionMismatch(computedQty: number | null | undefined, sheetQty: number | null | undefined): boolean {
  if (computedQty == null || sheetQty == null) return false;
  if (computedQty === 0 || sheetQty === 0) return false;
  const ratio = Math.abs(computedQty) / Math.abs(sheetQty);
  return ratio > EXTREME_CONSUMPTION_RATIO || ratio < 1 / EXTREME_CONSUMPTION_RATIO;
}

// PR-220b: 색상 비교 정규화 — 앞뒤 공백 제거 + 대소문자 무시 + 내부 연속 공백을 1칸으로만.
// 약어↔전체명(BL↔BLUE 등) 추측 매칭은 하지 않는다(요구사항) — 정확히 이 정규화 규칙으로
// 같아야만 매칭된다.
export function normalizeColorForMatch(color: string | null | undefined): string {
  return (color ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}
const FREE_COLOR_KEY = 'FREE';
// PR-220b: mapping-commit.service.ts의 normalizeKeyPart()가 "색상 없음"을 빈 문자열이
// 아니라 리터럴 'N/A'로 저장하는 기존 관례(colorCode가 nullable이 아니라 항상 문자열인
// 컬럼이라 그렇게 정규화됨) — 이 값도 공통(FREE)과 같은 "색상 구분 없음"으로 본다.
const NA_COLOR_KEY = 'N/A';

// 색상별로 ceil(필요미터 ÷ 단위길이)한 뒤 합산 — 확정된 종류(packaging)와 PR-219의 추천
// 종류(suggestedPackaging) 계산이 완전히 같은 식이라 한 곳으로 합친다(중복 구현 금지).
function buildPackagingConversion(
  colorMeters: Map<string, number>,
  requiredQtyTotal: number,
  orderedQty: number,
  rule: PackagingUnitRuleLike,
): PackagingConversion {
  const unitLengthM = Number(rule.unitLengthM);
  const label = rule.packagingUnitLabel;
  let requiredPackages = 0;
  const parts: string[] = [];
  for (const [color, meters] of colorMeters.entries()) {
    const packages = Math.ceil(meters / unitLengthM);
    requiredPackages += packages;
    parts.push(`${color}: ${meters.toLocaleString('ko-KR')}m→${packages}${label}`);
  }
  const shortagePackages = Math.max(0, requiredPackages - orderedQty);
  const conversionFormula =
    colorMeters.size > 1
      ? `색상별 ${parts.join(', ')} = 합계 ${requiredPackages}${label}`
      : `${requiredQtyTotal.toLocaleString('ko-KR')}m ÷ ${unitLengthM}m/${label} = ${round2(requiredQtyTotal / unitLengthM)} → ${requiredPackages}${label}`;
  return { packagingUnitLabel: label, unitLengthM, requiredPackages, shortagePackages, conversionFormula };
}

// PR-219: [A] 부족자재 표의 단위 불일치 버그 완화 — 종류 미지정이라 packaging이 비어 있을
// 때, 미터 필요량에서 콘/롤 수를 그대로 빼는 대신, 자재명 키워드로 추천된 종류가 있으면
// 그 종류 기준 "참고" 환산값을 함께 계산해 둔다(확정은 아니다 — 화면이 "참고" 배지와
// 함께 보여준다).
function buildSuggestedPackaging(row: WorkingRow, rules: PackagingUnitRuleLike[]): SuggestedPackagingConversion | undefined {
  const suggestion = suggestThreadTapeByKeyword(row.materialName, rules);
  if (!suggestion) return undefined;
  const rule = rules.find((r) => r.materialSubType === suggestion.materialSubType);
  if (!rule) return undefined;
  return {
    ...buildPackagingConversion(row.colorMeters, row.requiredQty, row.orderedQty, rule),
    materialSubType: suggestion.materialSubType,
    displayName: suggestion.displayName,
    reason: suggestion.reason,
    conflict: suggestion.conflict,
    conflictReason: suggestion.conflictReason,
  };
}

interface WorkingRow extends MaterialRequirementRow {
  colorMeters: Map<string, number>;
  subtype: string | null | undefined; // undefined = 아직 안 봄(effectiveSubType 기준)
  subtypeMixed: boolean;
  unit: string | null;
  materialName: string;
  reviewed: boolean;
  // PR-226: "계산값 우선" 규칙 이후 sheetBasisCount는 "계산값이 없어 sheetQty를 적용한"
  // 행 개수로 의미가 좁아졌다(이름을 sheetAppliedCount로 바꿈). sheetPresentCount/Sum은
  // rowBasis와 무관하게 "단위가 맞는 작지 수량이 있었던" 행을 전부 모은 것 — 계산값을
  // 적용했어도 작지 값과 대조(mismatch)하려면 이 합계가 필요하다.
  sheetAppliedCount: number;
  computedBasisCount: number;
  manualBasisCount: number;
  sheetPresentCount: number;
  sheetPresentSum: number;
  // PR-226: 계산값(색상수량표/총수량×요척)을 적용한 행 중, 그 행 자신의 계산값과
  // 작지 수량이 ±5% 넘게 다른 행이 하나라도 있으면 true(자재 전체 mismatch에 OR됨).
  // sheetAppliedCount>0(계산값이 없어 작지를 적용한 행)의 mismatch는 기존처럼 자재
  // 전체의 computedQty(총수량×요척)와 비교한다(그 행만의 계산값이 없어서 비교 대상이
  // 없기 때문 — PR-220부터 있던 "참고 사실 확인" 그대로 유지).
  computedVsSheetMismatch: boolean;
  // PR-220b: 색상×사이즈 수량표를 쓴 행 개수, 근거 없어 숫자를 못 만든(unknown) 행 개수.
  colorQtyBasisCount: number;
  unknownBasisCount: number;
}

// BOM 전개: 자재별 필요 총수량 = consumption(제품 1개당) × targetQuantity. 기존 재고 차감 로직
// (work-orders.service.ts: Number(bomItem.consumption) * wo.targetQuantity)과 같은 식이다.
// BomItem.requiredQty(저장값)는 BOM 등록 당시 시트의 총 오더수량으로 계산된 스냅샷이라
// (section-parser: consumption × totalQty) 이 작업지시 물량과 무관하므로 쓰지 않는다.
//
// 같은 자재(Item)가 BOM에 여러 행(색상/규격 다름)으로 있으면 자재 기준으로 합쳐서 계산한다 —
// 발주 수량은 자재 단위로 잡혀 있어, 행마다 비교하면 같은 발주량이 중복 차감되기 때문이다.
export function calculateMaterialRequirements(
  targetQuantity: number,
  bomItems: RequirementBomItem[],
  orderedByItemId: Map<number, number>,
  opts?: {
    unlinkedByItemId?: Map<number, number>;
    packagingRules?: PackagingUnitRuleLike[];
    // PR-220b: 스타일의 색상×사이즈 수량표(PR-212) 색상별 합계 — 호출자가 스타일당 1회만
    // 조회해 그대로 넘긴다(이 함수는 추가 조회를 하지 않는다, N+1 금지). 없으면(빈 배열)
    // "수량표 없음"으로 취급한다.
    colorQuantities?: { color: string; qty: number }[];
  },
): MaterialRequirementRow[] {
  const target = num(targetQuantity);
  const map = new Map<number, WorkingRow>();

  // PR-220b: 정규화된 색상 키 → 수량표 합계. 같은 정규화 키로 겹치는 원본 색상 표기가
  // 있으면(데이터 입력 편차) 합산한다 — 추측 매칭이 아니라 정규화 규칙 안에서의 합.
  const colorQtyMap = new Map<string, number>();
  for (const c of opts?.colorQuantities ?? []) {
    const key = normalizeColorForMatch(c.color);
    if (!key) continue;
    colorQtyMap.set(key, round4((colorQtyMap.get(key) ?? 0) + num(c.qty)));
  }

  for (const bi of [...bomItems].sort((a, b) => a.id - b.id)) {
    if (!bi.material) continue;
    const perUnit = num(bi.consumption);
    const computedRowQty = perUnit * target;

    // PR-220(이후 PR-226에서 우선순위 변경): 작지 수량(sheetQty) 원문·단위 — 자재(Item)
    // 단위와 같을 때만 "단위가 맞다"고 본다(Y↔M 등 환산은 하지 않음, 추측 금지).
    const sheetQtyRaw = Number(bi.sheetQty);
    const hasValidSheetQty = bi.sheetQty != null && Number.isFinite(sheetQtyRaw) && sheetQtyRaw > 0;
    const rowUnit = normUnit(bi.material.unit);
    const sheetUnit = normUnit(bi.sheetQtyUnit);
    const unitMatches = hasValidSheetQty && !!rowUnit && !!sheetUnit && rowUnit === sheetUnit;

    // PR-220b: 색상이 있는 행(공통/FREE 아님)은 색상×사이즈 수량표에서 그 색상의 합계를
    // 찾는다. 공통 색상(빈칸/FREE/N/A)은 항상 "총수량×요척" 계산값을 쓸 수 있다.
    const colorRaw = (bi.colorCode ?? '').trim();
    const colorKeyNorm = normalizeColorForMatch(colorRaw);
    const isCommonColor = !colorKeyNorm || colorKeyNorm === FREE_COLOR_KEY || colorKeyNorm === NA_COLOR_KEY;
    const colorQtyValue = !isCommonColor ? colorQtyMap.get(colorKeyNorm) : undefined;

    // PR-226(사용자 확정): "계산값이 있으면 계산값을 적용한다" — 색상×사이즈 수량표
    // 합계(색상 있는 행) 또는 총수량×요척(공통 색상 행)이 1순위다. 작지 수량(sheetQty)은
    // 더 이상 1순위가 아니라 "대조·대체 근거"로 내려간다: 계산값과 함께 있으면 비교해
    // ±5% 넘게 다르면 mismatch만 표시하고 적용은 여전히 계산값, 계산값이 전혀 만들어지지
    // 않을 때만(색상이 수량표에 없음) sheetQty를 적용한다. 배경: 작지의 출고량 칸이
    // LOT 여러 줄로 나뉘어 있는데 인식이 한 줄만 읽어 실제보다 적은 값을 작지수량으로
    // 잡는 사례가 있었고(LOT 합산은 vision.service.ts/handwritten 쪽에서 처리), 그 값을
    // 1순위로 쓰면 다른 자재(전부 계산값 적용)와 기준이 달라져 틀린 결과가 나왔다.
    // PR-231(사용자 확정): "수동 지정 값 > 계산값 > 작지 값 > 근거 없음" — 사람이 이
    // 행에 직접 지정한 값이 있으면 색상/작지 여부와 무관하게 항상 그 값을 쓴다. 경고
    // (불일치/오독/비정상 요척) 판단용 집계(sheetPresentCount 등)에도 들어가지 않는다
    // (아래 unitMatches 블록 참고).
    const manualQtyRaw = bi.manualRequiredQty;
    const hasManualQty = manualQtyRaw != null && Number.isFinite(Number(manualQtyRaw));

    let rowBasis: 'sheet' | 'color-qty' | 'computed' | 'manual' | 'unknown';
    let rowQty: number;
    if (hasManualQty) {
      rowBasis = 'manual';
      rowQty = num(manualQtyRaw);
    } else if (isCommonColor) {
      rowBasis = 'computed';
      rowQty = computedRowQty;
    } else if (colorQtyValue != null) {
      rowBasis = 'color-qty';
      rowQty = perUnit * colorQtyValue;
    } else if (unitMatches) {
      rowBasis = 'sheet';
      rowQty = sheetQtyRaw;
    } else {
      rowBasis = 'unknown';
      rowQty = 0; // 합계에 0으로 "섞여 들어가지" 않도록 requiredQty/colorMeters에는 더하지 않는다(아래).
    }

    const cur: WorkingRow =
      map.get(bi.material.id) ??
      {
        itemId: bi.material.id,
        itemCode: bi.material.code ?? '',
        itemName: bi.material.name,
        itemCategoryName: bi.material.category?.name ?? null,
        categories: [],
        colors: [],
        consumptionPerUnit: 0,
        requiredQty: 0,
        orderedQty: 0,
        unlinkedOrderedQty: 0,
        shortageQty: 0,
        lineCount: 0,
        colorMeters: new Map(),
        subtype: undefined,
        subtypeMixed: false,
        unit: bi.material.unit ?? null,
        materialName: bi.material.name,
        reviewed: !!bi.material.packagingReviewedAt,
        sheetAppliedCount: 0,
        computedBasisCount: 0,
        manualBasisCount: 0,
        sheetPresentCount: 0,
        sheetPresentSum: 0,
        computedVsSheetMismatch: false,
        colorQtyBasisCount: 0,
        unknownBasisCount: 0,
      };
    cur.consumptionPerUnit = round4(cur.consumptionPerUnit + perUnit);
    cur.lineCount += 1;
    if (rowBasis === 'manual') {
      cur.manualBasisCount += 1;
      cur.requiredQty = round4(cur.requiredQty + rowQty);
    } else if (rowBasis === 'sheet') {
      cur.sheetAppliedCount += 1;
      cur.requiredQty = round4(cur.requiredQty + rowQty);
    } else if (rowBasis === 'color-qty') {
      cur.colorQtyBasisCount += 1;
      cur.requiredQty = round4(cur.requiredQty + rowQty);
    } else if (rowBasis === 'computed') {
      cur.computedBasisCount += 1;
      cur.requiredQty = round4(cur.requiredQty + rowQty);
    } else {
      // unknown: requiredQty에 더하지 않는다(0으로 섞여 들어가지 않게 — 부분합일 뿐임을
      // needsColorQty로 명시하고, 화면은 숫자 자체를 보여주지 않는다).
      cur.unknownBasisCount += 1;
    }
    // PR-226: rowBasis와 무관하게(계산값을 적용했어도) 단위가 맞는 작지 수량이 있으면
    // "대조용" 합계에 누적한다 — 이게 있어야 계산값을 적용한 행도 작지 값과 비교해
    // mismatch를 표시할 수 있다. PR-231: 수동 지정 행은 이 대조에서 완전히 빠진다(경고
    // 대상이 아니다 — 작지 값이 같이 있어도 비교하지 않는다).
    if (unitMatches && rowBasis !== 'manual') {
      cur.sheetPresentCount += 1;
      cur.sheetPresentSum = round4(cur.sheetPresentSum + sheetQtyRaw);
      // 계산값을 적용한 행(color-qty/computed)은 "그 행 자신의 계산값"과 작지 값을
      // 바로 비교한다 — sheet를 적용한 행(그 행만의 계산값이 없음)은 여기서 비교하지
      // 않고, 아래(자재 전체 집계 이후)에서 총수량×요척과 비교한다.
      if (rowBasis === 'color-qty' || rowBasis === 'computed') {
        const diffPct = rowQty !== 0 ? Math.abs(rowQty - sheetQtyRaw) / Math.abs(rowQty) : (sheetQtyRaw !== 0 ? 1 : 0);
        if (diffPct > SHEET_QTY_MISMATCH_THRESHOLD_PCT) cur.computedVsSheetMismatch = true;
      }
    }
    const category = (bi.category ?? '').trim();
    if (category && !cur.categories.includes(category)) cur.categories.push(category);
    if (colorRaw && !cur.colors.includes(colorRaw)) cur.colors.push(colorRaw);

    // 색상별 올림(ceil)을 위해 색상별 필요 미터를 따로 누적한다(색상 구분 없는 행은 '-' 하나로 취급).
    // PR-220/220b: sheet/color-qty/computed 행만 누적한다 — unknown 행은 색상별 포장
    // 올림에도 참여하지 않는다(이 자재는 포장 환산 자체를 건너뛴다, 아래 참고).
    if (rowBasis !== 'unknown') {
      const colorKey = colorRaw || '-';
      cur.colorMeters.set(colorKey, round4((cur.colorMeters.get(colorKey) ?? 0) + rowQty));
    }

    // PR-186: BOM 행에 종류가 있으면 그것, 없으면 자재(Item) 단위 지정(effectiveSubType).
    const subtype = effectiveSubType(bi, bi.material);
    if (cur.subtype === undefined) cur.subtype = subtype;
    else if (cur.subtype !== subtype) cur.subtypeMixed = true;

    map.set(bi.material.id, cur);
  }

  const rules = opts?.packagingRules ?? [];
  const result: MaterialRequirementRow[] = [];
  for (const row of map.values()) {
    row.orderedQty = round4(num(orderedByItemId.get(row.itemId)));
    row.unlinkedOrderedQty = round4(num(opts?.unlinkedByItemId?.get(row.itemId)));
    row.shortageQty = Math.max(0, round4(row.requiredQty - row.orderedQty));

    // PR-220b: 이 자재의 BOM 행 중 "색상은 있는데 근거(작지 수량/수량표)가 없는" 행이
    // 하나라도 있으면, requiredQty는 나머지 행들만의 부분합일 뿐이라 신뢰할 수 없다 —
    // 포장 환산(packaging/conversionWarning/suggestedPackaging)도 전부 건너뛰고
    // needsColorQty만 표시한다(요구사항: "needsColorQty 행은 포장 환산도 하지 않는다").
    row.needsColorQty = row.unknownBasisCount > 0;

    if (row.needsColorQty) {
      row.materialSubType = row.subtypeMixed ? null : (row.subtype ?? null);
      row.conversionWarning = NEEDS_COLOR_QTY_WARNING;
    } else {
      const subtype = row.subtypeMixed ? null : row.subtype;
      row.materialSubType = subtype ?? null;
      const rule = subtype ? rules.find((r) => r.materialSubType === subtype) : undefined;

      if (subtype && rule) {
        // PR-186: 종류가 정해지고 규칙이 있으면 Item.unit과 무관하게 환산한다 — 단위 라벨은
        // 규칙의 packagingUnitLabel(콘/롤)을 쓴다(Item.unit이 'EA'여도 상관없다).
        row.packaging = buildPackagingConversion(row.colorMeters, row.requiredQty, row.orderedQty, rule);
      } else if (subtype && !rule) {
        // 종류는 있는데(BOM 행 또는 Item 지정) 규칙 테이블에 없음(데이터 누락) — 추측 금지.
        row.conversionWarning = MISSING_SUBTYPE_WARNING;
      } else if (!row.reviewed && looksLikeThreadOrTape(row.materialName, rules)) {
        // PR-186: 종류 미지정 + 이름이 실/테이프로 보임 + 아직 검토 안 함 → 미터 수량을
        // 제안하지 않고 경고만(Item.unit이 'EA'여도 여기서 걸린다 — 운영 데이터 실측 결과).
        row.conversionWarning = MISSING_SUBTYPE_WARNING;
        row.suggestedPackaging = buildSuggestedPackaging(row, rules);
      } else if (!row.reviewed && classifyPackagingUnit(row.unit)) {
        // PR-185 B-2에서 쓰던 폴백 — 단위 자체가 콘/롤로 표기돼 있는데 종류가 없는 경우.
        row.conversionWarning = MISSING_SUBTYPE_WARNING;
        row.suggestedPackaging = buildSuggestedPackaging(row, rules);
      }
      // reviewed=true(= "실/테이프 아님"으로 확정)이고 종류도 없으면 일반 자재로 둔다(아무 필드도 안 채움).
    }

    // PR-220/220b: 출처 표시 + 계산값 비교. computedQty는 basis와 무관하게 항상 제공한다
    // (화면의 "계산수량" 열, 작지 수량/수량표 유무와 상관없이 비교 기준으로 쓸 수 있게).
    // PR-226: mismatch는 이제 "sheet를 적용했을 때"만이 아니라 "단위가 맞는 작지 수량이
    // 있었으면"(sheetPresentCount) 항상 계산값과 비교한다 — 계산값을 적용한 행도 작지
    // 값과 차이가 크면 확인 필요를 알려야 하기 때문이다(적용값 자체는 바뀌지 않음).
    row.computedQty = round4(row.consumptionPerUnit * target);
    row.quantityUnitKind = classifyQuantityUnit(row.unit);
    if (row.sheetPresentCount > 0) {
      row.sheetQty = row.sheetPresentSum;
      let mismatch = row.computedVsSheetMismatch;
      if (row.sheetAppliedCount > 0) {
        // 계산값이 없어 작지를 적용한 행이 있다 — 그 행만의 계산값이 없으므로 PR-220부터
        // 쓰던 참고 비교(자재 전체 총수량×요척 vs 작지 합계)를 그대로 유지한다.
        const diffPct = row.computedQty !== 0 ? Math.abs(row.computedQty - row.sheetPresentSum) / Math.abs(row.computedQty) : 0;
        mismatch = mismatch || diffPct > SHEET_QTY_MISMATCH_THRESHOLD_PCT;
      }
      row.mismatch = mismatch;
      row.sheetQtyLooksLikeTotalQtyMisread = sheetQtyLooksLikeTotalQtyMisread(row.sheetQty, target, row.mismatch, row.quantityUnitKind);
      row.extremeConsumptionMismatch = isExtremeConsumptionMismatch(row.computedQty, row.sheetQty);
    }
    const usedBases: Array<'sheet' | 'color-qty' | 'computed' | 'manual'> = [];
    if (row.manualBasisCount > 0) usedBases.push('manual');
    if (row.sheetAppliedCount > 0) usedBases.push('sheet');
    if (row.colorQtyBasisCount > 0) usedBases.push('color-qty');
    if (row.computedBasisCount > 0) usedBases.push('computed');
    if (row.unknownBasisCount > 0 && usedBases.length > 0) {
      row.basis = 'mixed';
    } else if (row.unknownBasisCount > 0) {
      row.basis = 'unknown';
    } else {
      row.basis = usedBases.length === 1 ? usedBases[0] : 'mixed';
    }
    row.hasManualOverride = row.manualBasisCount > 0;

    const {
      colorMeters: _colorMeters, subtype: _subtype, subtypeMixed: _subtypeMixed, unit: _unit, materialName: _materialName, reviewed: _reviewed,
      sheetAppliedCount: _sheetAppliedCount, computedBasisCount: _computedBasisCount, manualBasisCount: _manualBasisCount,
      sheetPresentCount: _sheetPresentCount, sheetPresentSum: _sheetPresentSum,
      computedVsSheetMismatch: _computedVsSheetMismatch,
      colorQtyBasisCount: _colorQtyBasisCount, unknownBasisCount: _unknownBasisCount,
      ...clean
    } = row;
    result.push(clean);
  }
  return result;
}
