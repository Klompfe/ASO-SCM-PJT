import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BulkSavePrecheckPanel } from './BulkSavePrecheckPanel';
import type { PrecheckEntry } from '../utils/bulkSavePrecheck';

// PR-250: jsdom 이 없어 클릭은 못 본다 — 표 렌더(헤드라인·배지·동작 버튼 유무·저장 안 함 안내)만 정적으로 확인.
// 대상 선택·분류 규칙은 bulkSavePrecheck.test.ts 의 순수 함수 테스트가 검증한다.
const zero = { newRows: 0, changedRows: 0, removeCandidates: 0, overviewItems: 0 };
const entries: PrecheckEntry[] = [
  { index: 0, styleNo: 'S-NEW', kind: 'new', counts: zero, summary: '신규 스타일 — 바로 저장할 수 있습니다' },
  { index: 1, styleNo: 'S-CHG', kind: 'changed', counts: { ...zero, newRows: 2 }, summary: '신규 자재 2행' },
  { index: 2, styleNo: 'S-SAME', kind: 'unchanged', counts: zero, summary: '기존과 동일 — 저장하지 않습니다' },
  { index: 3, styleNo: 'S-CHECK', kind: 'needsCheck', reason: '점검에 실패했습니다', counts: zero, summary: '점검에 실패했습니다' },
];
const render = (over: Partial<Parameters<typeof BulkSavePrecheckPanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(BulkSavePrecheckPanel, {
      entries, running: false, progress: { done: 4, total: 4 }, savedIndexes: new Set<number>(), notes: new Map<number, string>(),
      saving: false, onSaveNew: vi.fn(), onOpenCompare: vi.fn(), onClose: vi.fn(), ...over,
    }),
  );

describe('BulkSavePrecheckPanel (PR-250)', () => {
  it('헤드라인 숫자와 분류 배지, 저장 안 함 안내가 보인다', () => {
    const html = render();
    expect(html).toContain('신규 1건 / 변경 있음 1건 / 변경 없음 1건 / 확인 필요 1건');
    for (const label of ['신규', '변경 있음', '변경 없음', '확인 필요']) expect(html).toContain(label);
    expect(html).toContain('이 표를 닫으면 아무것도 저장되지 않습니다');
    expect(html).toContain('닫기(저장 안 함)');
  });

  it('"신규 N건 저장" 버튼은 신규 수만큼, "비교하고 저장"은 변경 있음 행에만 있다', () => {
    const html = render();
    expect(html).toContain('신규 1건 저장');
    expect(html.match(/비교하고 저장/g)).toHaveLength(1);
    expect(html).toMatch(/bulk-precheck-row-1[\s\S]*비교하고 저장/);
    expect(html).toContain('저장 안 함'); // 변경 없음 행
    expect(html).toContain('개별 확인 필요'); // 확인 필요 행
  });

  it('저장된 행은 "저장됨"으로 바뀌고 저장 버튼 대상에서 빠진다', () => {
    const html = render({ savedIndexes: new Set([0, 1]) });
    expect(html).toContain('저장됨');
    expect(html).toContain('신규 0건 저장');
    expect(html).not.toContain('비교하고 저장');
  });

  it('신규가 없으면 신규 저장 버튼이 비활성(disabled)', () => {
    const html = render({ entries: entries.filter((e) => e.kind !== 'new') });
    expect(html).toMatch(/disabled=""[^>]*>신규 0건 저장/);
  });

  it('점검 중에는 진행 문구가 보이고 저장·비교 버튼이 비활성', () => {
    const html = render({ running: true, progress: { done: 1, total: 4 } });
    expect(html).toContain('기존 자재명세와 비교하는 중... (1/4)');
    expect(html).toMatch(/disabled=""[^>]*>신규 1건 저장/);
  });

  it('건너뜀·실패 사유(notes)가 해당 행에 표시된다', () => {
    const html = render({ notes: new Map([[0, '상태가 바뀌어 건너뜀 — 이제 기존 스타일입니다.']]) });
    expect(html).toContain('상태가 바뀌어 건너뜀');
  });

  it('확인 필요 행에는 사유 문구가 보이고 저장 버튼이 없다', () => {
    const html = render();
    expect(html).toContain('점검에 실패했습니다');
    expect(html.match(/비교하고 저장/g)).toHaveLength(1);
  });
});
