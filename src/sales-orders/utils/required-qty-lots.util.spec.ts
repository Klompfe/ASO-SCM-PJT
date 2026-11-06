import { sumRequiredQtyLots } from './required-qty-lots.util';

describe('sumRequiredQtyLots (PR-226)', () => {
  it('① LOT 2줄 [a, b] → 합계 a+b', () => {
    expect(sumRequiredQtyLots([499, 259])).toBe(758);
  });

  it('소수 오차를 반올림한다(0.1 + 0.2)', () => {
    expect(sumRequiredQtyLots([0.1, 0.2])).toBe(0.3);
  });

  it('② LOT 1줄 → 그대로', () => {
    expect(sumRequiredQtyLots([758])).toBe(758);
  });

  it('필드가 없거나(undefined/null) 배열이 아니면 null(기존 requiredQty를 그대로 둠)', () => {
    expect(sumRequiredQtyLots(undefined)).toBeNull();
    expect(sumRequiredQtyLots(null)).toBeNull();
    expect(sumRequiredQtyLots('758')).toBeNull();
    expect(sumRequiredQtyLots(758)).toBeNull();
  });

  it('④ 음수/NaN은 제외하고 나머지만 합산한다', () => {
    expect(sumRequiredQtyLots([499, -10, NaN, 259])).toBe(758);
  });

  it('전부 음수/NaN/문자열이면 null(유효한 값이 하나도 없음)', () => {
    expect(sumRequiredQtyLots([-1, NaN, 'x'])).toBeNull();
  });

  it('0은 유효한 값으로 포함한다(그 LOT에 실제로 수량이 없었던 경우)', () => {
    expect(sumRequiredQtyLots([0, 758])).toBe(758);
  });

  it('④ 개수 상한(10개)을 넘으면 앞 10개만 합산한다', () => {
    const lots = Array.from({ length: 15 }, () => 1);
    expect(sumRequiredQtyLots(lots)).toBe(10);
  });

  it('문자열 숫자("499")도 Number 변환되어 합산된다', () => {
    expect(sumRequiredQtyLots(['499', '259'])).toBe(758);
  });
});
