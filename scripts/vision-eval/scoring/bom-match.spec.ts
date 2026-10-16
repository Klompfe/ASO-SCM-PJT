import { classifyBomItems, standardGroupOf, digitDiff, checkLabelZonePresence } from './bom-match';
import type { GoldenBomItem, AiBomItemLike } from '../types';

const golden = (overrides: Partial<GoldenBomItem>): GoldenBomItem => ({
  itemName: '다데',
  consumption: 2.9,
  unit: 'YD',
  isLabelZone: false,
  ...overrides,
});

const ai = (overrides: Partial<AiBomItemLike>): AiBomItemLike => ({
  itemName: '다데',
  consumption: 2.9,
  ...overrides,
});

describe('standardGroupOf (PR-199)', () => {
  it('사전 핵심 단어가 포함되면 그 그룹', () => {
    expect(standardGroupOf('다데<실크>')).toBe('다데');
  });
  it('핵심 단어가 깨졌어도(1글자 오독) 편집거리가 가까우면 같은 그룹(겉고리↔걸고리)', () => {
    expect(standardGroupOf('겉고리')).toBe(standardGroupOf('걸고리'));
  });
  it('사전에 없고 멀면 정규화된 이름 자체가 그룹', () => {
    expect(standardGroupOf('전혀다른부자재')).toBe('전혀다른부자재');
  });
});

describe('digitDiff (PR-199)', () => {
  it('2.9→2.7은 자리별로 9→7만 다르다고 기록한다', () => {
    expect(digitDiff(2.9, 2.7)).toEqual([{ golden: '9', read: '7' }]);
  });
  it('길이가 다르면 통째로 기록한다', () => {
    expect(digitDiff(2.9, 22.9)).toEqual([{ golden: '2.9', read: '22.9' }]);
  });
});

describe('classifyBomItems (PR-199)', () => {
  it('이름·값이 같으면 OK', () => {
    const result = classifyBomItems([golden({})], [ai({})]);
    expect(result).toEqual([{ type: 'OK', golden: golden({}), ai: ai({}) }]);
  });

  it('요척이 다르면 VALUE_DIFF이고 숫자 오독 자리를 기록한다(실사례 2.9→2.7)', () => {
    const result = classifyBomItems([golden({ consumption: 2.9 })], [ai({ consumption: 2.7 })]);
    expect(result).toEqual([
      { type: 'VALUE_DIFF', golden: golden({ consumption: 2.9 }), ai: ai({ consumption: 2.7 }), digitDiff: [{ golden: '9', read: '7' }] },
    ]);
  });

  it('이름이 1자 오독이면 NAME_DIFF(실사례 걸고리→겉고리)', () => {
    const g = golden({ itemName: '걸고리', consumption: 1 });
    const a = ai({ itemName: '겉고리', consumption: 1 });
    const result = classifyBomItems([g], [a]);
    expect(result).toEqual([{ type: 'NAME_DIFF', golden: g, ai: a }]);
  });

  it('골든에 없는 자재가 AI에만 있고 다른 값이면 EXTRA_OTHER', () => {
    const result = classifyBomItems([], [ai({ itemName: '전혀다른부자재', consumption: 5 })]);
    expect(result).toEqual([{ type: 'EXTRA_OTHER', ai: ai({ itemName: '전혀다른부자재', consumption: 5 }) }]);
  });

  it('골든 한 줄이 AI에서 같은 값의 3개 이름으로 나오면 1건 매칭 + 2건 EXTRA_DUPLICATE(실사례 재현)', () => {
    const g = golden({ itemName: '오바사', consumption: 20 });
    const rows = [ai({ itemName: '오바사', consumption: 20 }), ai({ itemName: '오바사변형1', consumption: 20 }), ai({ itemName: '오바사변형2', consumption: 20 })];
    const result = classifyBomItems([g], rows);
    expect(result.filter((r) => r.type === 'OK')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'EXTRA_DUPLICATE')).toHaveLength(2);
  });

  it('골든 항목에 대응하는 AI 행이 전혀 없으면 MISSING', () => {
    const g = golden({ itemName: '패드', consumption: 3 });
    expect(classifyBomItems([g], [])).toEqual([{ type: 'MISSING', golden: g }]);
  });

  it('라벨 구역(isLabelZone)은 요척 비교 대상에서 빠진다', () => {
    const g = golden({ itemName: 'CARE LABEL', isLabelZone: true, consumption: 0 });
    const result = classifyBomItems([g], []);
    expect(result).toEqual([]);
  });
});

describe('checkLabelZonePresence (PR-199) — 라벨 구역은 존재 여부만 센다', () => {
  it('AI 결과에 이름이 있으면 present=true', () => {
    const labelItem = golden({ itemName: 'CARE LABEL', isLabelZone: true });
    const result = checkLabelZonePresence([labelItem], [ai({ itemName: 'CARE LABEL', consumption: 0 })]);
    expect(result).toEqual([{ itemName: 'CARE LABEL', present: true }]);
  });

  it('AI 결과에 없으면 present=false', () => {
    const labelItem = golden({ itemName: 'CARE LABEL', isLabelZone: true });
    expect(checkLabelZonePresence([labelItem], [])).toEqual([{ itemName: 'CARE LABEL', present: false }]);
  });
});
