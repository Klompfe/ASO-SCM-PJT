import { convertMeterPriceToUnitPrice, classifyPackagingUnit, round4 } from './meter-price-conversion.util';

// PR-182: 미터단가 → 콘/롤 단가 환산. 실제 INVOICE로 검증된 5개 케이스.
describe('convertMeterPriceToUnitPrice (PR-182)', () => {
  it('코아사: 0.00012/m × 2500m = $0.30/콘', () => {
    expect(convertMeterPriceToUnitPrice(0.00012, 2500, '콘').unitPrice).toBeCloseTo(0.3, 10);
  });

  it('오바사·스쿠이사: 0.00012/m × 4000m = $0.48/콘', () => {
    expect(convertMeterPriceToUnitPrice(0.00012, 4000, '콘').unitPrice).toBeCloseTo(0.48, 10);
  });

  it('폴리지누이도: 0.00012/m × 500m = $0.06/콘', () => {
    expect(convertMeterPriceToUnitPrice(0.00012, 500, '콘').unitPrice).toBeCloseTo(0.06, 10);
  });

  it('다데 테이프: 0.0008/m × 50m = $0.04/롤', () => {
    expect(convertMeterPriceToUnitPrice(0.0008, 50, '롤').unitPrice).toBeCloseTo(0.04, 10);
  });

  it('암홀 테이프: 0.01/m × 50m = $0.50/롤', () => {
    expect(convertMeterPriceToUnitPrice(0.01, 50, '롤').unitPrice).toBeCloseTo(0.5, 10);
  });

  it('최종 단가는 소수 4자리로 반올림된다', () => {
    expect(convertMeterPriceToUnitPrice(1 / 3, 1).unitPrice).toBe(0.3333);
  });

  it('formula에 식과 환산 결과가 그대로 남는다(검산용)', () => {
    const { formula } = convertMeterPriceToUnitPrice(0.00012, 2500, '콘');
    expect(formula).toBe('0.00012/m × 2500m = 0.3/콘');
  });
});

describe('round4 (PR-182)', () => {
  it('소수 4자리를 넘는 값을 반올림한다', () => {
    expect(round4(0.123456)).toBe(0.1235);
    expect(round4(0.1)).toBe(0.1);
  });
});

describe('classifyPackagingUnit (PR-182)', () => {
  it('CONE/콘 표기(대소문자 무시)를 CONE으로 분류한다', () => {
    expect(classifyPackagingUnit('CONE')).toBe('CONE');
    expect(classifyPackagingUnit('cone')).toBe('CONE');
    expect(classifyPackagingUnit('콘')).toBe('CONE');
    expect(classifyPackagingUnit('10 Cone')).toBe('CONE');
  });

  it('ROLL/롤 표기(대소문자 무시)를 ROLL로 분류한다', () => {
    expect(classifyPackagingUnit('ROLL')).toBe('ROLL');
    expect(classifyPackagingUnit('roll')).toBe('ROLL');
    expect(classifyPackagingUnit('롤')).toBe('ROLL');
  });

  it('M/EA/YD 등 그 외 단위는 null — 환산하지 않는다', () => {
    expect(classifyPackagingUnit('M')).toBeNull();
    expect(classifyPackagingUnit('EA')).toBeNull();
    expect(classifyPackagingUnit('YD')).toBeNull();
    expect(classifyPackagingUnit(null)).toBeNull();
    expect(classifyPackagingUnit(undefined)).toBeNull();
  });
});
