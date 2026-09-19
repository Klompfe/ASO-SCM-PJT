import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from './fetchAllPages';

// 250건짜리 데이터를 100건 단위로 자르는 가짜 서버.
const server = (n: number, pageSize = 100) => {
  const all = Array.from({ length: n }, (_, i) => i + 1);
  return vi.fn(async (page: number) => ({ items: all.slice((page - 1) * pageSize, page * pageSize), total: n }));
};

describe('fetchAllPages (PR-121)', () => {
  it('여러 페이지에 걸친 응답을 순서대로 정확히 합친다(250건 → 3번 호출)', async () => {
    const fetchPage = server(250);
    const { items, total } = await fetchAllPages<number>(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(items).toHaveLength(250);
    expect(items[0]).toBe(1);
    expect(items[99]).toBe(100);
    expect(items[100]).toBe(101);
    expect(items[249]).toBe(250);
    expect(total).toBe(250);
    expect(new Set(items).size).toBe(250); // 중복/누락 없음
  });

  it('정확히 한 페이지 분량(100건)이면 한 번만 호출한다', async () => {
    const fetchPage = server(100);
    const { items } = await fetchAllPages<number>(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(100);
  });

  it('페이지 경계(101건)에서도 마지막 1건까지 가져온다', async () => {
    const { items } = await fetchAllPages<number>(server(101));
    expect(items).toHaveLength(101);
    expect(items[100]).toBe(101);
  });

  it('결과가 없으면 빈 배열, total은 서버가 준 값', async () => {
    const fetchPage = server(0);
    expect(await fetchAllPages<number>(fetchPage)).toEqual({ items: [], total: 0 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('total이 문자열이어도(pg count) 처리한다', async () => {
    const fetchPage = vi.fn(async (page: number) => ({ items: page === 1 ? [1, 2] : [3], total: '3' }));
    const { items, total } = await fetchAllPages<number>(fetchPage);
    expect(items).toEqual([1, 2, 3]);
    expect(total).toBe(3);
  });

  it('서버가 total을 실제보다 크게 주고 빈 페이지가 오면 멈춘다(무한 반복 방지)', async () => {
    const fetchPage = vi.fn(async (page: number) => ({ items: page === 1 ? [1, 2, 3] : [], total: 999 }));
    const { items } = await fetchAllPages<number>(fetchPage);
    expect(items).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('total이 없는 응답은 첫 페이지만 신뢰하고, maxPages를 넘기지 않는다', async () => {
    const noTotal = vi.fn(async () => ({ items: [1, 2] }));
    expect((await fetchAllPages<number>(noTotal)).items).toEqual([1, 2]);
    expect(noTotal).toHaveBeenCalledTimes(1);

    const endless = vi.fn(async () => ({ items: [1], total: 1_000_000 }));
    const { items } = await fetchAllPages<number>(endless, 5);
    expect(endless).toHaveBeenCalledTimes(5);
    expect(items).toHaveLength(5);
  });

  it('페이지 호출이 실패하면 그대로 에러를 던진다(부분 결과를 조용히 돌려주지 않는다)', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('boom');
      return { items: [1], total: 5 };
    });
    await expect(fetchAllPages<number>(fetchPage)).rejects.toThrow('boom');
  });
});
