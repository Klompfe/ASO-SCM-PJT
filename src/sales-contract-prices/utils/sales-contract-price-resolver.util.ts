// PR-166: CMT매입단가 표준가격 — 사용자가 확정한 우선순위를 그대로 코드로 옮긴다.
// 1) 스타일번호 정확매칭 — 과거 SALES CONTRACT에 이 스타일이 그대로 있으면 그 단가.
// 2) 브랜드×품종(Description/ItemType) 평균 — 편차가 크지 않으면(아래 기준) 평균을
//    "표준가격"으로 쓸 수 있다고 본다.
// 3) 그 외(매칭 자체가 없거나, 있어도 편차가 너무 크면) — 단일 숫자를 자동으로 내지
//    않고 범위(min~max)만 제공한 뒤 업무 관리자의 수동 확인/입력을 기다린다
//    (NEEDS_REVIEW) — 사용자가 명시한 순서: "정확매칭 최우선 → 브랜드품종 평균
//    차선 → 매칭 안 되는 건 범위로 제공 후 관리자 입력/승인 대기".
export type PriceConfidence = 'EXACT_STYLE_MATCH' | 'BRAND_CATEGORY_AVERAGE' | 'NEEDS_REVIEW';

export interface PriceRowLike {
  styleNo: string;
  brand: string | null;
  category: string | null;
  unitPrice: number;
}

export interface ResolvedCmtPrice {
  confidence: PriceConfidence;
  // EXACT_STYLE_MATCH/BRAND_CATEGORY_AVERAGE일 때만 채워진다 — NEEDS_REVIEW는
  // 자동으로 숫자를 내지 않는다(아래 priceMin/priceMax로 참고 범위만 제공).
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  matchedCount: number;
  note: string;
}

// 브랜드 품종 비교용 정규화 — "WOMEN'S PANTS"와 "PANTS"를 같은 품종으로 본다.
// 완벽한 매칭은 아니지만(자유 텍스트라 한계가 있음), 흔한 "WOMEN'S/MEN'S" 접두만
// 제거하고 한쪽이 다른 쪽을 포함하면 같은 품종으로 간주한다.
function normalizeCategory(v: string | null | undefined): string {
  if (!v) return '';
  return v
    .toUpperCase()
    .replace(/^(WOMEN'?S|MEN'?S)\s+/, '')
    .trim();
}

function categoriesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCategory(a);
  const nb = normalizeCategory(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// 편차가 평균의 20% 이내면 "평균을 표준가격으로 믿을 만하다"로 본다 — 실데이터
// (26FW_통합_SALES_CONTRACT, 110건) 기준 많은 브랜드×품종 조합이 동일 단가이거나
// 근접해 이 기준을 통과했고, 빈폴/PANTS처럼 편차가 큰 조합은 의도대로 걸러진다.
const VARIANCE_THRESHOLD = 0.2;

export function resolveCmtPrice(
  targetStyleNo: string,
  targetBrand: string | null,
  targetCategory: string | null,
  rows: PriceRowLike[],
): ResolvedCmtPrice {
  const exact = rows.find((r) => r.styleNo.toUpperCase() === targetStyleNo.toUpperCase());
  if (exact) {
    return {
      confidence: 'EXACT_STYLE_MATCH',
      price: exact.unitPrice,
      priceMin: exact.unitPrice,
      priceMax: exact.unitPrice,
      matchedCount: 1,
      note: `SALES CONTRACT에 스타일번호가 그대로 있음(단가 $${exact.unitPrice})`,
    };
  }

  const groupRows = targetBrand
    ? rows.filter((r) => r.brand === targetBrand && categoriesMatch(r.category, targetCategory))
    : [];

  if (groupRows.length === 0) {
    return {
      confidence: 'NEEDS_REVIEW',
      price: null,
      priceMin: null,
      priceMax: null,
      matchedCount: 0,
      note: targetBrand
        ? `SALES CONTRACT에 ${targetBrand}×${targetCategory ?? '(품종 미지정)'} 참고 데이터가 없음 — 수동 입력 필요`
        : '브랜드를 분류할 수 없어 참고 데이터를 찾지 못함 — 수동 입력 필요',
    };
  }

  const prices = groupRows.map((r) => r.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = avg > 0 ? (max - min) / avg : 0;

  if (variance <= VARIANCE_THRESHOLD) {
    return {
      confidence: 'BRAND_CATEGORY_AVERAGE',
      price: Math.round(avg * 10000) / 10000,
      priceMin: min,
      priceMax: max,
      matchedCount: groupRows.length,
      note: `${targetBrand}×${targetCategory ?? '(품종 미지정)'} 평균 $${(Math.round(avg * 10000) / 10000)} (${groupRows.length}건, $${min}~$${max})`,
    };
  }

  return {
    confidence: 'NEEDS_REVIEW',
    price: null,
    priceMin: min,
    priceMax: max,
    matchedCount: groupRows.length,
    note: `${targetBrand}×${targetCategory ?? '(품종 미지정)'} 단가 편차가 커서(${groupRows.length}건, $${min}~$${max}) 평균을 표준가격으로 쓰기 어려움 — 수동 확인 필요`,
  };
}
