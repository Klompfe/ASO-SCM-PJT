import { computeCallCount, estimateCost, shouldCallApi, computeCallCountByMode, countDistinctPdfs } from './call-count.util';

describe('computeCallCount (PR-199)', () => {
  it('페이지×모드×실행×모델을 곱한다', () => {
    expect(computeCallCount({ pages: 9, modes: 3, runs: 3, models: 2 })).toBe(162);
  });

  it('모델 수를 반드시 포함한다(--models 지정 시 호출 수가 모델 수만큼 늘어남)', () => {
    const oneModel = computeCallCount({ pages: 9, modes: 3, runs: 3, models: 1 });
    const twoModels = computeCallCount({ pages: 9, modes: 3, runs: 3, models: 2 });
    expect(twoModels).toBe(oneModel * 2);
  });
});

describe('estimateCost (PR-199)', () => {
  it('비용 단가를 모르면(안 주면) null — 추측하지 않는다', () => {
    const result = estimateCost({ pages: 9, modes: 3, runs: 3, models: 1 });
    expect(result.callCount).toBe(81);
    expect(result.estimatedCostUsd).toBeNull();
  });

  it('단가를 주면 호출 수 × 단가로 추정한다', () => {
    const result = estimateCost({ pages: 9, modes: 3, runs: 3, models: 1 }, 0.01);
    expect(result.estimatedCostUsd).toBe(0.81);
  });
});

describe('shouldCallApi (PR-199) — --yes 없이는 API를 호출하지 않는다', () => {
  it('yes=true일 때만 호출을 허용한다', () => {
    expect(shouldCallApi(true)).toBe(true);
    expect(shouldCallApi(false)).toBe(false);
  });
});

describe('countDistinctPdfs (PR-199b)', () => {
  it('같은 PDF 이름이 여러 번 나와도 한 번만 센다(모드 A 호출 수 기준)', () => {
    expect(countDistinctPdfs(['a.pdf', 'a.pdf', 'b.pdf', 'a.pdf'])).toBe(2);
  });
});

describe('computeCallCountByMode (PR-199b) — 모드 A는 PDF 수, 나머지는 페이지 수', () => {
  it('모드 A 호출 수 = PDF 수 × 실행 × 모델(페이지 수가 아니라)', () => {
    // 실사례 재현: PDF 2개(각 4·5페이지=9페이지)를 모드 A로, 모델 1개·실행 1회.
    const total = computeCallCountByMode([{ mode: 'A', unitCount: 2 }], 1, 1);
    expect(total).toBe(2); // 9가 아니라 2
  });

  it('모드별로 단위가 다르면 각각 계산해 더한다(A=PDF수, C=페이지수)', () => {
    const total = computeCallCountByMode(
      [{ mode: 'A', unitCount: 2 }, { mode: 'C', unitCount: 9 }],
      3,
      2,
    );
    expect(total).toBe((2 + 9) * 3 * 2);
  });
});
