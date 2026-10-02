import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-167: ItemsManager 검색 영역의 "목표출고일" 라벨이 실제로는 작업지시서(작지)
// AI분석으로 채워지는 "납기(RDD)"인데 라벨 문구만 잘못돼 있던 것을 고친다 —
// 데이터/동작 변경 없이 라벨만 검증한다.
vi.mock('../api/items.service', () => ({ getAllItems: vi.fn(), createItem: vi.fn(), updateItem: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn() }));
vi.mock('../api/boms.service', () => ({ getBomByStyleNo: vi.fn(), updateBomItem: vi.fn(), addBomLabelSet: vi.fn() }));
vi.mock('../api/mapping.service', () => ({ parseMappingFile: vi.fn(), checkStyleExists: vi.fn(), commitMapping: vi.fn() }));

import { ItemsManager } from './ItemsManager';

describe('ItemsManager 납기일 라벨 (PR-167)', () => {
  it('검색 영역에 "납기일(From/To)"로 표시되고, 예전 "목표출고일" 라벨은 더 이상 없다', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toContain('납기일(From)');
    expect(html).toContain('납기일(To)');
    expect(html).not.toContain('목표출고일');
  });
});
