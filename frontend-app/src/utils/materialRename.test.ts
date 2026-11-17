import { describe, it, expect } from 'vitest';
import { buildMasterRenameConfirmMessage, isNameChanged } from './materialRename';

describe('buildMasterRenameConfirmMessage (PR-241)', () => {
  it('스타일 수·BOM 행 수·발주 연결 건수를 모두 담은 확인 문구를 만든다', () => {
    const msg = buildMasterRenameConfirmMessage({ styleCount: 3, bomItemCount: 5, orderCount: 2 });
    expect(msg).toContain('스타일 3개');
    expect(msg).toContain('BOM 행 5개');
    expect(msg).toContain('발주/입고 2건');
    expect(msg).toContain('품목 id로 연결돼 있어 따라 바뀝니다');
  });

  it('연결된 것이 전혀 없으면(0건) 그 사실 그대로 보여준다', () => {
    const msg = buildMasterRenameConfirmMessage({ styleCount: 0, bomItemCount: 0, orderCount: 0 });
    expect(msg).toContain('스타일 0개');
    expect(msg).toContain('발주/입고 0건');
  });

  it('이미 확정·내보낸 선적서류의 설명 문구는 바뀌지 않는다는 점을 알려준다(선적을 센다고 오해하지 않도록)', () => {
    const msg = buildMasterRenameConfirmMessage({ styleCount: 1, bomItemCount: 1, orderCount: 1 });
    expect(msg).toContain('이미 확정·내보낸 선적서류의 설명 문구는 바뀌지 않습니다');
    expect(msg).not.toContain('선적 1건');
  });
});

describe('isNameChanged (PR-241)', () => {
  it('공백만 다르면 바뀐 것으로 보지 않는다', () => {
    expect(isNameChanged('합성자재', '합성자재')).toBe(false);
    expect(isNameChanged('합성자재', ' 합성자재 ')).toBe(false);
    expect(isNameChanged(null, '')).toBe(false);
  });

  it('실제로 다르면 바뀐 것으로 본다', () => {
    expect(isNameChanged('합성자재A', '합성자재B')).toBe(true);
    expect(isNameChanged(null, '합성자재B')).toBe(true);
  });
});
