import { describe, it, expect } from 'vitest';
import { buildSingleOrderUrl, buildBulkOrderUrl, parseOrderPrefillFromSearch } from './bomBulkOrderNav';

// PR-238: 새 탭 URL 생성/해석 — 업무 데이터(자재명 등)는 쿼리에 없고 식별자만 있다.
describe('bomBulkOrderNav (PR-238)', () => {
  it('단일 발주 URL은 view/prefillItemId/prefillStyleNo만 담는다', () => {
    const url = buildSingleOrderUrl('/', 42, 'MB00AAA000Z');
    expect(url).toBe('/?view=purchaseOrders&prefillItemId=42&prefillStyleNo=MB00AAA000Z');
  });

  it('단일 발주 URL — styleNo가 없으면 그 파라미터를 뺀다', () => {
    const url = buildSingleOrderUrl('/', 42);
    expect(url).toBe('/?view=purchaseOrders&prefillItemId=42');
  });

  it('일괄 발주 URL은 bulkStyleNo/bulkBomItemIds만 담는다(자재명 등 없음)', () => {
    const url = buildBulkOrderUrl('/', 'MB00AAA000Z', [501, 502, 503]);
    expect(url).toBe('/?view=purchaseOrders&bulkStyleNo=MB00AAA000Z&bulkBomItemIds=501%2C502%2C503');
  });

  it('쿼리가 없으면(view 파라미터 없음) null — 기존 흐름 그대로', () => {
    expect(parseOrderPrefillFromSearch('')).toBeNull();
    expect(parseOrderPrefillFromSearch('?foo=bar')).toBeNull();
  });

  it('view=purchaseOrders만 있고 나머지가 없으면 null', () => {
    expect(parseOrderPrefillFromSearch('?view=purchaseOrders')).toBeNull();
  });

  it('단일 발주 쿼리를 해석한다', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&prefillItemId=42&prefillStyleNo=MB00AAA000Z');
    expect(result).toEqual({ kind: 'single', itemId: 42, styleNo: 'MB00AAA000Z' });
  });

  it('단일 발주 쿼리 — styleNo 없으면 null로 돌아온다', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&prefillItemId=42');
    expect(result).toEqual({ kind: 'single', itemId: 42, styleNo: null });
  });

  it('일괄 발주 쿼리를 해석한다', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&bulkStyleNo=MB00AAA000Z&bulkBomItemIds=501,502,503');
    expect(result).toEqual({ kind: 'bulk', styleNo: 'MB00AAA000Z', bomItemIds: [501, 502, 503] });
  });

  it('일괄 발주 쿼리 — id 목록이 비정상(비숫자 포함)이면 그 항목만 제외한다', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&bulkStyleNo=MB00AAA000Z&bulkBomItemIds=501,abc,503');
    expect(result).toEqual({ kind: 'bulk', styleNo: 'MB00AAA000Z', bomItemIds: [501, 503] });
  });

  it('일괄 발주 쿼리 — id가 전부 비정상이면 null', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&bulkStyleNo=MB00AAA000Z&bulkBomItemIds=abc,def');
    expect(result).toBeNull();
  });

  it('단일 발주 쿼리 — itemId가 숫자가 아니면 null', () => {
    const result = parseOrderPrefillFromSearch('?view=purchaseOrders&prefillItemId=abc');
    expect(result).toBeNull();
  });
});
