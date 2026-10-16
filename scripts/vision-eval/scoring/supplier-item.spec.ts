import { parseSupplierItemName, stringDigitDiff, scoreSupplierItemName } from './supplier-item';

describe('parseSupplierItemName (PR-199 보완)', () => {
  it('")" 앞을 공급사, 뒤를 자재명으로 나눈다', () => {
    expect(parseSupplierItemName('르카이)KL-R114')).toEqual({ supplier: '르카이', itemName: 'KL-R114' });
  });
  it('")"가 없으면 공급사 없음(전체가 자재명)', () => {
    expect(parseSupplierItemName('KL-R114')).toEqual({ supplier: null, itemName: 'KL-R114' });
  });
});

describe('stringDigitDiff (PR-199 보완)', () => {
  it('길이가 같으면 숫자 자리만 비교한다(실사례 KL-R926→KL-R326)', () => {
    expect(stringDigitDiff('KL-R926', 'KL-R326')).toEqual([{ golden: '9', read: '3' }]);
  });
});

describe('scoreSupplierItemName (PR-199 보완) — 익명 재현', () => {
  it('공급사가 다르고 자재코드는 같으면 SUPPLIER_NAME_DIFF(실사례: 르카이→로케이, 코드 정확)', () => {
    const result = scoreSupplierItemName('르카이)KL-R114', '로케이)KL-R114');
    expect(result.type).toBe('SUPPLIER_NAME_DIFF');
  });

  it('자재 코드 숫자 한 자리가 오독되면 ITEM_CODE_DIGIT_DIFF(실사례: KL-R926→KL-R326)', () => {
    const result = scoreSupplierItemName('공급)KL-R926', '공급)KL-R326');
    expect(result).toEqual({ type: 'ITEM_CODE_DIGIT_DIFF', digitDiff: [{ golden: '9', read: '3' }] });
  });

  it('정답엔 공급사가 있는데 ")" 없이 붙어 나오면 SUPPLIER_MERGED', () => {
    const result = scoreSupplierItemName('르카이)KL-R114', '르카이KL-R114');
    expect(result.type).toBe('SUPPLIER_MERGED');
  });

  it('공급사·자재명이 완전히 같으면 OK', () => {
    expect(scoreSupplierItemName('르카이)KL-R114', '르카이)KL-R114')).toEqual({ type: 'OK' });
  });
});
