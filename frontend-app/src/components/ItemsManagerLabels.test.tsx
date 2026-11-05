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

// PR-224: 스타일 번호 자동완성 목록(SearchSelectField 재사용) — 상호작용(후보 표시,
// 선택 시 즉시 조회)은 results류와 마찬가지로 내부 useState라 이 하네스(jsdom 없음,
// renderToStaticMarkup)로 직접 검증할 수 없다(PR-221/222/223과 동일 사유) — 순수 필터
// 로직은 bomLookupFilter.test.ts로 검증했다. 여기서는 정적 렌더 자체가 깨지지 않는지와
// 직접 입력 입력칸이 그대로 있는지만 확인한다.
describe('ItemsManager 스타일 자동완성 UI (PR-224)', () => {
  it('"스타일 번호(직접 입력)"과 "또는 목록에서 선택"이 함께 보인다(기존 직접 입력 유지)', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toContain('스타일 번호(직접 입력)');
    expect(html).toContain('또는 목록에서 선택');
  });

  it('품목 마스터 관리는 기본 접힘 상태다(<details>에 open 속성 없음)', () => {
    const html = renderToStaticMarkup(createElement(ItemsManager, {}));
    expect(html).toMatch(/<details[^>]*class="[^"]*"[^>]*>/);
    expect(html).not.toMatch(/<details[^>]* open[^>]*>/);
  });
});
