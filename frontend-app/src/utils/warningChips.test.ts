import { describe, expect, it } from 'vitest';
import { buildChipsTitle, selectVisibleChips } from './warningChips';

describe('selectVisibleChips (PR-221)', () => {
  it('메시지가 2개 이하면 접지 않고 전부 보여준다(접기 버튼 없음)', () => {
    const r = selectVisibleChips(['a', 'b'], false);
    expect(r).toEqual({ visible: ['a', 'b'], hiddenCount: 0, canCollapse: false });
  });

  it('메시지가 0개여도(빈 배열) 접지 않는다', () => {
    const r = selectVisibleChips([], false);
    expect(r).toEqual({ visible: [], hiddenCount: 0, canCollapse: false });
  });

  it('메시지가 5개면 접힌 상태에서 처음 2개만 보이고 나머지 3개는 숨겨진다(+3)', () => {
    const r = selectVisibleChips(['a', 'b', 'c', 'd', 'e'], false);
    expect(r.visible).toEqual(['a', 'b']);
    expect(r.hiddenCount).toBe(3);
    expect(r.canCollapse).toBe(true);
  });

  it('메시지가 5개면 펼친 상태에서 5개 모두 보이고 숨겨진 개수는 0이다', () => {
    const r = selectVisibleChips(['a', 'b', 'c', 'd', 'e'], true);
    expect(r.visible).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.hiddenCount).toBe(0);
    expect(r.canCollapse).toBe(true);
  });

  it('메시지가 정확히 3개면 접을 수 있다(기본 2개 + "+1")', () => {
    const r = selectVisibleChips(['a', 'b', 'c'], false);
    expect(r.visible).toEqual(['a', 'b']);
    expect(r.hiddenCount).toBe(1);
    expect(r.canCollapse).toBe(true);
  });
});

describe('buildChipsTitle (PR-221)', () => {
  it('접힌 상태에서도 title 속성용 전체 메시지 목록을 만든다(건수 확인용)', () => {
    const title = buildChipsTitle([{ text: '자재 마스터에 없는 새 이름' }, { text: '요척×수량이 작지의 출고량과 다름 — 확인해주세요' }]);
    expect(title).toBe('자재 마스터에 없는 새 이름 · 요척×수량이 작지의 출고량과 다름 — 확인해주세요');
  });

  it('메시지가 없으면 빈 문자열이다', () => {
    expect(buildChipsTitle([])).toBe('');
  });
});
