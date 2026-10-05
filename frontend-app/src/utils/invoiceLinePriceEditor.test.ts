import { describe, it, expect } from 'vitest';
import { selectRawCandidate, selectConvertedOption, clearSelection, resolveSource } from './invoiceLinePriceEditor';

describe('invoiceLinePriceEditor (PR-182)', () => {
  it('원시 후보를 선택하면 입력란이 채워지고 근거 코멘트는 없다', () => {
    const sel = selectRawCandidate(2.5, 3);
    expect(sel).toEqual({ unitPriceUsdInput: '2.5', candidateId: 3, priceBasisNote: null });
  });

  it('환산 옵션을 선택하면 환산값과 근거 코멘트(식+종류명)가 함께 채워진다', () => {
    const sel = selectConvertedOption(7, { unitPriceUsd: 0.3, formula: '0.00012/m × 2500m = 0.3/콘', displayName: '코아사' });
    expect(sel.unitPriceUsdInput).toBe('0.3');
    expect(sel.candidateId).toBe(7);
    expect(sel.priceBasisNote).toBe('미도 단가표 0.00012/m × 2500m = 0.3/콘(코아사)');
  });

  it('입력란을 직접 고치면 선택/근거 코멘트가 풀린다', () => {
    const sel = clearSelection('1.23');
    expect(sel).toEqual({ unitPriceUsdInput: '1.23', candidateId: null, priceBasisNote: null });
  });

  it('후보가 선택돼 있으면 MIDO_PRICE_TABLE, 아니면 MANUAL을 출처로 정한다', () => {
    expect(resolveSource(5)).toBe('MIDO_PRICE_TABLE');
    expect(resolveSource(null)).toBe('MANUAL');
  });
});
