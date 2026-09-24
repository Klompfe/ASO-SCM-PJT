import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/hsCodeClassifications.service', () => ({
  getHsCodeClassifications: vi.fn(),
  getAllHsCodeClassifications: vi.fn(),
  createHsCodeClassification: vi.fn(),
  uploadHsCodeClassifications: vi.fn(),
  getHsCodeClassificationByStyle: vi.fn(),
  deleteHsCodeClassification: vi.fn(),
}));

import { HsCodeManager } from './HsCodeManager';

// PR-141: HS코드 분류 삭제 UI. HsCodeManager는 hook을 쓰는 함수 컴포넌트라(이 프로젝트엔
// jsdom/testing-library가 없어 dispatcher 없이 직접 호출하면 "Invalid hook call") 구조만
// renderToStaticMarkup으로 확인한다. 실제 삭제 클릭/확인 다이얼로그 동작은 Puppeteer로 검증한다
// (StatusCodesManager.test.tsx/ListSearchGuard.test.tsx와 동일 방침).
describe('HsCodeManager — 삭제 UI (PR-141)', () => {
  it('목록 테이블에 Action 열과 삭제 버튼이 있다(빈 목록이면 colSpan이 7로 늘어난다)', () => {
    const html = renderToStaticMarkup(createElement(HsCodeManager));
    expect(html).toContain('<th class="py-2 pr-3">Action</th>');
    // 첫 렌더(아직 조회 전)는 빈 목록 — colSpan이 새 열(Action) 포함 7이어야 한다.
    expect(html).toContain('colSpan="7"');
    expect(html).toContain('등록된 HS코드 분류가 없습니다.');
  });
});
