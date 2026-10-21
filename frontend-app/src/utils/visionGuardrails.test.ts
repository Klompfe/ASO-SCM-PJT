import { describe, it, expect } from 'vitest';
import {
  shouldBlockSaveForStyleNo,
  summarizeWarnings,
  groupDuplicateIndexes,
  applyKeepOnlyThisRow,
} from './visionGuardrails';

describe('shouldBlockSaveForStyleNo (PR-200)', () => {
  it('STYLE_NO_LAST_DIGIT이 있으면 저장을 막는다', () => {
    expect(shouldBlockSaveForStyleNo({ warnings: [{ code: 'STYLE_NO_LAST_DIGIT', message: 'x' }] })).toBe(true);
  });

  it('다른 경고는 저장을 막지 않는다', () => {
    expect(shouldBlockSaveForStyleNo({ warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }] })).toBe(false);
  });

  it('경고가 없으면 막지 않는다', () => {
    expect(shouldBlockSaveForStyleNo({ warnings: undefined })).toBe(false);
  });
});

describe('summarizeWarnings (PR-200)', () => {
  it('overview·bomItems 경고를 종류별로 센다', () => {
    const results = [
      {
        overview: { warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }] },
        bomItems: [
          { warnings: [{ code: 'UNKNOWN_NAME', message: 'x' }] },
          { warnings: [{ code: 'UNKNOWN_NAME', message: 'x' }, { code: 'POSSIBLE_DUPLICATE', message: 'x' }] },
          { warnings: null },
        ],
      },
    ];
    expect(summarizeWarnings(results)).toEqual({
      totalCount: 4,
      byCode: { STYLE_NO_FORMAT: 1, UNKNOWN_NAME: 2, POSSIBLE_DUPLICATE: 1 },
    });
  });

  it('경고가 하나도 없으면 0', () => {
    expect(summarizeWarnings([{ overview: { warnings: undefined }, bomItems: [{ warnings: undefined }] }])).toEqual({ totalCount: 0, byCode: {} });
  });
});

describe('groupDuplicateIndexes (PR-200)', () => {
  it('같은 그룹(suggestions)이 반복돼도 한 번만 묶는다', () => {
    const dup = { code: 'POSSIBLE_DUPLICATE', message: 'x', suggestions: ['0', '1', '2'] };
    const bomItems = [{ warnings: [dup] }, { warnings: [dup] }, { warnings: [dup] }, { warnings: undefined }];
    expect(groupDuplicateIndexes(bomItems)).toEqual([[0, 1, 2]]);
  });

  it('중복 묶음이 없으면 빈 배열', () => {
    expect(groupDuplicateIndexes([{ warnings: undefined }])).toEqual([]);
  });

  it('서로 다른 묶음은 각각 반환한다', () => {
    const groupA = { code: 'POSSIBLE_DUPLICATE', message: 'x', suggestions: ['0', '1'] };
    const groupB = { code: 'POSSIBLE_DUPLICATE', message: 'x', suggestions: ['3', '4'] };
    const bomItems = [{ warnings: [groupA] }, { warnings: [groupA] }, { warnings: undefined }, { warnings: [groupB] }, { warnings: [groupB] }];
    expect(groupDuplicateIndexes(bomItems)).toEqual([[0, 1], [3, 4]]);
  });
});

describe('applyKeepOnlyThisRow (PR-200)', () => {
  it('고른 행만 빼고 나머지를 제외 대상에 더한다(기존 제외 목록 유지)', () => {
    const result = applyKeepOnlyThisRow([0, 1, 2], 1, new Set([5]));
    expect(result).toEqual(new Set([5, 0, 2]));
  });

  it('기존 Set을 바꾸지 않는다(불변)', () => {
    const original = new Set([5]);
    applyKeepOnlyThisRow([0, 1], 0, original);
    expect(original).toEqual(new Set([5]));
  });
});
