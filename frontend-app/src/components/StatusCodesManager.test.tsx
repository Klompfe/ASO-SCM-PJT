import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/statusCodes.service', () => ({
  getStatusCodes: vi.fn(),
  createStatusCode: vi.fn(),
  updateStatusCode: vi.fn(),
  deleteStatusCode: vi.fn(),
}));

import { StatusCodesManager } from './StatusCodesManager';

// PR-140: 상태코드 관리 화면(관리자 전용) — WorkOrdersManager/ItemsManager와 마찬가지로 hook을
// 쓰는 함수 컴포넌트라(이 프로젝트엔 jsdom/testing-library가 없어 dispatcher 없이 직접 호출하면
// "Invalid hook call"이 난다) renderToStaticMarkup으로 구조만 확인한다. 등록/수정/삭제/빈 조건
// 경고 같은 실제 동작은 Puppeteer로 배포 화면에서 검증한다(ListSearchGuard.test.tsx와 동일 방침).
describe('StatusCodesManager (PR-140)', () => {
  it('도메인 선택/등록 폼/목록 테이블이 그려진다', () => {
    const html = renderToStaticMarkup(createElement(StatusCodesManager));
    expect(html).toContain('상태코드 관리');
    expect(html).toContain('aria-label="도메인 선택"');
    expect(html).toContain('WORK_ORDER');
    expect(html).toContain('aria-label="상태코드 값"');
    expect(html).toContain('aria-label="상태코드 라벨"');
    expect(html).toContain('aria-label="상태코드 정렬순서"');
    expect(html).toContain('상태코드 등록');
    expect(html).toContain('등록된 상태코드가 없습니다.'); // 첫 렌더(아직 조회 전)는 빈 목록
  });
});
