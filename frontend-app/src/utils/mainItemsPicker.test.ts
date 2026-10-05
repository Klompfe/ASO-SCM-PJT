import { describe, expect, it } from 'vitest';
import { addMainItem, removeMainItem } from './mainItemsPicker';

describe('addMainItem/removeMainItem (PR-171)', () => {
  it('빈 목록에 품목을 추가하면 목록에 들어간다', () => {
    const result = addMainItem([], { id: 1, name: '원단A' });
    expect(result).toEqual([{ id: 1, name: '원단A' }]);
  });

  it('이미 선택된 품목(같은 id)을 다시 추가하면 중복 추가되지 않는다', () => {
    const selected = [{ id: 1, name: '원단A' }];
    const result = addMainItem(selected, { id: 1, name: '원단A' });
    expect(result).toEqual([{ id: 1, name: '원단A' }]);
    expect(result).toBe(selected); // 변경 없으면 같은 참조를 돌려준다(불필요한 리렌더 방지)
  });

  it('picked가 null이면(검색 팝업에서 선택 없이 닫힘 등) 목록이 그대로 유지된다', () => {
    const selected = [{ id: 1, name: '원단A' }];
    expect(addMainItem(selected, null)).toBe(selected);
  });

  it('서로 다른 품목을 여러 번 추가하면 전부 쌓인다', () => {
    let selected = addMainItem([], { id: 1, name: '원단A' });
    selected = addMainItem(selected, { id: 2, name: '원단B' });
    selected = addMainItem(selected, { id: 3, name: '원단C' });
    expect(selected.map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it('removeMainItem은 해당 id만 제거하고 나머지는 유지한다', () => {
    const selected = [{ id: 1, name: '원단A' }, { id: 2, name: '원단B' }];
    expect(removeMainItem(selected, 1)).toEqual([{ id: 2, name: '원단B' }]);
  });

  it('존재하지 않는 id를 제거해도 에러 없이 목록이 그대로 유지된다', () => {
    const selected = [{ id: 1, name: '원단A' }];
    expect(removeMainItem(selected, 999)).toEqual([{ id: 1, name: '원단A' }]);
  });
});
