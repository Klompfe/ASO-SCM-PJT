import { describe, expect, it } from 'vitest';
import { EMPTY_PAGE_META, clampPage, getPaginationView, pageToRecoverTo, toPageMeta } from './pagination';

describe('pagination 유틸 (PR-128)', () => {
  describe('getPaginationView — 경계값', () => {
    it('첫 페이지: 이전 비활성, 다음 활성', () => {
      const v = getPaginationView({ page: 1, totalPages: 3, total: 25 });
      expect(v).toMatchObject({ canPrev: false, canNext: true, label: '1 / 3', summary: '총 25건' });
    });
    it('중간 페이지: 둘 다 활성', () => {
      expect(getPaginationView({ page: 2, totalPages: 3 })).toMatchObject({ canPrev: true, canNext: true, label: '2 / 3', summary: '' });
    });
    it('마지막 페이지: 다음 비활성', () => {
      expect(getPaginationView({ page: 3, totalPages: 3, total: 25 })).toMatchObject({ canPrev: true, canNext: false, label: '3 / 3' });
    });
    it('데이터 0건: 1 / 1, 두 버튼 모두 비활성, 총 0건', () => {
      expect(getPaginationView({ page: 1, totalPages: 0, total: 0 })).toMatchObject({ canPrev: false, canNext: false, label: '1 / 1', summary: '총 0건' });
    });
    it('한 페이지뿐이면 둘 다 비활성', () => {
      expect(getPaginationView({ page: 1, totalPages: 1, total: 7 })).toMatchObject({ canPrev: false, canNext: false });
    });
    it('범위를 벗어난 page는 보정된다', () => {
      expect(getPaginationView({ page: 9, totalPages: 3 }).page).toBe(3);
      expect(getPaginationView({ page: 0, totalPages: 3 }).page).toBe(1);
    });
    it('천 단위 구분', () => {
      expect(getPaginationView({ page: 1, totalPages: 200, total: 1234 }).summary).toBe('총 1,234건');
    });
  });

  describe('clampPage', () => {
    it('1 미만/NaN은 1, 초과는 마지막 페이지, 전체 0이면 1', () => {
      expect(clampPage(0, 5)).toBe(1);
      expect(clampPage(NaN, 5)).toBe(1);
      expect(clampPage(6, 5)).toBe(5);
      expect(clampPage(3, 0)).toBe(1);
      expect(clampPage(2.7, 5)).toBe(2);
    });
  });

  describe('toPageMeta', () => {
    it('{items, meta} 응답의 meta를 그대로 쓴다', () => {
      const meta = { total: 25, page: 2, limit: 10, totalPages: 3, hasNextPage: true, hasPreviousPage: true };
      expect(toPageMeta({ items: [], meta }, { page: 1, limit: 10 })).toEqual(meta);
    });
    it('meta에 hasNext/hasPrevious가 없으면 page/totalPages로 계산한다', () => {
      expect(toPageMeta({ meta: { total: 25, page: 3, limit: 10, totalPages: 3 } }, { page: 1, limit: 10 })).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
    });
    it('meta가 없는 배열 응답은 한 페이지에 전부로 본다', () => {
      expect(toPageMeta([1, 2, 3], { page: 1, limit: 10 })).toMatchObject({ total: 3, totalPages: 1, hasNextPage: false });
      expect(toPageMeta([], { page: 1, limit: 10 })).toMatchObject({ total: 0, totalPages: 0 });
    });
    it('이상한 응답은 0건으로 본다', () => {
      expect(toPageMeta(null, { page: 1, limit: 10 })).toMatchObject({ total: 0, totalPages: 0 });
    });
  });

  describe('pageToRecoverTo — 마지막 페이지를 비웠을 때', () => {
    it('요청 페이지가 전체 페이지를 넘으면 마지막 페이지로, 아니면 null', () => {
      expect(pageToRecoverTo({ ...EMPTY_PAGE_META, totalPages: 2 }, 3)).toBe(2);
      expect(pageToRecoverTo({ ...EMPTY_PAGE_META, totalPages: 2 }, 2)).toBeNull();
    });
    it('전체가 0건이면 되돌리지 않는다(무한 재조회 방지)', () => {
      expect(pageToRecoverTo({ ...EMPTY_PAGE_META, totalPages: 0 }, 3)).toBeNull();
    });
  });
});
