import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Sidebar } from './Sidebar';

const baseProps = {
  activeTab: 'dashboard' as const,
  setActiveTab: () => {},
  userName: '테스터',
};

// PR-203: "자재 포장단위" 메뉴도 다른 adminOnly 항목(선적서류 기본정보/상태코드 관리/사용자 관리)과
// 같은 기준(isManagerOrAdmin, 즉 MANAGER 또는 ADMIN)으로 USER에게는 숨어야 한다.
describe('Sidebar 관리자 전용 메뉴 가시성 (PR-203)', () => {
  it('일반 USER에게는 "자재 포장단위" 메뉴가 보이지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { ...baseProps, canManageUsers: false, isManagerOrAdmin: false, userRole: 'USER' }),
    );
    expect(html).not.toContain('자재 포장단위');
  });

  it('MANAGER에게는 "자재 포장단위" 메뉴가 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { ...baseProps, canManageUsers: false, isManagerOrAdmin: true, userRole: 'MANAGER' }),
    );
    expect(html).toContain('자재 포장단위');
  });

  it('ADMIN에게는 "자재 포장단위" 메뉴가 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { ...baseProps, canManageUsers: true, isManagerOrAdmin: true, userRole: 'ADMIN' }),
    );
    expect(html).toContain('자재 포장단위');
  });
});
