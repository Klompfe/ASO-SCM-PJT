import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ShortageTable } from './StyleShortagePanel';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';

// PR-191: 발주 화면 "스타일번호로 필요 자재 찾기"에서 머리글이 한 칸씩 밀려 보이던
// 문제(체크박스 <td>는 각 행 맨 앞인데 "일괄" <th>는 맨 뒤) — ShortageTable은 비동기
// 의존이 없는 순수 표시 컴포넌트라 renderToStaticMarkup으로 직접 검증 가능하다.
const row = (overrides: Partial<MaterialRequirementRow> = {}): MaterialRequirementRow => ({
  itemId: 1,
  itemCode: 'MAT-1',
  itemName: '다데<실크>',
  categories: ['부자재'],
  colors: [],
  consumptionPerUnit: 1,
  requiredQty: 100,
  orderedQty: 0,
  unlinkedOrderedQty: 0,
  shortageQty: 100,
  lineCount: 1,
  ...overrides,
});

function headerLabels(html: string): string[] {
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  const thead = theadMatch?.[1] ?? '';
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].trim());
}

function firstRowCellCount(html: string): number {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  const tbody = tbodyMatch?.[1] ?? '';
  const firstRowMatch = tbody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
  const firstRow = firstRowMatch?.[1] ?? '';
  return [...firstRow.matchAll(/<td[^>]*>/g)].length;
}

describe('ShortageTable 머리글 정렬 (PR-191)', () => {
  it('onToggle이 없으면 머리글 개수와 데이터 행의 칸 수가 일치한다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    const headers = headerLabels(html);
    expect(headers).toHaveLength(firstRowCellCount(html));
    expect(headers).toEqual(['자재', '카테고리', '필요 총수량', '발주(스타일 연결)', '발주(미연결, 참고)', '부족 수량', '발주']);
  });

  it('onToggle이 있으면 "선택" 머리글이 맨 앞에 오고, 체크박스 칸도 맨 앞이라 전체 개수가 일치한다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn(), onToggle: vi.fn(), selected: new Set<number>() }));
    const headers = headerLabels(html);
    expect(headers[0]).toBe('선택');
    expect(headers).toEqual(['선택', '자재', '카테고리', '필요 총수량', '발주(스타일 연결)', '발주(미연결, 참고)', '부족 수량', '발주']);
    expect(headers).toHaveLength(firstRowCellCount(html));
  });

  it('버튼 열 머리글이 빈 칸이 아니라 "발주"다(예전엔 빈 th)', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    expect(headerLabels(html).at(-1)).toBe('발주');
  });
});

describe('ShortageTable "다른 스타일 미입고 발주" 참고 안내 (PR-191)', () => {
  it('otherStylePendingCountByItem에 건수가 있으면 참고 문구가 뜨고 버튼이 아니다(수정하기 대상 아님)', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row()],
        onPick: vi.fn(),
        otherStylePendingCountByItem: new Map([[1, 2]]),
      }),
    );
    expect(html).toContain('참고: 다른 스타일 미입고 발주 2건 있음');
    expect(html).toContain('이 자재로 발주하기'); // 수정하기가 아니라 발주하기 버튼
    expect(html).not.toContain('>수정하기<');
  });

  it('현재 스타일에 연결된 미입고 발주가 있으면(editable) "수정하기" 버튼이 뜬다', () => {
    const order = { id: 1, itemId: 1, status: 'PENDING' as const, quantity: 10 };
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row()],
        onPick: vi.fn(),
        onEdit: vi.fn(),
        editable: new Map([[1, { order, pendingCount: 1 }]]),
      }),
    );
    expect(html).toContain('>수정하기<');
  });

  it('건수가 0이거나 없으면 참고 문구가 렌더되지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    expect(html).not.toContain('참고: 다른 스타일 미입고 발주');
  });
});
