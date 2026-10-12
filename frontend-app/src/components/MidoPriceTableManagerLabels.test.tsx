import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/midoPriceTable.service', () => ({
  getMidoPriceItems: vi.fn(), createMidoPriceItem: vi.fn(), updateMidoPriceItem: vi.fn(),
  previewMidoPriceImport: vi.fn(), applyMidoPriceImport: vi.fn(),
}));
vi.mock('../api/auth.service', () => ({ getCurrentUser: vi.fn() }));

import { MidoPriceTableManager } from './MidoPriceTableManager';

// PR-188: 미도 단가표 관리 화면 — getCurrentUser()/getMidoPriceItems()는 비동기라
// renderToStaticMarkup(동기 초기 렌더만 지원하는 이 환경)에서는 권한 확인 전(기본값,
// USER와 동일하게 취급) 상태만 검증할 수 있다. 등록 폼/CSV 일괄 등록 블록은 MANAGER/ADMIN
// 확인 후에만 나타나므로 초기 렌더에는 보이지 않는 것이 올바른 동작이다 — 미리보기 표
// 기본 체크 로직은 utils/midoPriceImport.test.ts에서 순수 함수로 검증했다.
describe('MidoPriceTableManager (PR-188)', () => {
  it('안내문과 목록 영역을 렌더하고, 권한 확인 전(기본값)에는 USER 안내 문구를 보여준다', () => {
    const html = renderToStaticMarkup(createElement(MidoPriceTableManager, {}));
    expect(html).toContain('미도 단가표');
    expect(html).toContain('조회만 가능합니다');
  });

  it('권한 확인 전에는 등록 폼과 CSV 일괄 등록 블록이 보이지 않는다(MANAGER/ADMIN 확인 후에만 노출)', () => {
    const html = renderToStaticMarkup(createElement(MidoPriceTableManager, {}));
    expect(html).not.toContain('CSV 일괄 등록');
    expect(html).not.toContain('항목 등록');
  });

  it('목록 테이블의 검색/사용중지 토글은 권한과 무관하게 항상 보인다', () => {
    const html = renderToStaticMarkup(createElement(MidoPriceTableManager, {}));
    expect(html).toContain('항목명 검색');
    expect(html).toContain('사용 중지 항목도 보기');
  });
});
