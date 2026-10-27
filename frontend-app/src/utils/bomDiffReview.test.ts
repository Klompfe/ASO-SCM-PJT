import { describe, it, expect } from 'vitest';
import {
  buildBomDiffDraftRows,
  defaultDecisionFor,
  buildDefaultDecisions,
  applyExcelBasedDefaults,
  summarizeBomDiff,
  buildReconcileActions,
} from './bomDiffReview';
import type { BomDiffRow, BomSimilarPair } from '../api/mapping.service';

const existing = (overrides: Partial<BomDiffRow['existing']> = {}) => ({
  bomItemId: 1,
  itemName: '다데<실크>',
  category: '부자재',
  colorCode: 'N/A',
  spec: 'N/A',
  consumption: 2.7,
  linkedPoCount: 0,
  ...overrides,
});

const incoming = (overrides: Partial<BomDiffRow['incoming']> = {}) => ({
  itemName: '다데<실크>',
  category: '부자재',
  colorCode: 'N/A',
  spec: 'N/A',
  consumption: 2.9,
  ...overrides,
});

describe('buildBomDiffDraftRows (PR-198)', () => {
  it('rows와 similarPairs를 표 1개로 합치고 SIMILAR 짝은 한 줄로 나온다', () => {
    const rows: BomDiffRow[] = [{ type: 'VALUE_DIFF', existing: existing(), incoming: incoming() }];
    const similarPairs: BomSimilarPair[] = [{ existing: existing({ bomItemId: 2, itemName: 'DARK GREY DG (원단A)' }), incoming: incoming({ itemName: '원단A' }) }];
    const draft = buildBomDiffDraftRows(rows, similarPairs);
    expect(draft).toHaveLength(2);
    expect(draft[0].type).toBe('VALUE_DIFF');
    expect(draft[1].type).toBe('SIMILAR');
  });
});

describe('defaultDecisionFor (PR-198) — 행 유형별 기본 동작', () => {
  it('VALUE_DIFF는 기본 건너뜀(사람이 직접 덮어쓰기를 골라야 함)', () => {
    expect(defaultDecisionFor({ key: 'k', type: 'VALUE_DIFF' })).toBe('SKIP');
  });
  it('ONLY_NEW는 기본 추가', () => {
    expect(defaultDecisionFor({ key: 'k', type: 'ONLY_NEW' })).toBe('ADD');
  });
  it('ONLY_EXISTING는 기본 그대로 두기(제거는 사람이 직접 고름)', () => {
    expect(defaultDecisionFor({ key: 'k', type: 'ONLY_EXISTING' })).toBe('KEEP');
  });
  it('SIMILAR은 기본 선택 없음', () => {
    expect(defaultDecisionFor({ key: 'k', type: 'SIMILAR' })).toBe('SKIP');
  });
  it('SAME은 할 일이 없다', () => {
    expect(defaultDecisionFor({ key: 'k', type: 'SAME' })).toBe('SKIP');
  });
});

describe('buildDefaultDecisions (PR-198)', () => {
  it('각 행에 기본 동작을 채운 Map을 만든다', () => {
    const rows = [
      { key: 'a', type: 'VALUE_DIFF' as const },
      { key: 'b', type: 'ONLY_NEW' as const },
    ];
    const decisions = buildDefaultDecisions(rows);
    expect(decisions.get('a')).toBe('SKIP');
    expect(decisions.get('b')).toBe('ADD');
  });
});

describe('applyExcelBasedDefaults (PR-198) — "엑셀 기준으로 모두 맞추기"는 체크만 채운다', () => {
  it('VALUE_DIFF→덮어쓰기, ONLY_NEW→추가, ONLY_EXISTING→제거, SIMILAR→교체로 채운다', () => {
    const rows = [
      { key: 'a', type: 'VALUE_DIFF' as const },
      { key: 'b', type: 'ONLY_NEW' as const },
      { key: 'c', type: 'ONLY_EXISTING' as const },
      { key: 'd', type: 'SIMILAR' as const },
      { key: 'e', type: 'SAME' as const },
    ];
    const decisions = applyExcelBasedDefaults(rows);
    expect(decisions.get('a')).toBe('OVERWRITE');
    expect(decisions.get('b')).toBe('ADD');
    expect(decisions.get('c')).toBe('REMOVE');
    expect(decisions.get('d')).toBe('REPLACE');
    expect(decisions.get('e')).toBe('SKIP');
  });
});

describe('summarizeBomDiff (PR-198)', () => {
  it('유형별 건수를 센다', () => {
    const rows = [
      { key: 'a', type: 'SAME' as const },
      { key: 'b', type: 'SAME' as const },
      { key: 'c', type: 'VALUE_DIFF' as const },
      { key: 'd', type: 'ONLY_NEW' as const },
      { key: 'e', type: 'ONLY_EXISTING' as const },
      { key: 'f', type: 'SIMILAR' as const },
    ];
    expect(summarizeBomDiff(rows)).toEqual({ same: 2, valueDiff: 1, onlyNew: 1, onlyExisting: 1, similar: 1 });
  });
});

describe('buildReconcileActions (PR-198) — [적용]을 눌러야만 호출되는 변환, 사람이 고른 것만 반영', () => {
  it('SKIP/KEEP인 행은 액션을 만들지 않는다(동작이 없는 행은 그대로 둔다)', () => {
    const rows = [
      { key: 'a', type: 'VALUE_DIFF' as const, existing: existing(), incoming: incoming() },
      { key: 'b', type: 'ONLY_EXISTING' as const, existing: existing({ bomItemId: 2 }) },
    ];
    const decisions = new Map([['a', 'SKIP' as const], ['b', 'KEEP' as const]]);
    expect(buildReconcileActions(rows, decisions)).toEqual([]);
  });

  it('OVERWRITE를 고르면 기존 bomItemId와 엑셀 값으로 액션을 만든다(요척 2.7→2.9)', () => {
    const rows = [{ key: 'a', type: 'VALUE_DIFF' as const, existing: existing(), incoming: incoming() }];
    const decisions = new Map([['a', 'OVERWRITE' as const]]);
    expect(buildReconcileActions(rows, decisions)).toEqual([
      { type: 'OVERWRITE', bomItemId: 1, newItem: expect.objectContaining({ itemName: '다데<실크>', consumption: 2.9 }) },
    ]);
  });

  it('ADD를 고르면 bomItemId 없이 newItem만 담긴 액션을 만든다', () => {
    const rows = [{ key: 'a', type: 'ONLY_NEW' as const, incoming: incoming({ itemName: '새자재' }) }];
    const decisions = new Map([['a', 'ADD' as const]]);
    const actions = buildReconcileActions(rows, decisions);
    expect(actions).toEqual([{ type: 'ADD', newItem: expect.objectContaining({ itemName: '새자재' }) }]);
    expect(actions[0]).not.toHaveProperty('bomItemId');
  });

  it('REMOVE를 고르면 bomItemId만 담긴 액션을 만든다', () => {
    const rows = [{ key: 'a', type: 'ONLY_EXISTING' as const, existing: existing({ bomItemId: 7 }) }];
    const decisions = new Map([['a', 'REMOVE' as const]]);
    expect(buildReconcileActions(rows, decisions)).toEqual([{ type: 'REMOVE', bomItemId: 7 }]);
  });

  it('SIMILAR 짝에서 REPLACE를 고르면 기존 bomItemId + 엑셀 이름으로 액션을 만든다', () => {
    const rows = [{
      key: 'similar-0',
      type: 'SIMILAR' as const,
      existing: existing({ bomItemId: 2, itemName: 'DARK GREY DG (원단A)' }),
      incoming: incoming({ itemName: '원단A' }),
    }];
    const decisions = new Map([['similar-0', 'REPLACE' as const]]);
    expect(buildReconcileActions(rows, decisions)).toEqual([
      { type: 'REPLACE', bomItemId: 2, newItem: expect.objectContaining({ itemName: '원단A' }) },
    ]);
  });

  it('decisions에 없는 행(명시 안 됨)은 기본 SKIP으로 취급해 액션을 만들지 않는다', () => {
    const rows = [{ key: 'a', type: 'VALUE_DIFF' as const, existing: existing(), incoming: incoming() }];
    expect(buildReconcileActions(rows, new Map())).toEqual([]);
  });
});
