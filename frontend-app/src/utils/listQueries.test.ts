import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/workOrders.service', () => ({ getWorkOrders: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn() }));

import { getWorkOrders } from '../api/workOrders.service';
import { getItems } from '../api/items.service';
import { buildItemsQuery, buildWorkOrdersQuery, fetchItemPage, fetchWorkOrderPage, hasAnySearchCondition } from './listQueries';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const meta = (page: number) => ({ total: 25, page, limit: 10, totalPages: 3, hasNextPage: page < 3, hasPreviousPage: page > 1 });

describe('listQueries — 목록 조회 파라미터 / 페이지 재조회 (PR-128)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('buildWorkOrdersQuery', () => {
    it('page와 limit 10을 항상 보내고, 빈 상태/검색어는 뺀다(All → status 없음)', () => {
      expect(buildWorkOrdersQuery({ page: 1, status: '', keyword: '  ' })).toEqual({
        page: 1, limit: 10, status: undefined, keyword: undefined, itemName: undefined, itemCode: undefined, styleNo: undefined,
      });
    });
    it('상태와 검색어(공백 제거)를 그대로 싣는다', () => {
      expect(buildWorkOrdersQuery({ page: 3, status: 'COMPLETED', keyword: ' 셔츠 ' })).toEqual({
        page: 3, limit: 10, status: 'COMPLETED', keyword: '셔츠', itemName: undefined, itemCode: undefined, styleNo: undefined,
      });
    });
    // PR-139: 항목별 개별 검색(품목명/품목코드/스타일번호) — 채운 것만 담기고 공백은 제거된다.
    it('itemName/itemCode/styleNo를 각각(공백 제거해) 싣는다', () => {
      expect(buildWorkOrdersQuery({ page: 1, itemName: ' 셔츠 ', itemCode: 'MB6', styleNo: ' MB62SLM103Z ' })).toEqual({
        page: 1, limit: 10, status: undefined, keyword: undefined, itemName: '셔츠', itemCode: 'MB6', styleNo: 'MB62SLM103Z',
      });
    });
  });

  // PR-139: 상태 필터 + 텍스트 검색 화면 공통 — 빈 조건 검색 경고에 쓰는 판정 함수.
  describe('hasAnySearchCondition', () => {
    it('모든 값이 비어있거나 공백뿐이면 false', () => {
      expect(hasAnySearchCondition()).toBe(false);
      expect(hasAnySearchCondition(undefined, '', '   ', null)).toBe(false);
    });
    it('하나라도 값이 있으면 true(상태만 선택해도 유효한 조건)', () => {
      expect(hasAnySearchCondition('COMPLETED', '', '')).toBe(true);
      expect(hasAnySearchCondition(undefined, ' 셔츠 ', undefined)).toBe(true);
    });
  });

  describe('buildItemsQuery', () => {
    it('type/keyword 없이도 page/limit을 보낸다', () => {
      expect(buildItemsQuery({ page: 2 })).toEqual({ page: 2, limit: 10, type: undefined, keyword: undefined });
    });
    it('type/keyword를 싣는다', () => {
      expect(buildItemsQuery({ page: 1, type: 'RAW_MATERIAL', keyword: 'A' })).toEqual({ page: 1, limit: 10, type: 'RAW_MATERIAL', keyword: 'A' });
    });
  });

  describe('fetchWorkOrderPage — 페이지 이동 시 올바른 page로 재조회', () => {
    it('page를 바꿔 다시 부르면 그 page가 API 파라미터로 나가고 meta가 돌아온다', async () => {
      mocked(getWorkOrders).mockResolvedValueOnce({ items: [{ id: 1 }], meta: meta(1) }).mockResolvedValueOnce({ items: [{ id: 11 }], meta: meta(2) });
      const p1 = await fetchWorkOrderPage({ page: 1, status: 'PENDING' });
      const p2 = await fetchWorkOrderPage({ page: 2, status: 'PENDING' });
      expect(getWorkOrders).toHaveBeenNthCalledWith(1, { page: 1, limit: 10, status: 'PENDING', keyword: undefined, itemName: undefined, itemCode: undefined, styleNo: undefined });
      expect(getWorkOrders).toHaveBeenNthCalledWith(2, { page: 2, limit: 10, status: 'PENDING', keyword: undefined, itemName: undefined, itemCode: undefined, styleNo: undefined });
      expect(p1.items).toEqual([{ id: 1 }]);
      expect(p2).toEqual({ items: [{ id: 11 }], meta: meta(2) });
    });

    it('결과 0건이면 빈 목록과 totalPages 0', async () => {
      mocked(getWorkOrders).mockResolvedValue({ items: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
      const r = await fetchWorkOrderPage({ page: 1, keyword: 'zzz' });
      expect(r.items).toEqual([]);
      expect(r.meta.totalPages).toBe(0);
    });
  });

  describe('fetchItemPage', () => {
    it('검색 조건을 유지한 채 page만 바뀌어 재조회된다', async () => {
      mocked(getItems).mockResolvedValue({ items: [{ id: 5 }], meta: meta(3) });
      const r = await fetchItemPage({ page: 3, type: 'RAW_MATERIAL', keyword: '원단' });
      expect(getItems).toHaveBeenCalledWith({ page: 3, limit: 10, type: 'RAW_MATERIAL', keyword: '원단' });
      expect(r.meta.page).toBe(3);
      expect(r.meta.hasNextPage).toBe(false);
    });

    it('배열 응답(meta 없음)도 한 페이지로 다룬다', async () => {
      mocked(getItems).mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const r = await fetchItemPage({ page: 1 });
      expect(r.items).toHaveLength(2);
      expect(r.meta).toMatchObject({ total: 2, totalPages: 1 });
    });
  });
});
