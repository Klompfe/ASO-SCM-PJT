import { pairMissingWithExtraByValue } from './value-pairing';
import type { BomMatchResult } from './bom-match';
import type { GoldenBomItem, AiBomItemLike } from '../types';

const golden = (overrides: Partial<GoldenBomItem>): GoldenBomItem => ({
  itemName: '가짜자재',
  consumption: 10,
  unit: 'YD',
  isLabelZone: false,
  ...overrides,
});
const ai = (overrides: Partial<AiBomItemLike>): AiBomItemLike => ({
  itemName: '가짜AI자재',
  consumption: 10,
  ...overrides,
});

describe('pairMissingWithExtraByValue (PR-199c — PILOT-3 보정)', () => {
  it('수량이 5% 이내로 가까운 MISSING/EXTRA를 일대일로 짝지어 NAME_DIFF_PAIRED_BY_VALUE로 센다(OK로 합산하지 않음)', () => {
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: golden({ itemName: '정답자재A', consumption: 100 }) },
      { type: 'EXTRA_OTHER', ai: ai({ itemName: 'AI자재A', consumption: 101 }) }, // 1% 차이
    ];
    const outcome = pairMissingWithExtraByValue(results);
    expect(outcome.pairedCount).toBe(1);
    expect(outcome.results).toEqual([
      { type: 'NAME_DIFF_PAIRED_BY_VALUE', golden: results[0].golden, ai: results[1].ai },
    ]);
  });

  it('수량 차이가 5%를 넘으면 짝짓지 않는다', () => {
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: golden({ consumption: 100 }) },
      { type: 'EXTRA_OTHER', ai: ai({ consumption: 120 }) }, // 20% 차이
    ];
    const outcome = pairMissingWithExtraByValue(results);
    expect(outcome.pairedCount).toBe(0);
    expect(outcome.results).toEqual(results);
  });

  it('후보가 동점(여러 EXTRA가 같은 거리)이면 짝짓지 않는다', () => {
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: golden({ consumption: 100 }) },
      { type: 'EXTRA_OTHER', ai: ai({ itemName: 'X', consumption: 101 }) },
      { type: 'EXTRA_OTHER', ai: ai({ itemName: 'Y', consumption: 99 }) }, // 둘 다 거리 1로 동점
    ];
    const outcome = pairMissingWithExtraByValue(results);
    expect(outcome.pairedCount).toBe(0);
  });

  it('여러 쌍을 각각 서로의 유일한 최선일 때만 일대일로 짝짓는다(이중 집계 없음)', () => {
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: golden({ itemName: '정답A', consumption: 100 }) },
      { type: 'MISSING', golden: golden({ itemName: '정답B', consumption: 50 }) },
      { type: 'EXTRA_OTHER', ai: ai({ itemName: 'AI-A', consumption: 100 }) },
      { type: 'EXTRA_DUPLICATE', ai: ai({ itemName: 'AI-B', consumption: 50 }) },
    ];
    const outcome = pairMissingWithExtraByValue(results);
    expect(outcome.pairedCount).toBe(2);
    expect(outcome.results.every((r) => r.type === 'NAME_DIFF_PAIRED_BY_VALUE')).toBe(true);
  });

  it('MISSING이나 EXTRA가 없으면 그대로 돌려준다', () => {
    const results: BomMatchResult[] = [{ type: 'OK', golden: golden({}), ai: ai({}) }];
    expect(pairMissingWithExtraByValue(results)).toEqual({ results, pairedCount: 0 });
  });
});
