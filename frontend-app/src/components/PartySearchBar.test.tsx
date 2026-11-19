import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PartySearchBar, PartyNoResult, DuplicateNameHint } from './PartySearchBar';
import { NO_RESULT_MESSAGE, DUPLICATE_NAME_MESSAGE } from '../utils/partySearch';

vi.mock('../api/buyers.service', () => ({
  getBuyers: vi.fn(() => new Promise(() => {})), createBuyer: vi.fn(), updateBuyer: vi.fn(), deleteBuyer: vi.fn(),
}));
vi.mock('../api/suppliers.service', () => ({
  getSuppliers: vi.fn(() => new Promise(() => {})), createSupplier: vi.fn(), updateSupplier: vi.fn(), deleteSupplier: vi.fn(),
}));
vi.mock('../api/materialCategories.service', () => ({ getMaterialCategories: vi.fn(() => new Promise(() => {})) }));
vi.mock('./CategoryChips', () => ({ CategoryChips: () => null }));

const { BuyersManager } = await import('./BuyersManager');
const { SuppliersManager } = await import('./SuppliersManager');

// PR-245: jsdom 이 없어 정적 렌더로 표시 규칙만 확인한다(입력하는 대로 좁혀지는 동작은 순수 함수 테스트 + 수동 확인).
describe('PartySearchBar / PartyNoResult / DuplicateNameHint (PR-245)', () => {
  it('검색어가 없으면 "전체 N건", 있으면 "전체 N건 중 M건"', () => {
    const base = { onChange: vi.fn(), ariaLabel: '검색' };
    expect(renderToStaticMarkup(createElement(PartySearchBar, { ...base, query: '', total: 10, shown: 10 }))).toContain('전체 10건<');
    expect(renderToStaticMarkup(createElement(PartySearchBar, { ...base, query: 'a', total: 10, shown: 3 }))).toContain('전체 10건 중 3건');
  });

  it('초기화 버튼은 검색어가 없으면 비활성', () => {
    const html = renderToStaticMarkup(createElement(PartySearchBar, { onChange: vi.fn(), ariaLabel: '검색', query: '', total: 1, shown: 1 }));
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('0건 안내는 검색어가 있고 전체는 있는데 결과만 0건일 때만', () => {
    const show = (query: string, total: number, shown: number) => renderToStaticMarkup(createElement(PartyNoResult, { query, total, shown, onReset: vi.fn() }));
    expect(show('zzz', 5, 0)).toContain(NO_RESULT_MESSAGE);
    expect(show('', 5, 0)).toBe('');
    expect(show('zzz', 0, 0)).toBe('');
    expect(show('zzz', 5, 2)).toBe('');
  });

  it('중복 이름 안내', () => {
    expect(renderToStaticMarkup(createElement(DuplicateNameHint, { show: true }))).toContain(DUPLICATE_NAME_MESSAGE);
    expect(renderToStaticMarkup(createElement(DuplicateNameHint, { show: false }))).toBe('');
  });
});

describe('관리 화면 회귀 (PR-245)', () => {
  it('고객사 관리: 검색 입력칸·건수가 보이고 등록 폼·표 머리글은 그대로', () => {
    const html = renderToStaticMarkup(createElement(BuyersManager));
    expect(html).toContain('aria-label="고객사 검색"');
    expect(html).toContain('전체 0건');
    expect(html).toContain('고객사명');
    expect(html).toContain('>등록<');
    expect(html).not.toContain(NO_RESULT_MESSAGE);
  });

  it('공급업체 관리: 검색칸과 기존 품목군 필터가 함께 있다', () => {
    const html = renderToStaticMarkup(createElement(SuppliersManager));
    expect(html).toContain('aria-label="공급업체 검색"');
    expect(html).toContain('품목군 필터');
    expect(html).toContain('전체 0건');
    expect(html).toContain('>등록<');
  });
});
