import { resolveCmtPrice, type PriceRowLike } from './sales-contract-price-resolver.util';

// 실제 26FW_통합_SALES_CONTRACT(110건) 분석에서 확인된 패턴을 그대로 쓴다:
// 루미에반×COAT는 전부 $10으로 편차 0 → 평균 신뢰 가능. 빈폴×PANTS는
// $4.5~$8.5로 편차가 커서(약 48%) 평균을 표준가격으로 쓰면 안 되는 실사례.
const ROWS: PriceRowLike[] = [
  { styleNo: 'LB1COAT01', brand: '루미에반', category: "WOMEN'S COAT", unitPrice: 10 },
  { styleNo: 'LB1COAT02', brand: '루미에반', category: "WOMEN'S COAT", unitPrice: 10 },
  { styleNo: 'BF1PANTS01', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: 4.5 },
  { styleNo: 'BF1PANTS02', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: 8.5 },
  { styleNo: 'BF1PANTS03', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: 6.5 },
];

describe('resolveCmtPrice (PR-166)', () => {
  it('스타일번호가 SALES CONTRACT에 그대로 있으면 그 단가를 EXACT_STYLE_MATCH로 반환한다', () => {
    const result = resolveCmtPrice('LB1COAT01', '루미에반', "WOMEN'S COAT", ROWS);
    expect(result).toMatchObject({ confidence: 'EXACT_STYLE_MATCH', price: 10, matchedCount: 1 });
  });

  it('대소문자가 달라도 스타일번호 정확매칭이 된다', () => {
    const result = resolveCmtPrice('lb1coat01', '루미에반', "WOMEN'S COAT", ROWS);
    expect(result.confidence).toBe('EXACT_STYLE_MATCH');
  });

  it('정확매칭이 없고 브랜드×품종 편차가 작으면(루미에반×COAT, 편차 0) 평균을 표준가격으로 쓴다', () => {
    const result = resolveCmtPrice('LB1COAT99', '루미에반', "WOMEN'S COAT", ROWS);
    expect(result.confidence).toBe('BRAND_CATEGORY_AVERAGE');
    expect(result.price).toBe(10);
    expect(result.matchedCount).toBe(2);
  });

  it("Description의 \"WOMEN'S \" 접두와 무관하게 같은 품종으로 매칭된다(COAT == WOMEN'S COAT)", () => {
    const result = resolveCmtPrice('LB1COAT99', '루미에반', 'COAT', ROWS);
    expect(result.confidence).toBe('BRAND_CATEGORY_AVERAGE');
  });

  it('정확매칭이 없고 브랜드×품종 편차가 크면(빈폴×PANTS, $4.5~$8.5) 평균을 내지 않고 범위만 제공, 수동 확인 대기로 둔다', () => {
    const result = resolveCmtPrice('BF1PANTS99', '빈폴', "WOMEN'S PANTS", ROWS);
    expect(result.confidence).toBe('NEEDS_REVIEW');
    expect(result.price).toBeNull();
    expect(result.priceMin).toBe(4.5);
    expect(result.priceMax).toBe(8.5);
    expect(result.matchedCount).toBe(3);
  });

  it('같은 브랜드×품종 참고 데이터가 전혀 없으면 NEEDS_REVIEW(범위도 없음)', () => {
    const result = resolveCmtPrice('MK1DRESS01', '마뗑킴', "WOMEN'S DRESS", ROWS);
    expect(result).toMatchObject({ confidence: 'NEEDS_REVIEW', price: null, priceMin: null, priceMax: null, matchedCount: 0 });
  });

  it('브랜드를 분류하지 못하면(null) 매칭 자체를 시도하지 않고 바로 NEEDS_REVIEW', () => {
    const result = resolveCmtPrice('XX1234567', null, "WOMEN'S COAT", ROWS);
    expect(result.confidence).toBe('NEEDS_REVIEW');
    expect(result.matchedCount).toBe(0);
  });

  it('품종이 아예 다르면(루미에반×PANTS는 데이터 없음) 매칭되지 않는다', () => {
    const result = resolveCmtPrice('LB1PANTS99', '루미에반', "WOMEN'S PANTS", ROWS);
    expect(result.confidence).toBe('NEEDS_REVIEW');
    expect(result.matchedCount).toBe(0);
  });
});
