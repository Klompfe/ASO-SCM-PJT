import { describe, it, expect } from 'vitest';
import {
  shouldBlockSaveForStyleNo,
  summarizeWarnings,
  groupDuplicateIndexes,
  applyKeepOnlyThisRow,
  collectFormatConfirmItems,
  pageMismatchNotice,
  clampPage,
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

describe('collectFormatConfirmItems (PR-200b)', () => {
  it('형식 오류(STYLE_NO_FORMAT)만 있는 행은 목록에 포함된다', () => {
    const items = [{ index: 0, overview: { styleNo: 'MB00-AAA-000', warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }] } }];
    expect(collectFormatConfirmItems(items)).toEqual([{ index: 0, styleNo: 'MB00-AAA-000' }]);
  });

  it('끝 글자 숫자(STYLE_NO_LAST_DIGIT, 이미 차단 대상)는 제외한다', () => {
    const items = [{ index: 0, overview: { styleNo: 'MB00AAA0002', warnings: [{ code: 'STYLE_NO_LAST_DIGIT', message: 'x' }] } }];
    expect(collectFormatConfirmItems(items)).toEqual([]);
  });

  it('두 경고가 같이 있어도(이론상) LAST_DIGIT이 있으면 제외한다', () => {
    const items = [{ index: 0, overview: { styleNo: 'x', warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }, { code: 'STYLE_NO_LAST_DIGIT', message: 'x' }] } }];
    expect(collectFormatConfirmItems(items)).toEqual([]);
  });

  it('경고가 없으면 빈 목록', () => {
    expect(collectFormatConfirmItems([{ index: 0, overview: { styleNo: 'MB00AAA000Z', warnings: [] } }])).toEqual([]);
    expect(collectFormatConfirmItems([{ index: 0, overview: { styleNo: 'MB00AAA000Z', warnings: undefined } }])).toEqual([]);
  });

  it('칩으로 고쳐져 경고가 사라진(현재 overview에 없는) 행은 포함되지 않는다', () => {
    // 호출자가 "지금" overview를 넘긴다는 전제 — 경고가 빠진 상태를 그대로 넘기면 당연히 빠진다.
    const fixed = { index: 0, overview: { styleNo: 'MB00AAA000Z', warnings: undefined } };
    expect(collectFormatConfirmItems([fixed])).toEqual([]);
  });

  it('일괄 저장처럼 여러 행이 섞여도 형식 오류 행만 뽑는다', () => {
    const items = [
      { index: 0, overview: { styleNo: 'OK', warnings: [] } },
      { index: 1, overview: { styleNo: 'FORMAT-BAD', warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }] } },
      { index: 2, overview: { styleNo: 'LAST-DIGIT-BAD', warnings: [{ code: 'STYLE_NO_LAST_DIGIT', message: 'x' }] } },
      { index: 3, overview: { styleNo: 'FORMAT-BAD-2', warnings: [{ code: 'STYLE_NO_FORMAT', message: 'x' }] } },
    ];
    expect(collectFormatConfirmItems(items)).toEqual([
      { index: 1, styleNo: 'FORMAT-BAD' },
      { index: 3, styleNo: 'FORMAT-BAD-2' },
    ]);
  });
});

describe('pageMismatchNotice (PR-200b)', () => {
  it('AI 결과 건수와 PDF 쪽수가 같으면 안내 없음', () => {
    expect(pageMismatchNotice(6, 6)).toBeNull();
  });

  it('다르면 한 줄 안내를 돌려준다', () => {
    expect(pageMismatchNotice(4, 6)).toBe('AI 결과 4건 / PDF 6쪽 — 쪽 번호가 맞지 않을 수 있습니다. ◀▶ 로 직접 찾아 주세요.');
  });

  it('쪽수를 모르면(이미지 업로드 등) 안내 없음', () => {
    expect(pageMismatchNotice(1, null)).toBeNull();
  });
});

describe('clampPage (PR-200b)', () => {
  it('요청한 쪽이 총 쪽수 이내면 그대로', () => {
    expect(clampPage(3, 6)).toBe(3);
  });

  it('총 쪽수를 넘으면 마지막 쪽으로 보정한다', () => {
    expect(clampPage(9, 6)).toBe(6);
  });

  it('0 이하로 요청하면 1쪽으로 보정한다', () => {
    expect(clampPage(0, 6)).toBe(1);
  });

  it('쪽수를 모르면 요청한 값을 그대로 돌려준다(추측 안 함)', () => {
    expect(clampPage(3, null)).toBe(3);
  });
});
