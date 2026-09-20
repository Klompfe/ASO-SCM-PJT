import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pagination } from './Pagination';

const findAll = (node: ReactNode, pred: (el: ReactElement<any>) => boolean, out: ReactElement<any>[] = []): ReactElement<any>[] => {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<any>;
  if (pred(el)) out.push(el);
  findAll(el.props?.children, pred, out);
  return out;
};
// 함수 컴포넌트를 직접 호출해 나온 트리에서 버튼의 props(disabled/onClick)를 확인한다.
const buttons = (props: any) => {
  const tree = Pagination(props) as ReactElement<any>;
  return {
    prev: findAll(tree, (e) => e.props?.['aria-label'] === '이전 페이지')[0],
    next: findAll(tree, (e) => e.props?.['aria-label'] === '다음 페이지')[0],
  };
};

describe('Pagination 컴포넌트 (PR-128)', () => {
  it('현재 페이지/전체 페이지와 총 건수를 보여준다', () => {
    const html = renderToStaticMarkup(createElement(Pagination, { page: 2, totalPages: 5, total: 47, onPageChange: vi.fn() }));
    expect(html).toContain('2 / 5');
    expect(html).toContain('총 47건');
  });

  it('첫 페이지에서는 이전이 비활성, 마지막 페이지에서는 다음이 비활성', () => {
    const first = buttons({ page: 1, totalPages: 3, onPageChange: vi.fn() });
    expect(first.prev.props.disabled).toBe(true);
    expect(first.next.props.disabled).toBe(false);
    const last = buttons({ page: 3, totalPages: 3, onPageChange: vi.fn() });
    expect(last.prev.props.disabled).toBe(false);
    expect(last.next.props.disabled).toBe(true);
  });

  it('데이터 0건: 1 / 1 이고 두 버튼 모두 비활성', () => {
    const html = renderToStaticMarkup(createElement(Pagination, { page: 1, totalPages: 0, total: 0, onPageChange: vi.fn() }));
    expect(html).toContain('1 / 1');
    expect(html).toContain('총 0건');
    const b = buttons({ page: 1, totalPages: 0, total: 0, onPageChange: vi.fn() });
    expect(b.prev.props.disabled).toBe(true);
    expect(b.next.props.disabled).toBe(true);
  });

  it('이전/다음을 누르면 page-1 / page+1 로 onPageChange가 호출된다', () => {
    const onPageChange = vi.fn();
    const b = buttons({ page: 2, totalPages: 3, onPageChange });
    b.next.props.onClick();
    b.prev.props.onClick();
    expect(onPageChange).toHaveBeenNthCalledWith(1, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('disabled(조회 중)이면 가운데 페이지에서도 두 버튼이 잠긴다', () => {
    const b = buttons({ page: 2, totalPages: 3, disabled: true, onPageChange: vi.fn() });
    expect(b.prev.props.disabled).toBe(true);
    expect(b.next.props.disabled).toBe(true);
  });
});
