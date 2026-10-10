import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/items.service', () => ({ getThreadTapeCandidates: vi.fn(), classifyThreadTape: vi.fn() }));
vi.mock('../api/materialPackagingUnitRules.service', () => ({ getMaterialPackagingUnitRules: vi.fn() }));
vi.mock('../api/auth.service', () => ({ getCurrentUser: vi.fn() }));

import { ThreadTapeClassificationManager } from './ThreadTapeClassificationManager';

// PR-186 D/FIX: 실/테이프 종류 일괄 지정 화면 — 자동 확정이 아니라는 안내문과 필터가
// 초기 렌더에 나와야 한다(로딩 중이라 후보 목록 자체는 비동기로 뒤에 채워짐). getCurrentUser()도
// 비동기라 초기 렌더에는 아직 해석되지 않은 상태(currentUser=null) — 이 환경은 jsdom/상호작용
// 시뮬레이션 없이 renderToStaticMarkup만 쓰므로, 권한 확인 전(=USER와 동일하게 취급) 기본값으로
// "선택 적용" 버튼이 아니라 PR-186-FIX의 권한 안내 문구가 보여야 한다(안전한 기본값).
describe('ThreadTapeClassificationManager (PR-186)', () => {
  it('실/테이프 종류 지정 안내문과 필터를 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(ThreadTapeClassificationManager, {}));
    expect(html).toContain('실/테이프 종류 지정');
    expect(html).toContain('자동으로 확정하지 않습니다');
    expect(html).toContain('검토 안 함');
    expect(html).toContain('검토 완료');
  });

  it('권한 확인 전(기본값)에는 "선택 적용" 버튼 대신 관리자/매니저 안내 문구를 보여준다(PR-186-FIX)', () => {
    const html = renderToStaticMarkup(createElement(ThreadTapeClassificationManager, {}));
    expect(html).toContain('관리자/매니저만 적용할 수 있습니다');
    expect(html).not.toContain('선택 적용 ('); // 버튼 라벨("선택 적용 (N건)")은 없어야 함 — 안내문 속 인용은 허용
  });
});
