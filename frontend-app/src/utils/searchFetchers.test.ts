import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/buyers.service', () => ({ getBuyers: vi.fn() }));
vi.mock('../api/suppliers.service', () => ({ getSuppliers: vi.fn() }));
vi.mock('../api/items.service', () => ({ getItems: vi.fn() }));
vi.mock('../api/purchaseOrders.service', () => ({ getPurchaseOrders: vi.fn() }));
vi.mock('../api/productionContracts.service', () => ({ getProductionContracts: vi.fn() }));
vi.mock('../api/workOrders.service', () => ({ getWorkOrders: vi.fn() }));

import { getBuyers } from '../api/buyers.service';
import { getSuppliers } from '../api/suppliers.service';
import { getItems } from '../api/items.service';
import { getPurchaseOrders } from '../api/purchaseOrders.service';
import { getProductionContracts } from '../api/productionContracts.service';
import { getWorkOrders } from '../api/workOrders.service';
import {
  SEARCH_LIMIT,
  masterLabel,
  productionContractLabel,
  purchaseOrderLabel,
  searchBuyers,
  searchItems,
  searchProductionContracts,
  searchPurchaseOrders,
  searchSuppliers,
  searchWorkOrders,
  toList,
} from './searchFetchers';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe('searchFetchers — 검색 선택 서버 조회 (PR-127)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('toList — 도메인마다 다른 응답 형태를 배열로 정규화', () => {
    it('배열 / {items} / {data} / 그 외(null, 이상한 값)', () => {
      expect(toList([1, 2])).toEqual([1, 2]);
      expect(toList({ items: [3], meta: {} })).toEqual([3]);
      expect(toList({ data: [4] })).toEqual([4]);
      expect(toList(null)).toEqual([]);
      expect(toList(undefined)).toEqual([]);
      expect(toList({ items: 'x' })).toEqual([]);
    });
  });

  describe('작업지시 / 발주 / 생산계약 — 서버 keyword + limit(100건 캡 없이 검색으로 찾는다)', () => {
    it('searchWorkOrders: keyword와 1페이지 SEARCH_LIMIT건을 요청하고 {items,meta} 응답에서 목록을 꺼낸다', async () => {
      mocked(getWorkOrders).mockResolvedValue({ items: [{ id: 7 }], meta: { total: 1 } });
      expect(await searchWorkOrders(' mb6 ')).toEqual([{ id: 7 }]);
      expect(getWorkOrders).toHaveBeenCalledWith({ keyword: 'mb6', page: 1, limit: SEARCH_LIMIT });
    });

    it('searchPurchaseOrders: keyword와 limit을 서버에 보낸다(전량 조회가 아니다)', async () => {
      mocked(getPurchaseOrders).mockResolvedValue([{ id: 3 }]);
      expect(await searchPurchaseOrders('denim')).toEqual([{ id: 3 }]);
      expect(getPurchaseOrders).toHaveBeenCalledWith({ keyword: 'denim', limit: SEARCH_LIMIT });
    });

    it('searchProductionContracts: keyword와 limit을 서버에 보낸다', async () => {
      mocked(getProductionContracts).mockResolvedValue([{ id: 5 }]);
      expect(await searchProductionContracts('alpha')).toEqual([{ id: 5 }]);
      expect(getProductionContracts).toHaveBeenCalledWith({ keyword: 'alpha', limit: SEARCH_LIMIT });
    });

    it('검색어가 비었거나 공백이면 keyword를 보내지 않고 최신 SEARCH_LIMIT건만 요청한다(팝업을 처음 열 때)', async () => {
      mocked(getPurchaseOrders).mockResolvedValue([]);
      await searchPurchaseOrders('');
      await searchPurchaseOrders('   ');
      expect(getPurchaseOrders).toHaveBeenNthCalledWith(1, { keyword: undefined, limit: SEARCH_LIMIT });
      expect(getPurchaseOrders).toHaveBeenNthCalledWith(2, { keyword: undefined, limit: SEARCH_LIMIT });
    });

    it('결과가 없으면 빈 배열', async () => {
      mocked(getWorkOrders).mockResolvedValue({ items: [], meta: { total: 0 } });
      expect(await searchWorkOrders('zzz')).toEqual([]);
    });
  });

  describe('품목', () => {
    it('searchItems: 유형 제한 없이 keyword + limit', async () => {
      mocked(getItems).mockResolvedValue({ items: [{ id: 1 }], meta: {} });
      expect(await searchItems('원단')).toEqual([{ id: 1 }]);
      expect(getItems).toHaveBeenCalledWith({ keyword: '원단', limit: SEARCH_LIMIT });
    });
  });

  describe('공급업체 / 거래처 — keyword만 지원, 화면에는 SEARCH_LIMIT건까지', () => {
    it('keyword가 있으면 { keyword }로 호출하고 없으면 인자 없이 호출한다', async () => {
      mocked(getBuyers).mockResolvedValue([{ id: 1 }]);
      mocked(getSuppliers).mockResolvedValue([{ id: 2 }]);
      await searchBuyers(' myung ');
      await searchBuyers('');
      await searchSuppliers('lambda');
      await searchSuppliers('  ');
      expect(getBuyers).toHaveBeenNthCalledWith(1, { keyword: 'myung' });
      expect(getBuyers).toHaveBeenNthCalledWith(2, undefined);
      expect(getSuppliers).toHaveBeenNthCalledWith(1, { keyword: 'lambda' });
      expect(getSuppliers).toHaveBeenNthCalledWith(2, undefined);
    });

    it('서버가 전량을 돌려줘도 SEARCH_LIMIT건까지만 보여준다', async () => {
      const many = Array.from({ length: 55 }, (_, i) => ({ id: i + 1 }));
      mocked(getBuyers).mockResolvedValue(many);
      mocked(getSuppliers).mockResolvedValue(many);
      expect(await searchBuyers('')).toHaveLength(SEARCH_LIMIT);
      expect(await searchSuppliers('')).toHaveLength(SEARCH_LIMIT);
    });
  });

  describe('표시 문구 — 기존 <select>의 <option>과 같다', () => {
    it('거래처/공급업체: "이름 (코드)"', () => {
      expect(masterLabel({ name: 'Myungbo Trading', code: 'TY-MB-260001' })).toBe('Myungbo Trading (TY-MB-260001)');
    });

    it('발주: "발주 #ID (품목명)", 품목 정보가 없으면 #품목ID', () => {
      expect(purchaseOrderLabel({ id: 12, itemId: 3, item: { id: 3, code: 'A', name: '데님 원단' } })).toBe('발주 #12 (데님 원단)');
      expect(purchaseOrderLabel({ id: 12, itemId: 3 })).toBe('발주 #12 (#3)');
    });

    it('생산계약: "스타일번호 (제조사명)", 제조사 정보가 없으면 #제조사ID', () => {
      expect(productionContractLabel({ styleNo: 'ST-1', manufacturerId: 9, manufacturer: { id: 9, code: 'C', name: 'Omega' } })).toBe('ST-1 (Omega)');
      expect(productionContractLabel({ styleNo: 'ST-1', manufacturerId: 9 })).toBe('ST-1 (#9)');
    });
  });
});
