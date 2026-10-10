import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/items.service', () => ({ getThreadTapeCandidates: vi.fn(), classifyThreadTape: vi.fn() }));
vi.mock('../api/materialPackagingUnitRules.service', () => ({ getMaterialPackagingUnitRules: vi.fn() }));

import { ThreadTapeClassificationManager } from './ThreadTapeClassificationManager';

// PR-186 D: 실/테이프 종류 일괄 지정 화면 — 자동 확정이 아니라는 안내문과 필터/적용 버튼이
// 초기 렌더에 나와야 한다(로딩 중이라 후보 목록 자체는 비동기로 뒤에 채워짐).
describe('ThreadTapeClassificationManager (PR-186)', () => {
  it('실/테이프 종류 지정 안내문과 필터/적용 버튼을 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(ThreadTapeClassificationManager, {}));
    expect(html).toContain('실/테이프 종류 지정');
    expect(html).toContain('자동으로 확정하지 않습니다');
    expect(html).toContain('검토 안 함');
    expect(html).toContain('검토 완료');
    expect(html).toContain('선택 적용');
  });
});
