import { calculateParsingFee, PARSING_FEE_TABLE, type ParsingFeeCategory } from './billing-fee.util';

// PR-151: 과금 산식 = 기본 문서 요금(품목 5개까지 포함) + (6번째 품목부터 초과 품목 수 × 라인당 단가).
describe('calculateParsingFee (PR-151)', () => {
  const cases: { category: ParsingFeeCategory; base: number; perExcess: number }[] = [
    { category: 'AUTO', base: 50, perExcess: 10 },
    { category: 'MANUAL_OURS', base: 500, perExcess: 100 },
    { category: 'MANUAL_CUSTOMER', base: 50, perExcess: 10 },
  ];

  it('단가표가 요구사항 그대로다', () => {
    expect(PARSING_FEE_TABLE).toEqual({
      AUTO: { baseFeeKrw: 50, perExcessItemKrw: 10 },
      MANUAL_OURS: { baseFeeKrw: 500, perExcessItemKrw: 100 },
      MANUAL_CUSTOMER: { baseFeeKrw: 50, perExcessItemKrw: 10 },
    });
  });

  describe.each(cases)('$category (기본 $base원, 초과 라인당 $perExcess원)', ({ category, base, perExcess }) => {
    it('품목 0개도 기본요금만 청구된다', () => {
      expect(calculateParsingFee(category, 0)).toBe(base);
    });

    it('품목 5개 이하는 기본요금만 청구된다(경계값 포함)', () => {
      for (const n of [1, 2, 3, 4, 5]) {
        expect(calculateParsingFee(category, n)).toBe(base);
      }
    });

    it('품목 6개면 기본요금 + 초과 1개분이 청구된다(경계값)', () => {
      expect(calculateParsingFee(category, 6)).toBe(base + perExcess);
    });

    it('품목 10개면 기본요금 + 초과 5개분이 청구된다', () => {
      expect(calculateParsingFee(category, 10)).toBe(base + perExcess * 5);
    });

    it('품목이 많아도(50개) 선형으로 계속 증가한다', () => {
      expect(calculateParsingFee(category, 50)).toBe(base + perExcess * 45);
    });

    it('소수점 품목 수는 내림해서 계산한다', () => {
      // 정수만 들어와야 정상이지만, 방어적으로 내림 처리해 음수 초과가 나지 않게 한다.
      expect(calculateParsingFee(category, 6.9)).toBe(base + perExcess);
    });
  });

  it('음수 품목 수는 에러를 던진다', () => {
    expect(() => calculateParsingFee('AUTO', -1)).toThrow(RangeError);
  });

  it('숫자가 아닌 값(NaN/Infinity)은 에러를 던진다', () => {
    expect(() => calculateParsingFee('AUTO', NaN)).toThrow(RangeError);
    expect(() => calculateParsingFee('AUTO', Infinity)).toThrow(RangeError);
  });

  it('AUTO와 MANUAL_CUSTOMER는 단가가 같지만 서로 다른 카테고리로 독립적으로 관리된다', () => {
    expect(calculateParsingFee('AUTO', 20)).toBe(calculateParsingFee('MANUAL_CUSTOMER', 20));
    expect(PARSING_FEE_TABLE.AUTO).not.toBe(PARSING_FEE_TABLE.MANUAL_CUSTOMER); // 같은 객체 참조를 공유하지 않음(나중에 따로 바뀔 수 있어야 함)
  });
});
