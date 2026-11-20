import { classifyCompositionStatus, cleanComposition, resolveCompositionUpdate } from './composition-update.util';

// PR-246: 혼용률 재저장 규칙 — 합성 값만 사용.
describe('composition-update.util (PR-246)', () => {
  it('cleanComposition: 공백만/빈 값/null은 null, 그 외는 trim만(대소문자 유지)', () => {
    expect(cleanComposition(undefined)).toBeNull();
    expect(cleanComposition('  ')).toBeNull();
    expect(cleanComposition(' Cotton 100% ')).toBe('Cotton 100%');
  });

  it('classifyCompositionStatus: 4종 + 대소문자 다르면 differs(정규화 없음)', () => {
    expect(classifyCompositionStatus(null, 'COTTON 100%')).toBe('fillEmpty');
    expect(classifyCompositionStatus('COTTON 100%', 'COTTON 100%')).toBe('same');
    expect(classifyCompositionStatus('COTTON 100%', 'Cotton 100%')).toBe('differs');
    expect(classifyCompositionStatus('COTTON 100%', '')).toBe('incomingEmpty');
    expect(classifyCompositionStatus(null, null)).toBe('incomingEmpty');
  });

  it('resolveCompositionUpdate: 다름은 overwrite=true일 때만 교체, 빈 값은 지우지 않음', () => {
    expect(resolveCompositionUpdate(null, 'A 100%', false)).toMatchObject({ changed: true, value: 'A 100%' });
    expect(resolveCompositionUpdate('A 100%', 'B 100%', false)).toMatchObject({ changed: false, value: 'A 100%', keptDifferent: true });
    expect(resolveCompositionUpdate('A 100%', 'B 100%', true)).toMatchObject({ changed: true, value: 'B 100%' });
    expect(resolveCompositionUpdate('A 100%', null, true)).toMatchObject({ changed: false, value: 'A 100%' });
    expect(resolveCompositionUpdate('A 100%', 'A 100%', true)).toMatchObject({ changed: false });
  });
});
