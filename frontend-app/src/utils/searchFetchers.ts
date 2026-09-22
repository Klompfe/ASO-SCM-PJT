import { getBuyers, type Buyer } from '../api/buyers.service';
import { getSuppliers, type Supplier } from '../api/suppliers.service';
import { getItems, type Item } from '../api/items.service';
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getProductionContracts, type ProductionContract } from '../api/productionContracts.service';
import { getWorkOrders, type WorkOrder } from '../api/workOrders.service';
import { getMasterStyles } from '../api/styles.service';

// PR-127: SearchSelectField(PR-126)에 넘기는 서버 검색 함수 모음. 화면마다 <select>에 목록을 통째로(또는 최초 100건만) 불러오던 것을
// "검색어마다 서버에 조회, 한 번에 SEARCH_LIMIT건"으로 바꿔 데이터가 몇 건이든 원하는 항목을 검색으로 고를 수 있게 한다.
export const SEARCH_LIMIT = 20;

// 응답 형태가 도메인마다 다르다(배열 / {items,meta} / {data}). 모두 배열로 정규화한다.
export function toList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const wrapped = res as { items?: unknown; data?: unknown } | null | undefined;
  if (Array.isArray(wrapped?.items)) return wrapped.items as T[];
  if (Array.isArray(wrapped?.data)) return wrapped.data as T[];
  return [];
}

const kw = (keyword: string) => keyword.trim() || undefined;

// 공급업체/거래처는 서버에 페이지네이션이 없다(데이터 규모가 작아 keyword만 지원) — 화면에는 SEARCH_LIMIT건까지만 보여준다.
export const searchBuyers = async (keyword: string): Promise<Buyer[]> =>
  toList<Buyer>(await getBuyers(kw(keyword) ? { keyword: kw(keyword) } : undefined)).slice(0, SEARCH_LIMIT);

export const searchSuppliers = async (keyword: string): Promise<Supplier[]> =>
  toList<Supplier>(await getSuppliers(kw(keyword) ? { keyword: kw(keyword) } : undefined)).slice(0, SEARCH_LIMIT);

// 품목은 원자재/완제품 구분 없이 전체에서 검색(작업지시 등록의 품목 select가 원래 전체 품목을 보여줬다).
export const searchItems = async (keyword: string): Promise<Item[]> =>
  toList<Item>(await getItems({ keyword: kw(keyword), limit: SEARCH_LIMIT }));

// 발주/생산계약/작업지시는 서버 keyword + limit(페이지네이션)를 쓴다 — 최신 N건에 안 드는 오래된 건도 검색으로 찾아진다.
export const searchPurchaseOrders = async (keyword: string): Promise<PurchaseOrder[]> =>
  toList<PurchaseOrder>(await getPurchaseOrders({ keyword: kw(keyword), limit: SEARCH_LIMIT }));

export const searchProductionContracts = async (keyword: string): Promise<ProductionContract[]> =>
  toList<ProductionContract>(await getProductionContracts({ keyword: kw(keyword), limit: SEARCH_LIMIT }));

export const searchWorkOrders = async (keyword: string): Promise<WorkOrder[]> =>
  toList<WorkOrder>(await getWorkOrders({ keyword: kw(keyword), page: 1, limit: SEARCH_LIMIT }));

// 표시 방식은 기존 <select>의 <option> 문구를 그대로 쓴다(사용자가 무엇을 고르는지 달라 보이지 않게).
export const masterLabel = (m: { name: string; code: string }) => `${m.name} (${m.code})`;
export const purchaseOrderLabel = (po: Pick<PurchaseOrder, 'id' | 'itemId' | 'item'>) =>
  `발주 #${po.id} (${po.item?.name ?? `#${po.itemId}`})`;
export const productionContractLabel = (pc: Pick<ProductionContract, 'styleNo' | 'manufacturerId' | 'manufacturer'>) =>
  `${pc.styleNo} (${pc.manufacturer?.name ?? `#${pc.manufacturerId}`})`;

// PR-129: 스타일번호 검색 선택(BOM 소요명세서/발주 화면의 "스타일번호로 필요 자재 찾기"와 같은 서버 검색). 한 번에 SEARCH_LIMIT건.
export interface StyleOption { styleNo: string; overview?: { styleName?: string | null; totalQty?: number | string | null } | null }
export const searchMasterStyles = async (keyword: string): Promise<StyleOption[]> =>
  toList<StyleOption>(await getMasterStyles(kw(keyword) ? { styleNo: kw(keyword) } : undefined)).slice(0, SEARCH_LIMIT);
