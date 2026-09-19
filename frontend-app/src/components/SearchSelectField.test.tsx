import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { SearchSelectField, SearchSelectModal } from './SearchSelectField';
import { ShortageTable } from './StyleShortagePanel';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';

// 렌더된 React 트리에서 조건에 맞는 요소를 모두 찾는다(DOM 없이 onClick 같은 props를 호출해 보기 위함).
const findAll = (node: ReactNode, pred: (el: ReactElement<any>) => boolean, out: ReactElement<any>[] = []): ReactElement<any>[] => {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<any>;
  if (pred(el)) out.push(el);
  findAll(el.props?.children, pred, out);
  return out;
};

type Item = { id: number; name: string };
const items: Item[] = [{ id: 1, name: '원단A' }, { id: 2, name: '단추B' }];
const baseProps = (over: any = {}) => ({
  title: '품목 검색',
  state: { keyword: '', loading: false, error: null, results: items },
  getKey: (i: Item) => i.id,
  renderRow: (i: Item) => i.name,
  onKeywordChange: vi.fn(),
  onPick: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('SearchSelectField — 검색 선택 공통 컴포넌트 (PR-126)', () => {
  it('닫힌 상태: 선택값이 입력란에 보이고 옆에 돋보기 버튼이 있으며 팝업은 없다', () => {
    const html = renderToStaticMarkup(createElement(SearchSelectField<Item>, {
      value: items[0], onChange: vi.fn(), search: async () => [], getKey: (i) => i.id, getLabel: (i) => i.name, ariaLabel: '품목', placeholder: '품목 검색',
    }));
    expect(html).toContain('value="원단A"');
    expect(html).toContain('aria-label="품목 검색"'); // 돋보기 버튼
    expect(html).not.toContain('role="dialog"');
  });

  it('선택값이 없으면 placeholder, 선택 해제 버튼은 allowClear일 때만 값이 있는 경우에 보인다', () => {
    const base = { onChange: vi.fn(), search: async () => [] as Item[], getKey: (i: Item) => i.id, getLabel: (i: Item) => i.name, ariaLabel: '품목', placeholder: '전체 품목' };
    const empty = renderToStaticMarkup(createElement(SearchSelectField<Item>, { ...base, value: null, allowClear: true }));
    expect(empty).toContain('placeholder="전체 품목"');
    expect(empty).not.toContain('선택 해제');
    expect(renderToStaticMarkup(createElement(SearchSelectField<Item>, { ...base, value: items[0], allowClear: true }))).toContain('aria-label="품목 선택 해제"');
    expect(renderToStaticMarkup(createElement(SearchSelectField<Item>, { ...base, value: items[0] }))).not.toContain('선택 해제');
  });

  describe('팝업(SearchSelectModal) 상태', () => {
    it('결과 목록: 행이 보이고 로딩/결과없음/오류 문구는 없다', () => {
      const html = renderToStaticMarkup(createElement(SearchSelectModal<Item>, baseProps()));
      expect(html).toContain('원단A');
      expect(html).toContain('단추B');
      expect(html).not.toContain('검색 중...');
      expect(html).not.toContain('검색 결과가 없습니다.');
    });

    it('로딩 중이면 "검색 중..."만 보이고 결과 행은 숨긴다', () => {
      const html = renderToStaticMarkup(createElement(SearchSelectModal<Item>, baseProps({ state: { keyword: 'a', loading: true, error: null, results: items } })));
      expect(html).toContain('검색 중...');
      expect(html).not.toContain('원단A');
    });

    it('빈 결과면 "검색 결과가 없습니다."', () => {
      const html = renderToStaticMarkup(createElement(SearchSelectModal<Item>, baseProps({ state: { keyword: 'zzz', loading: false, error: null, results: [] } })));
      expect(html).toContain('검색 결과가 없습니다.');
    });

    it('오류면 오류 문구(결과없음 문구는 보이지 않는다)', () => {
      const html = renderToStaticMarkup(createElement(SearchSelectModal<Item>, baseProps({ state: { keyword: 'a', loading: false, error: '서버 오류', results: [] } })));
      expect(html).toContain('서버 오류');
      expect(html).not.toContain('검색 결과가 없습니다.');
    });

    it('행을 클릭하면 그 항목이 onPick 콜백으로 전달된다', () => {
      const props = baseProps();
      const tree = SearchSelectModal<Item>(props) as ReactNode;
      const rowButtons = findAll(tree, (el) => el.type === 'button' && typeof el.props.onClick === 'function' && el.props['aria-label'] !== '닫기' && findAll(el.props.children, () => false).length === 0 && ['원단A', '단추B'].includes(String(el.props.children)));
      expect(rowButtons).toHaveLength(2);
      rowButtons[1].props.onClick();
      expect(props.onPick).toHaveBeenCalledWith(items[1]);
    });

    it('검색어 입력은 onKeywordChange로, 닫기 버튼과 바깥 클릭은 onClose로 전달된다', () => {
      const props = baseProps();
      const tree = SearchSelectModal<Item>(props) as ReactNode;
      const input = findAll(tree, (el) => el.type === 'input')[0];
      input.props.onChange({ target: { value: '단추' } });
      expect(props.onKeywordChange).toHaveBeenCalledWith('단추');
      findAll(tree, (el) => el.props?.['aria-label'] === '닫기')[0].props.onClick();
      (tree as ReactElement<any>).props.onClick();
      expect(props.onClose).toHaveBeenCalledTimes(2);
    });

    it('allowClear용 onClear가 있으면 "선택 해제" 버튼이 보인다', () => {
      const html = renderToStaticMarkup(createElement(SearchSelectModal<Item>, baseProps({ onClear: vi.fn() })));
      expect(html).toContain('선택 해제');
    });
  });
});

describe('스타일 부족 자재 표 (PR-126)', () => {
  const row = (itemId: number, itemName: string, requiredQty: number, orderedQty: number): MaterialRequirementRow => ({
    itemId, itemCode: `C${itemId}`, itemName, categories: ['겉감'], colors: [], consumptionPerUnit: 1, requiredQty, orderedQty, shortageQty: Math.max(0, requiredQty - orderedQty), lineCount: 1,
  });
  const rows = [row(1, '원단', 1250, 100), row(2, '단추', 300, 300)];

  it('필요/이미 발주/부족 수량이 보이고 부족 행만 강조되며 각 행에 "이 자재로 발주하기" 버튼이 있다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows, onPick: vi.fn() }));
    expect(html).toContain('1,250');
    expect(html).toContain('1,150'); // 부족 = 1250 - 100
    expect(html.match(/이 자재로 발주하기/g)).toHaveLength(2);
    expect(html).toMatch(/data-testid="shortage-row-1"[^>]*>|class="bg-red-50"[^>]*data-testid="shortage-row-1"/);
    expect(html.split('bg-red-50').length - 1).toBe(1); // 부족 있는 1행만
    expect(html).toContain('text-green-600'); // 부족 없는 행은 초록
  });

  it('버튼을 누르면 그 자재 행이 콜백으로 전달된다(폼 자동 채움의 입력)', () => {
    const onPick = vi.fn();
    const tree = ShortageTable({ rows, onPick }) as ReactNode;
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(2);
    buttons[0].props.onClick();
    expect(onPick).toHaveBeenCalledWith(rows[0]);
  });
});
