import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { orderTypeLabel, orderTypeNote, canCreateWithOrderType, type PurchaseOrderType } from '../utils/purchaseOrderType';
import toast from 'react-hot-toast';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  getOrderTypeSuggestion,
  updatePurchaseOrderStatus,
  getMaterialProductionContext,
  type CreatePurchaseOrder,
  type PurchaseOrder,
  getPurchaseOrderDocument,
  getCombinedPurchaseOrderDocuments,
  type PurchaseOrderLine,
} from '../api/purchaseOrders.service';
import { downloadBase64File } from '../utils/fileDownload';
import { getSuppliers } from '../api/suppliers.service';
import { getItems, getItem, classifyThreadTape } from '../api/items.service';
import { getMasterStyles } from '../api/styles.service';
import { getStyleRequirements } from '../api/workOrders.service';
import { getBrandPriceRules } from '../api/brandPriceRules.service';
import { getMaterialPackagingUnitRules, type MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
import { getErrorMessage } from '../utils/errorMessage';
import { SearchSelectField } from './SearchSelectField';
import { StyleShortagePanel } from './StyleShortagePanel';
import {
  pickLatestOrderDefaults, resolveAutofill, isUnitPriceRequired,
  sumPurchaseOrderLines, suggestStyleLinkedQuantity, suggestUnlinkedQuantity, trackBadgeLabel, isQuantityFilled,
  resolveStyleLinkDisplay, type SupplierRef,
} from '../utils/purchaseOrderForm';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';
import { looksLikeThreadOrTape, suggestThreadTapeByKeyword, ceilWithEpsilon } from '../utils/materialRequirementDisplay';
import { PackingReceiptsModal } from './PackingReceiptsModal';
import { PurchaseOrderEditModal } from './PurchaseOrderEditModal';
import { ShipmentsManager } from './ShipmentsManager';
import { SupplierQuickCreateModal } from './SupplierQuickCreateModal';
import { categoryFilterState, supplierSearchCategoryId } from '../utils/materialCategories';
import { PriceReferenceBlock, type PriceReferenceValue } from './PriceReferenceBlock';
import { getBomByStyleNo, type BomItemRow } from '../api/boms.service';
import {
  findExactSupplierMatch,
  pickSupplierPrefill,
  pickPricePrefill,
  SUPPLIER_SOURCE_LABEL,
  PRICE_SOURCE_LABEL,
  type SupplierPrefillSource,
  type PricePrefillSource,
} from '../utils/orderPrefill';

interface ItemRef { id: number; name: string; code: string; categoryId?: number | null; unit?: string | null }
interface StyleOption { styleNo: string; overview?: { styleName?: string | null } | null }

const emptyForm: CreatePurchaseOrder = { supplierId: 0, itemId: 0, unitPrice: 0 };
const emptyPriceRef: PriceReferenceValue = { usd: null, source: null, note: null };

// PR-240: BOM 행 공급사/품목 마스터 vendor는 자유 텍스트라 실제 공급업체인지 이름으로
// 확인해야 한다 — 새 조회를 만들지 않고 기존 공급업체 검색(getSuppliers keyword)을
// 재사용한다. 정확히 일치할 때만 매칭한다(findExactSupplierMatch, 추측 매칭 금지).
async function resolveSupplierByName(name: string | null | undefined): Promise<SupplierRef | null> {
  if (!name || !name.trim() || name.trim() === 'N/A' || name.trim() === '미정') return null;
  try {
    const res = await getSuppliers({ keyword: name.trim() });
    const list: SupplierRef[] = Array.isArray(res) ? res : (res?.data ?? []);
    return findExactSupplierMatch(name, list);
  } catch {
    return null;
  }
}

interface PurchaseOrdersManagerProps {
  prefillItemId?: number | null;
  onPrefillConsumed?: () => void;
  // PR-196: 발주·입고·출고 현황에서 "발주하기"/"발주 보기"로 넘어온 경우 — 그 스타일의
  // 부족분 표를 바로 열고(기존 styleSearch 경로 재사용) 발주 목록도 그 스타일로 필터한다.
  prefillStyleNo?: string | null;
  onStylePrefillConsumed?: () => void;
  // PR-230: 자재·BOM 조회의 "발주하기"처럼 특정 품목과 함께 그 스타일도 아는 진입 —
  // prefillStyleNo(발주 목록도 그 스타일로 필터)와 달리 [B]만 연결하고 목록 필터는
  // 건드리지 않는다. prefillItemId와 같은 effect에서 함께 소비된다.
  prefillItemStyleNo?: string | null;
}

export const PurchaseOrdersManager: React.FC<PurchaseOrdersManagerProps> = ({ prefillItemId, onPrefillConsumed, prefillStyleNo, onStylePrefillConsumed, prefillItemStyleNo }) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPo, setNewPo] = useState<CreatePurchaseOrder>(emptyForm);
  // PR-185 B: 수량은 더 이상 기본값 1로 시작하지 않는다 — 빈 문자열로 시작해 필수로 검증한다.
  const [quantityInput, setQuantityInput] = useState('');
  // PR-176: 색상/사이즈별 상세 줄. 비어 있으면 기존처럼 총수량을 직접 입력한다(하위호환).
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([]);
  // PR-126: 공급업체/품목은 <select>(최초 100개만 불러와 그 밖의 품목은 선택 불가)가 아니라 서버 검색 선택이다.
  const [supplier, setSupplier] = useState<SupplierRef | null>(null);
  const [item, setItem] = useState<ItemRef | null>(null);
  // PR-185 A: 발주 폼의 스타일 연결(선택) — 고르면 그 스타일 BOM의 자재만 고를 수 있다("스타일 연결 트랙").
  const [styleSearch, setStyleSearch] = useState<StyleOption | null>(null);
  // PR-230: 사용자가 "연결 해제"(또는 필드의 X)를 눌러 명시적으로 끊었는지 — 끊은 뒤에는
  // "스타일 미연결 — 스타일별 집계에 포함되지 않습니다" 안내를 보여준다. 다시 스타일을
  // 고르면(수동/자동 모두) false로 돌아간다.
  const [styleLinkExplicitlyCleared, setStyleLinkExplicitlyCleared] = useState(false);
  const [styleMaterialRows, setStyleMaterialRows] = useState<MaterialRequirementRow[]>([]);
  const [styleRowsLoading, setStyleRowsLoading] = useState(false);
  // PR-185 C: 스타일 미연결 트랙에서 사람이 고르는 브랜드(기본 "선택 안 함" = 미도 단가표만).
  const [brandOverride, setBrandOverride] = useState('');
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [priceRef, setPriceRef] = useState<PriceReferenceValue>(emptyPriceRef);
  // PR-187: 단가표 참고가 서버에서 판단한 콘/롤 단위 — 스타일 미연결 트랙처럼 item.unit이
  // 'EA'로 남아 있어도 "수량 (콘)" 라벨을 보여줄 수 있게(수량을 자동으로 채우지는 않음).
  const [priceRefPackagingUnitLabel, setPriceRefPackagingUnitLabel] = useState<string | null>(null);
  // PR-173: 선택된 품목이 연결된 스타일의 생산유형 — CMT면 단가를 선택 입력으로
  // 허용한다(수출선적서류 작성 시점에만 필요). BOM 미연결/조회 실패/FOB는 모두
  // 기존처럼 단가 필수로 취급한다(null을 "모름=FOB와 동일"로 안전하게 처리).
  const [itemProductionType, setItemProductionType] = useState<'CMT' | 'FOB' | null>(null);
  // 공급업체/단가가 최근 발주 이력으로 자동 채워진 상태인지(다른 품목으로 바꿀 때 이전 자동값을 남기지 않기 위함)
  const [autofilled, setAutofilled] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);
  // PR-240: 공급업체/단가를 미리 채운 출처 — BOM 공급사/확정 단가 > 자재 마스터 > 최근
  // 발주. 사람이 직접 고치면 null로 돌아가 "직접 입력"으로 보인다(값은 있는데 출처가
  // 없으면 직접 입력이라는 뜻 — 별도 boolean을 두지 않는다).
  const [supplierSource, setSupplierSource] = useState<SupplierPrefillSource | null>(null);
  const [priceSource, setPriceSource] = useState<PricePrefillSource | null>(null);
  // PR-180: 발주 구분 — 품목을 고르면 스타일 계약방식 제안을 미리 채우되, 사람이 바꾸거나 직접 고른다.
  const [orderType, setOrderType] = useState<PurchaseOrderType | null>(null);
  const [orderTypeHint, setOrderTypeHint] = useState<string | null>(null);
  const [panelRefresh, setPanelRefresh] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const itemRequestSeq = useRef(0);
  // PR-219: [B] 폼 오류 — handleCreate 검증/제출 오류는 "발주 생성" 버튼 가까이에 보여준다
  // (기존 error state는 목록 조회 실패 등 화면 위쪽 상태 전용으로 남긴다. 둘 다 top에
  // 띄우면 같은 문구가 중복으로 보일 수 있어 통일함 — PR-219-report.md 참고).
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<'supplier' | 'item' | 'quantity' | 'unitPrice' | 'orderType', boolean>>({
    supplier: false, item: false, quantity: false, unitPrice: false, orderType: false,
  });
  const supplierFieldRef = useRef<HTMLDivElement>(null);
  const itemFieldRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const unitPriceInputRef = useRef<HTMLInputElement>(null);
  // PR-219: 실/테이프 종류 추천(전문가 관점 키워드) — 포장단위 규칙과 로그인 사용자 역할을
  // 미리 불러와 둔다. 역할은 기존 실/테이프 종류 지정 화면(ThreadTapeClassificationManager)과
  // 같은 기준(MANAGER/ADMIN)으로 "이 종류로 품목에 저장" 버튼을 보여줄지 정한다.
  const [packagingRules, setPackagingRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const canClassify = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';
  // 선택된 품목(Item)의 기존 종류 지정 상태 — 스타일 미연결 트랙 또는 BOM 행에 종류가
  // 없을 때의 폴백 기준(effectiveSubType과 같은 우선순위: BOM 행 > Item).
  const [itemSubtypeInfo, setItemSubtypeInfo] = useState<{ materialSubType: string | null; packagingReviewedAt: string | null } | null>(null);
  // 저장 전 "임시 선택"(사용자가 추천 영역에서 고른 종류) — 저장하지 않고 참고 계산에만 쓴다.
  const [tempSubtype, setTempSubtype] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  // PR-220b: 고른 BOM 행이 색상별 수량 근거(작지 수량/색상×사이즈 수량표)가 없어
  // needsColorQty였으면, 수량 칸을 비운 이유를 [B]에서도 보여준다(스타일 전체 수량으로
  // 대체하지 않았다는 안내 — [A]의 경고와 같은 문구).
  const [needsColorQtyNote, setNeedsColorQtyNote] = useState<string | null>(null);
  // 비동기 이력 조회가 끝난 시점의 "현재" 폼 값을 읽기 위한 ref(렌더마다 갱신)
  const formValuesRef = useRef({ supplier: null as SupplierRef | null, unitPrice: 0, autofilled: false });
  const [filterSupplier, setFilterSupplier] = useState<SupplierRef | null>(null);
  const [filterItem, setFilterItem] = useState<ItemRef | null>(null);
  // PR-185 A: 목록 트랙 필터 — 전체 / 스타일 연결 / 스타일 미연결.
  const [listTrack, setListTrack] = useState<'ALL' | 'STYLE' | 'ITEM_ONLY'>('ALL');
  // PR-194: 발주 목록에서도 합본 발주서를 다시 받을 수 있게(최초 생성 때와 같은 호출 재사용).
  // 목록의 기존 동작/열은 바꾸지 않고 체크박스 열과 버튼만 덧붙인다.
  const [selectedPoIds, setSelectedPoIds] = useState<Set<number>>(new Set());
  const [combinedDownloading, setCombinedDownloading] = useState(false);
  // PR-196: 발주·입고·출고 현황에서 "발주하기"/"발주 보기"로 넘어오면 그 스타일로 목록을 거른다.
  const [filterStyleNo, setFilterStyleNo] = useState<string | null>(null);
  // PR-183: "이 품목군 취급 업체만 보기" — 기본 켜짐. 품목에 품목군이 있을 때만 보이고, 켜면 폼의 공급업체 검색을 그 품목군 업체로 거른다(자동 선택은 하지 않음).
  const [byItemCategory, setByItemCategory] = useState(true);
  // PR-074: 포장내역은 발주 하위 흐름이라 별도 탭이 아니라 발주 행에서 모달로 연다.
  const [packingReceiptsFor, setPackingReceiptsFor] = useState<PurchaseOrder | null>(null);
  // PR-172: 공급업체가 아직 없을 때 SuppliersManager 탭으로 넘어가면(이 앱은 탭 전환
  // 시 언마운트됨 — react-router 없음) 작성 중이던 발주 폼이 사라진다 — 팝업으로 바로
  // 등록하고 폼은 그대로 유지한다.
  const [showQuickCreateSupplier, setShowQuickCreateSupplier] = useState(false);
  // PR-177: 미입고 발주 — 자재별 "수정하기" 대상과 수정 중인 발주.
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([]);
  const [editing, setEditing] = useState<{ order: PurchaseOrder; pendingCount: number } | null>(null);
  // PR-082: 기존 "선적관리 > 수입"에 임시로 얹혀 있던 ShipmentsManager(원자재 입고)를
  // 원래 자리인 Purchase Orders 쪽 서브탭으로 옮긴다 — shipments 모듈은 PurchaseOrder와
  // 연결된 개념이라 여기가 맞는 위치다(export-shipments의 shipmentsSubTab과 동일 패턴).
  const [poSubTab, setPoSubTab] = useState<'order' | 'receiving'>('order');

  const loadPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPurchaseOrders({
        supplierId: filterSupplier?.id || undefined,
        itemId: filterItem?.id || undefined,
        track: listTrack === 'ALL' ? undefined : listTrack,
        styleNo: filterStyleNo || undefined,
      });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setPurchaseOrders(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filterSupplier, filterItem, listTrack, filterStyleNo]);

  formValuesRef.current = { supplier, unitPrice: newPo.unitPrice ?? 0, autofilled };

  // 서버 검색(검색어마다 조회) — 100건 캡이 없다. 품목은 원자재만(완제품 Item과 섞이지 않게), 한 번에 20건.
  const searchSuppliers = useCallback(async (keyword: string): Promise<SupplierRef[]> => {
    const res = await getSuppliers(keyword ? { keyword } : undefined);
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    return list.slice(0, 30);
  }, []);
  // 발주 폼 전용 공급업체 검색: 품목군 필터(체크 시)를 적용한다. 목록 필터(searchSuppliers)에는 적용하지 않는다.
  const itemCategorySearchId = supplierSearchCategoryId(categoryFilterState(item?.categoryId, byItemCategory));
  const searchFormSuppliers = useCallback(async (keyword: string): Promise<SupplierRef[]> => {
    const res = await getSuppliers({ keyword: keyword || undefined, categoryId: itemCategorySearchId });
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    return list.slice(0, 30);
  }, [itemCategorySearchId]);
  const categoryFilter = categoryFilterState(item?.categoryId, byItemCategory);
  // PR-230: [B]의 스타일 연결 라벨/안내 문구 — resolveStyleLinkDisplay(순수 함수, 테스트됨)에 위임.
  const styleLinkDisplay = resolveStyleLinkDisplay({
    styleNo: styleSearch?.styleNo ?? null,
    styleName: styleSearch?.overview?.styleName ?? null,
    explicitlyCleared: styleLinkExplicitlyCleared,
  });
  const searchRawMaterials = useCallback(async (keyword: string): Promise<ItemRef[]> => {
    const res = await getItems({ keyword: keyword || undefined, type: 'RAW_MATERIAL', limit: 20 });
    return Array.isArray(res) ? res : (res?.items ?? []);
  }, []);
  const searchAllItems = useCallback(async (keyword: string): Promise<ItemRef[]> => {
    const res = await getItems({ keyword: keyword || undefined, limit: 20 });
    return Array.isArray(res) ? res : (res?.items ?? []);
  }, []);
  // PR-185 A: 스타일을 고르면 그 스타일 BOM의 자재만 검색 후보로 보여준다(두 트랙을 섞지 않기 위함).
  const searchStyleMaterials = useCallback(async (keyword: string): Promise<ItemRef[]> => {
    const kw = keyword.trim().toLowerCase();
    return styleMaterialRows
      .filter((r) => !kw || r.itemName.toLowerCase().includes(kw) || r.itemCode.toLowerCase().includes(kw))
      .map((r) => ({ id: r.itemId, name: r.itemName, code: r.itemCode }));
  }, [styleMaterialRows]);
  const searchStyles = useCallback(async (keyword: string): Promise<StyleOption[]> => {
    const res = await getMasterStyles(keyword ? { styleNo: keyword } : undefined);
    const list: StyleOption[] = Array.isArray(res) ? res : (res?.items ?? []);
    return list.slice(0, 30);
  }, []);

  useEffect(() => {
    getBrandPriceRules()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setAvailableBrands([...new Set(list.map((r: any) => r.brandName))] as string[]);
      })
      .catch(() => setAvailableBrands([]));
    getMaterialPackagingUnitRules()
      .then((res) => setPackagingRules(Array.isArray(res) ? res : ((res as any)?.data ?? [])))
      .catch(() => setPackagingRules([]));
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  // 품목을 고르면 공급업체/단가를 미리 채운다(수정 가능) — PR-240: ① BOM 행 공급사/확정
  // 단가 → ② 품목 마스터(vendor) → ③ 같은 자재의 최근 발주 공급사/단가 → ④ 없으면 공란.
  // opts로 BOM/vendor 후보를 받으면 그 우선순위를 적용하고, 없으면(검색으로 직접 고른
  // 경우 등) 기존처럼 최근 발주 이력만으로 채운다(회귀 없음).
  const selectItem = useCallback(async (picked: ItemRef | null, opts?: {
    quantityInput?: string; styleNo?: string;
    bomSupplierName?: string | null; itemVendorName?: string | null;
    bomUnitPrice?: number | null; packagingApplies?: boolean;
  }) => {
    setItem(picked);
    setAutofillNote(null);
    setItemProductionType(null);
    setPriceRef(emptyPriceRef);
    setPriceRefPackagingUnitLabel(null);
    setItemSubtypeInfo(null);
    setTempSubtype(null);
    setSupplierSource(null);
    setPriceSource(null);
    if (opts?.quantityInput !== undefined) setQuantityInput(opts.quantityInput);
    if (!picked) {
      setOrderType(null);
      setOrderTypeHint(null);
      setNeedsColorQtyNote(null);
      return;
    }
    const seq = ++itemRequestSeq.current;
    try {
      const res = await getPurchaseOrders({ itemId: picked.id });
      if (seq !== itemRequestSeq.current) return; // 그 사이 다른 품목을 골랐다
      const sugg = await getOrderTypeSuggestion(picked.id).catch(() => null);
      if (seq !== itemRequestSeq.current) return;
      setOrderType(sugg?.orderType ?? null);
      setOrderTypeHint(sugg?.reason ?? null);
      const orders = Array.isArray(res) ? res : (res?.data ?? []);
      const latest = pickLatestOrderDefaults(orders);
      const hasPriorityCandidates = opts?.bomSupplierName !== undefined || opts?.itemVendorName !== undefined || opts?.bomUnitPrice !== undefined;
      if (hasPriorityCandidates) {
        // PR-240: BOM/품목 마스터 공급사 이름은 자유 텍스트라 실제 공급업체인지 이름으로
        // 확인한다(정확히 일치할 때만 — 추측 매칭 금지). getSuppliers 키워드 검색을
        // 재사용해 새 조회 없이 끝낸다.
        const [bomMatch, vendorMatch] = await Promise.all([
          resolveSupplierByName(opts?.bomSupplierName),
          resolveSupplierByName(opts?.itemVendorName),
        ]);
        if (seq !== itemRequestSeq.current) return;
        const supplierPick = pickSupplierPrefill({ bom: bomMatch, vendor: vendorMatch, recentOrder: latest?.supplier ?? null });
        const pricePick = pickPricePrefill({
          bomUnitPrice: opts?.bomUnitPrice ?? null,
          recentOrderUnitPrice: latest?.unitPrice ?? null,
          packagingApplies: !!opts?.packagingApplies,
        });
        setSupplier(supplierPick?.supplier ?? null);
        setSupplierSource(supplierPick?.source ?? null);
        setNewPo((prev) => ({ ...prev, unitPrice: pricePick?.unitPrice ?? 0 }));
        setPriceSource(pricePick?.source ?? null);
        setAutofilled(!!supplierPick || !!pricePick);
        setAutofillNote(
          supplierPick || pricePick
            ? `공급업체/단가를 기존 정보로 미리 채웠습니다(${[supplierPick && SUPPLIER_SOURCE_LABEL[supplierPick.source], pricePick && PRICE_SOURCE_LABEL[pricePick.source]].filter(Boolean).join(', ')}). 필요하면 수정하세요.`
            : '이 품목으로 채울 수 있는 공급업체/단가 정보가 없어 직접 선택해 주세요.',
        );
      } else {
        // 어떤 값이 자동 채움이고 어떤 값이 사용자가 넣은 값인지는 resolveAutofill(테스트된 순수 함수)이 정한다.
        const cur = formValuesRef.current;
        const next = resolveAutofill({ supplier: cur.supplier, unitPrice: cur.unitPrice, autofilled: cur.autofilled }, latest);
        setSupplier(next.supplier);
        setNewPo((prev) => ({ ...prev, unitPrice: next.unitPrice }));
        setAutofilled(next.autofilled);
        setSupplierSource(latest ? 'recentOrder' : null);
        setPriceSource(latest ? 'recentOrder' : null);
        setAutofillNote(latest ? `최근 발주 #${latest.orderId}의 공급업체(${latest.supplier.name})/단가(${latest.unitPrice})를 채웠습니다. 필요하면 수정하세요.` : '이 품목의 발주 이력이 없어 공급업체/단가는 직접 선택해 주세요.');
      }
    } catch {
      // 이력 조회 실패는 발주 자체를 막지 않는다 — 자동 채움만 건너뛴다.
    }
    try {
      // PR-219: 스타일을 연결한 경우 그 스타일 기준으로 CMT/FOB를 판정한다(사용자 결정 —
      // 다른 스타일의 생산유형이 섞여 있어도 "지금 연결한 스타일"이 우선한다).
      const ctx = await getMaterialProductionContext(picked.id, opts?.styleNo);
      if (seq !== itemRequestSeq.current) return;
      setItemProductionType(ctx.productionType);
    } catch {
      // 생산유형 조회 실패는 FOB와 동일(단가 필수)로 안전하게 처리 — itemProductionType은 null 그대로 둔다.
    }
    try {
      // PR-219: 실/테이프 종류 추천 영역(Item.materialSubType/packagingReviewedAt 기준 폴백)용.
      const full = await getItem(picked.id);
      if (seq !== itemRequestSeq.current) return;
      setItemSubtypeInfo({ materialSubType: full.materialSubType ?? null, packagingReviewedAt: full.packagingReviewedAt ?? null });
    } catch {
      // 조회 실패해도 발주 자체는 막지 않는다 — 추천 영역만 "직접 선택"으로 남는다.
    }
  }, []);

  // 스타일 연결 트랙에서 BOM 자재를 고르면: 품목 선택(기존 로직)에 더해 수량을
  // 부족분(콘/롤 환산 포함, suggestStyleLinkedQuantity)으로 미리 채운다.
  // PR-187 C: rowOverride를 받을 수 있게 한다 — handlePickMaterial이 setStyleMaterialRows
  // 직후 바로 호출하면 styleMaterialRows state는 다음 렌더까지 갱신되지 않아(React의
  // 비동기 state 업데이트), 방금 고른 row를 못 찾고 수량이 비워지지 않는 버그가 있었다.
  const selectStyleMaterial = (
    picked: ItemRef | null,
    rowOverride?: MaterialRequirementRow,
    styleNoOverride?: string,
    // PR-240: 자재명세의 "발주하기"로 넘어온 경우(단일/PR-238 일괄) 그 BOM 행 공급사/
    // 확정 단가·품목 마스터 vendor를 함께 넘긴다 — 최근 발주 이력보다 우선 적용된다.
    bomPrefillOpts?: { bomSupplierName?: string | null; itemVendorName?: string | null; bomUnitPrice?: number | null },
  ) => {
    if (!picked) { void selectItem(null); return; }
    const row = rowOverride ?? styleMaterialRows.find((r) => r.itemId === picked.id);
    if (!row) { void selectItem(picked, bomPrefillOpts ? { ...bomPrefillOpts, packagingApplies: false } : undefined); return; }
    const sugg = suggestStyleLinkedQuantity(row);
    // PR-220b: needsColorQty 행은 conversionWarning이 이미 이 문구로 채워져 있어
    // suggestStyleLinkedQuantity가 quantity: null을 돌려준다(수량 칸 비움) — [B]에도
    // 같은 안내를 보여준다.
    setNeedsColorQtyNote(row.needsColorQty ? (row.conversionWarning ?? null) : null);
    // PR-219: styleSearch state는 setStyleSearch 직후라면 아직 갱신 전일 수 있어(React
    // 비동기 state), handlePickMaterial처럼 styleNo를 아는 호출부는 명시적으로 넘긴다.
    void selectItem(
      { ...picked, unit: sugg.unitLabel ?? undefined },
      {
        quantityInput: sugg.quantity != null ? String(sugg.quantity) : '',
        styleNo: styleNoOverride ?? styleSearch?.styleNo ?? undefined,
        ...(bomPrefillOpts ? { ...bomPrefillOpts, packagingApplies: !!row.packaging } : {}),
      },
    );
  };

  useEffect(() => {
    if (!styleSearch) { setStyleMaterialRows([]); return; }
    let cancelled = false;
    setStyleRowsLoading(true);
    getStyleRequirements(styleSearch.styleNo)
      .then((res) => { if (!cancelled) setStyleMaterialRows(res.rows); })
      .catch(() => { if (!cancelled) setStyleMaterialRows([]); })
      .finally(() => { if (!cancelled) setStyleRowsLoading(false); });
    return () => { cancelled = true; };
  }, [styleSearch]);

  const handlePickMaterial = (row: MaterialRequirementRow, styleNo?: string, styleName?: string | null) => {
    // PR-185: 소요량 화면에서 "이 자재로 발주하기"를 누르면 그 스타일도 함께 연결한다.
    // PR-230: 매번 누르는 명시적 클릭이므로, 이전에 "연결 해제"를 눌렀어도 다시 연결한다.
    if (styleNo) {
      setStyleSearch({ styleNo, overview: styleName ? { styleName } : null });
      setStyleLinkExplicitlyCleared(false);
      setStyleMaterialRows([row]);
      selectStyleMaterial({ id: row.itemId, name: row.itemName, code: row.itemCode }, row, styleNo);
    } else {
      // PR-187 C: 스타일 미연결 경로도 같은 원칙(종류 미지정 실/테이프는 미터 수량을
      // 추측해서 채우지 않는다)을 따른다 — 일반 자재는 기존처럼 ceil(부족)/최소 1.
      const qty = suggestUnlinkedQuantity(row);
      setNeedsColorQtyNote(row.needsColorQty ? (row.conversionWarning ?? null) : null);
      void selectItem({ id: row.itemId, name: row.itemName, code: row.itemCode }, { quantityInput: qty != null ? String(qty) : '' });
    }
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  const loadPendingOrders = useCallback(async () => {
    try {
      const res = await getPurchaseOrders({ status: 'PENDING' });
      setPendingOrders(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {
      setPendingOrders([]); // 조회 실패 시 "발주하기"로 두고(안전한 쪽) 막지 않는다
    }
  }, []);

  useEffect(() => {
    loadPendingOrders();
  }, [loadPendingOrders, panelRefresh]);

  // Items(자재명세) 화면에서 "발주하기"로 넘어온 경우, 해당 품목을 폼에 미리 선택해 둔다.
  // PR-230: 그 화면은 항상 특정 스타일의 BOM을 보는 중이므로, 같이 넘어온 styleNo가
  // 있으면 [B]의 스타일 연결도 그 스타일로 자동 설정한다(명시적 해제 전까지 유지).
  // PR-240: 수량/공급업체/단가도 이미 있는 정보로 채운다 — 그 스타일의 소요량
  // (getStyleRequirements, selectStyleMaterial과 같은 규칙)과 이 자재의 BOM 행(공급사·
  // 확정 단가)을 함께 조회해 넘긴다. PR-187 C와 같은 이유로 styleMaterialRows state가
  // 갱신되기 전에 바로 쓸 수 있게 조회 결과를 직접 selectStyleMaterial에 넘긴다.
  useEffect(() => {
    if (prefillItemId) {
      const styleNo = prefillItemStyleNo || undefined;
      if (styleNo) {
        setStyleSearch({ styleNo });
        setStyleLinkExplicitlyCleared(false);
      }
      (async () => {
        try {
          const it = await getItem(prefillItemId);
          const picked = { id: it.id, name: it.name, code: it.code };
          let row: MaterialRequirementRow | undefined;
          let bomRow: BomItemRow | undefined;
          if (styleNo) {
            const [reqRes, bomRes] = await Promise.all([
              getStyleRequirements(styleNo).catch(() => null),
              getBomByStyleNo(styleNo).catch(() => null),
            ]);
            if (reqRes) {
              setStyleMaterialRows(reqRes.rows);
              row = reqRes.rows.find((r) => r.itemId === it.id);
            }
            if (bomRes?.items) {
              // 같은 자재가 색상별로 여러 BOM 행에 걸쳐 있으면, 공급사/확정 단가가
              // 채워진 첫 행을 쓴다(값이 있는 행이 사람이 실제로 지정한 행일 가능성이 큼).
              bomRow = bomRes.items.find((b: BomItemRow) => b.material?.id === it.id && (b.supplier || b.unitPrice > 0))
                ?? bomRes.items.find((b: BomItemRow) => b.material?.id === it.id);
            }
          }
          const bomPrefillOpts = { bomSupplierName: bomRow?.supplier ?? null, itemVendorName: it.vendor ?? null, bomUnitPrice: bomRow?.unitPrice ?? null };
          if (row) {
            selectStyleMaterial(picked, row, styleNo, bomPrefillOpts);
          } else {
            await selectItem(picked, { styleNo, ...bomPrefillOpts, packagingApplies: false });
          }
        } catch (err) {
          setError(getErrorMessage(err, '품목 정보를 불러오지 못했습니다.'));
        }
      })();
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillItemId, prefillItemStyleNo, onPrefillConsumed]);

  // PR-196: 발주·입고·출고 현황에서 "발주하기"/"발주 보기"로 넘어온 경우 — 그 스타일을
  // styleSearch에 넣어 기존 경로(getStyleRequirements → StyleShortagePanel)를 그대로
  // 태우고, 발주 목록도 그 스타일로 필터한다.
  useEffect(() => {
    if (prefillStyleNo) {
      setStyleSearch({ styleNo: prefillStyleNo });
      setFilterStyleNo(prefillStyleNo);
      onStylePrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillStyleNo, onStylePrefillConsumed]);

  // PR-219: 검증 실패 시 해당 칸에 빨간 테두리를 주고 첫 오류 칸으로 스크롤/포커스한다
  // (기존엔 setError만 페이지 맨 위에 떠서 "발주 생성" 버튼 근처에서는 반응이 없는
  // 것처럼 보였다 — PILOT-18 조사 결과).
  const focusField = (field: keyof typeof fieldErrors) => {
    const map: Record<keyof typeof fieldErrors, React.RefObject<HTMLElement | null>> = {
      supplier: supplierFieldRef, item: itemFieldRef, quantity: quantityInputRef, unitPrice: unitPriceInputRef, orderType: formRef,
    };
    const el = map[field].current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el && 'focus' in el) (el as HTMLElement).focus?.();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const noFieldErrors = { supplier: false, item: false, quantity: false, unitPrice: false, orderType: false };
    const fail = (message: string, field: keyof typeof fieldErrors) => {
      setFormError(message);
      setFieldErrors({ ...noFieldErrors, [field]: true });
      focusField(field);
    };
    if (!supplier) { fail('공급업체를 선택해 주세요.', 'supplier'); return; }
    if (!item) { fail('품목을 선택해 주세요.', 'item'); return; }
    const hasLines = poLines.length > 0;
    // PR-185 B: 수량은 더 이상 기본값이 없다 — 라인이 없으면 반드시 입력해야 한다.
    if (!hasLines && !isQuantityFilled(quantityInput)) {
      fail('수량을 입력해 주세요(0보다 큰 숫자).', 'quantity');
      return;
    }
    if (isUnitPriceRequired(itemProductionType) && (!newPo.unitPrice || newPo.unitPrice <= 0)) {
      fail('품목 단가를 입력해 주세요.', 'unitPrice');
      return;
    }
    if (hasLines && poLines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) {
      fail('색상/사이즈 줄의 수량은 1 이상의 정수여야 합니다.', 'quantity');
      return;
    }
    if (!canCreateWithOrderType(orderType)) {
      fail('발주 구분(실발주/가발주)을 선택해 주세요.', 'orderType');
      return;
    }
    setFieldErrors(noFieldErrors);
    try {
      // CMT 건에서 단가를 비워둔 경우(0) undefined로 보낸다 — "입력 안 함"과 "0원"을 구분한다.
      const unitPrice = newPo.unitPrice && newPo.unitPrice > 0 ? newPo.unitPrice : undefined;
      const orderTypeValue = orderType as 'FIRM' | 'PROVISIONAL';
      const common = {
        supplierId: supplier.id, itemId: item.id, unitPrice, orderType: orderTypeValue,
        notes: newPo.notes,
        styleNo: styleSearch?.styleNo || undefined,
        referenceUnitPriceUsd: priceRef.usd ?? undefined,
        referencePriceSource: priceRef.source ?? undefined,
        referencePriceNote: priceRef.note ?? undefined,
      };
      const payload = hasLines
        ? { ...common, quantity: undefined, lines: poLines.map((l) => ({ color: l.color || undefined, size: l.size || undefined, qty: Number(l.qty) })) }
        : { ...common, quantity: Number(quantityInput), lines: undefined };
      const res = await createPurchaseOrder(payload);
      (res?.warnings ?? []).forEach((w: string) => toast(w, { icon: '⚠️' }));
      toast.success('발주가 생성되었습니다.');
      setPoLines([]);
      setNewPo(emptyForm);
      setQuantityInput('');
      setSupplier(null);
      setItem(null);
      setStyleSearch(null);
      setStyleMaterialRows([]);
      setBrandOverride('');
      setPriceRef(emptyPriceRef);
      setPriceRefPackagingUnitLabel(null);
      setItemProductionType(null);
      setAutofilled(false);
      setAutofillNote(null);
      setOrderType(null);
      setOrderTypeHint(null);
      setTempSubtype(null);
      setItemSubtypeInfo(null);
      setNeedsColorQtyNote(null);
      setPanelRefresh((n) => n + 1); // 스타일 부족 자재 표의 "이미 발주" 수량 갱신
      loadPurchaseOrders();
    } catch (err: any) {
      // PR-219: 서버 오류도 같은 폼 오류 박스(버튼 근처)에 보여준다.
      setFormError(getErrorMessage(err, '발주 생성에 실패했습니다.'));
    }
  };

  const handleReceive = async (id: number) => {
    setError(null);
    try {
      await updatePurchaseOrderStatus(id, 'RECEIVED');
      toast.success('입고 처리되었습니다. 재고에 반영됩니다.');
      loadPurchaseOrders();
    } catch (err: any) {
      setError(getErrorMessage(err, '입고 처리에 실패했습니다.'));
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('이 발주를 취소하시겠습니까?')) return;
    setError(null);
    try {
      await updatePurchaseOrderStatus(id, 'CANCELLED');
      toast.success('발주가 취소되었습니다.');
      loadPurchaseOrders();
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 취소에 실패했습니다.'));
    }
  };

  // PR-219: 실/테이프 종류 — BOM 행(스타일 연결 트랙)이 우선, 없으면 Item 지정(폴백) —
  // effectiveSubType(백엔드)과 같은 우선순위. 저장된 값이 있으면 추천 영역은 숨긴다(기존
  // 동작 그대로, PR-216/218 회귀 없음).
  const styleLinkedRow = styleSearch && item ? styleMaterialRows.find((r) => r.itemId === item.id) : undefined;
  const existingSubtype = styleSearch ? (styleLinkedRow?.materialSubType ?? null) : (itemSubtypeInfo?.materialSubType ?? null);
  const subtypeReviewed = !!itemSubtypeInfo?.packagingReviewedAt;
  const threadTapeSuggestion = item ? suggestThreadTapeByKeyword(item.name, packagingRules) : null;
  const needsSubtypeUi = !!item && !existingSubtype && !subtypeReviewed && looksLikeThreadOrTape(item.name, packagingRules);
  const effectiveSubtype = existingSubtype ?? tempSubtype ?? null;
  const effectiveSubtypeRule = effectiveSubtype ? packagingRules.find((r) => r.materialSubType === effectiveSubtype) : undefined;
  // PR-219 ⑤: [B] 수량 참고 — 종류가 이미 지정돼 있으면(styleLinkedRow.packaging) 기존
  // "이 자재로 발주하기"/자동 채움 경로가 이미 처리하므로 중복으로 보여주지 않는다.
  const qtyRef = styleLinkedRow && !styleLinkedRow.packaging && effectiveSubtypeRule
    ? (() => {
        const packages = ceilWithEpsilon(styleLinkedRow.requiredQty, effectiveSubtypeRule.unitLengthM);
        const shortage = Math.max(0, packages - styleLinkedRow.orderedQty);
        return {
          packages,
          shortage,
          formula: `필요 ${styleLinkedRow.requiredQty.toLocaleString('ko-KR')}m ÷ ${effectiveSubtypeRule.unitLengthM}m/${effectiveSubtypeRule.packagingUnitLabel} = ${packages}${effectiveSubtypeRule.packagingUnitLabel} (참고)`,
        };
      })()
    : null;

  const handleSaveSubtype = async () => {
    if (!item || !tempSubtype || !canClassify) return;
    setClassifying(true);
    try {
      await classifyThreadTape([{ itemId: item.id, materialSubType: tempSubtype }]);
      setItemSubtypeInfo({ materialSubType: tempSubtype, packagingReviewedAt: new Date().toISOString() });
      toast.success('실/테이프 종류가 저장되었습니다.');
    } catch (err: any) {
      toast.error(getErrorMessage(err, '종류 저장에 실패했습니다.'));
    } finally {
      setClassifying(false);
    }
  };

  // PR-219: 추천값을 임시 선택의 기본값으로 미리 채운다(저장은 아님) — 품목/추천이 바뀔
  // 때만 다시 채우고, 사용자가 드롭다운에서 고른 값은 덮어쓰지 않는다.
  useEffect(() => {
    if (needsSubtypeUi && threadTapeSuggestion && tempSubtype === null) {
      setTempSubtype(threadTapeSuggestion.materialSubType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, needsSubtypeUi, threadTapeSuggestion?.materialSubType]);

  const statusBadge = (status: string) => {
    const style =
      status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
      status === 'CANCELLED' ? 'bg-gray-200 text-gray-600' :
      'bg-yellow-100 text-yellow-800';
    return <span className={`px-2 py-1 rounded text-xs font-medium ${style}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Purchase Orders</h2>

      <div className="flex space-x-2 border-b border-gray-200">
        <button
          className={`px-3 py-2 text-sm font-medium ${poSubTab === 'order' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setPoSubTab('order')}
        >발주</button>
        <button
          className={`px-3 py-2 text-sm font-medium ${poSubTab === 'receiving' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setPoSubTab('receiving')}
        >입고관리</button>
      </div>

      {poSubTab === 'receiving' ? (
        <ShipmentsManager />
      ) : (
        <>
      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <StyleShortagePanel
        onPickMaterial={handlePickMaterial}
        onGoToList={() => setListTrack('ALL')}
        refreshKey={panelRefresh}
        pendingOrders={pendingOrders}
        onEdit={(order, pendingCount) => setEditing({ order, pendingCount })}
        onBulkDone={() => { setPanelRefresh((n) => n + 1); loadPurchaseOrders(); loadPendingOrders(); }}
      />

      <form ref={formRef} onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg space-y-2">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일 연결(선택)</label>
            <SearchSelectField<StyleOption>
              value={styleSearch}
              onChange={(picked) => { setStyleSearch(picked); setStyleLinkExplicitlyCleared(picked === null); setItem(null); setQuantityInput(''); }}
              search={searchStyles}
              getKey={(s) => s.styleNo}
              getLabel={(s) => s.styleNo}
              ariaLabel="스타일 연결"
              placeholder={styleLinkDisplay.placeholder}
              title="스타일 검색 — 고르면 그 스타일 BOM 자재만 선택할 수 있습니다"
              allowClear
              className="w-56"
            />
            {styleLinkDisplay.connected ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-indigo-700 font-medium">{styleLinkDisplay.connectedLabel}</span>
                <button
                  type="button"
                  onClick={() => { setStyleSearch(null); setStyleLinkExplicitlyCleared(true); setItem(null); setQuantityInput(''); }}
                  className="text-xs text-gray-500 underline hover:text-gray-700"
                >
                  연결 해제
                </button>
              </div>
            ) : styleLinkDisplay.disconnectedNote ? (
              <span className="text-xs text-amber-600 mt-1">{styleLinkDisplay.disconnectedNote}</span>
            ) : null}
            {styleSearch && <span className="text-xs text-gray-400 mt-1">{styleRowsLoading ? '자재 목록 불러오는 중...' : `${styleMaterialRows.length}종 자재`}</span>}
          </div>
          <div className="flex flex-col" ref={itemFieldRef} tabIndex={-1}>
            <label className="text-sm text-gray-600 mb-1">품목(원자재){styleSearch && <span className="text-blue-600 font-normal"> — 이 스타일 BOM 자재만</span>}</label>
            <SearchSelectField<ItemRef>
              value={item}
              onChange={(picked) => { if (styleSearch) selectStyleMaterial(picked, undefined, styleSearch.styleNo); else { setNeedsColorQtyNote(null); void selectItem(picked); } }}
              search={styleSearch ? searchStyleMaterials : searchRawMaterials}
              getKey={(i) => i.id}
              getLabel={(i) => `${i.name} (${i.code})`}
              renderRow={(i) => (<span>{i.name} <span className="text-gray-400 text-xs">{i.code}</span></span>)}
              ariaLabel="품목"
              placeholder="품목 검색"
              title="품목(원자재) 검색"
              className={`w-64 ${fieldErrors.item ? 'ring-2 ring-red-500 rounded' : ''}`}
            />
          </div>
          <div className="flex flex-col" ref={supplierFieldRef} tabIndex={-1}>
            <label className="text-sm text-gray-600 mb-1">공급업체</label>
            <div className="flex items-stretch gap-1">
              <SearchSelectField<SupplierRef>
                value={supplier}
                onChange={(picked) => { setSupplier(picked); setAutofilled(false); setSupplierSource(null); }}
                search={searchFormSuppliers}
                getKey={(x) => x.id}
                getLabel={(x) => `${x.name} (${x.code})`}
                renderRow={(x) => (<span>{x.name} <span className="text-gray-400 text-xs">{x.code}</span></span>)}
                ariaLabel="공급업체"
                placeholder="공급업체 검색"
                title="공급업체 검색"
                className={`w-64 ${fieldErrors.supplier ? 'ring-2 ring-red-500 rounded' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowQuickCreateSupplier(true)}
                className="border border-gray-300 rounded px-2 text-sm text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                + 새 공급업체 등록
              </button>
            </div>
            {/* PR-240: 미리 채운 값이면 출처, 사람이 고쳤으면(supplierSource===null인데
                값은 있음) "직접 입력"을 보여준다 — 값이 전혀 없으면 아무것도 보이지 않는다. */}
            {supplier && (
              <span className="text-xs text-gray-400 mt-0.5" data-testid="supplier-source">
                {supplierSource ? SUPPLIER_SOURCE_LABEL[supplierSource] : '직접 입력'}
              </span>
            )}
            {categoryFilter.visible && (
              <label className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                <input
                  type="checkbox"
                  checked={categoryFilter.checked}
                  onChange={(e) => setByItemCategory(e.target.checked)}
                />
                이 품목군 취급 업체만 보기
              </label>
            )}
          </div>
          <div className="flex flex-col">
            {/* PR-187: 단가표 참고가 서버에서 판단한 콘/롤 라벨(priceRefPackagingUnitLabel)을
                item.unit보다 우선한다 — 스타일 미연결 트랙처럼 item.unit이 'EA'로 남아 있어도
                종류가 지정돼 있으면 "콘/롤 기준"임을 알 수 있게(수량 자동 채움은 아님). */}
            <label className="text-sm text-gray-600 mb-1">수량{(priceRefPackagingUnitLabel || item?.unit) && <span className="text-gray-400 font-normal"> ({priceRefPackagingUnitLabel || item?.unit})</span>}</label>
            <input
              ref={quantityInputRef}
              type="number"
              min={1}
              className={`border rounded px-3 py-2 w-32 disabled:bg-gray-100 ${fieldErrors.quantity ? 'border-red-500' : 'border-gray-300'}`}
              value={poLines.length > 0 ? sumPurchaseOrderLines(poLines) : quantityInput}
              readOnly={poLines.length > 0}
              required={poLines.length === 0}
              title={poLines.length > 0 ? '색상/사이즈 줄 합계로 자동 계산됩니다' : undefined}
              onChange={(e) => { setQuantityInput(e.target.value); setFieldErrors((f) => ({ ...f, quantity: false })); }}
              aria-label="수량"
            />
            {/* PR-220b: 색상별 수량 근거(작지 수량/색상×사이즈 수량표)가 없어 수량을
                스타일 전체 수량으로 추측해 채우지 않았다는 안내 — [A]와 같은 문구. */}
            {needsColorQtyNote && (
              <p className="text-xs text-amber-700 mt-1 max-w-[200px]" data-testid="needs-color-qty-note">{needsColorQtyNote}</p>
            )}
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              단가{!isUnitPriceRequired(itemProductionType) && <span className="text-gray-400 font-normal"> (CMT — 선택, 선적서류 작성 시 입력 가능)</span>}
            </label>
            <input
              ref={unitPriceInputRef}
              type="number"
              min={0}
              step="any"
              className={`border rounded px-3 py-2 w-32 ${fieldErrors.unitPrice ? 'border-red-500' : 'border-gray-300'}`}
              value={newPo.unitPrice}
              onChange={(e) => { setNewPo({ ...newPo, unitPrice: Number(e.target.value) }); setAutofilled(false); setPriceSource(null); setFieldErrors((f) => ({ ...f, unitPrice: false })); }}
              aria-label="단가"
            />
            {!!newPo.unitPrice && newPo.unitPrice > 0 && (
              <span className="text-xs text-gray-400 mt-0.5" data-testid="price-source">
                {priceSource ? PRICE_SOURCE_LABEL[priceSource] : '직접 입력'}
              </span>
            )}
            {fieldErrors.unitPrice && <p className="text-xs text-red-600 mt-1" data-testid="unit-price-inline-hint">단가를 입력해 주세요</p>}
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">구분</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 w-40"
              value={orderType ?? ''}
              onChange={(e) => setOrderType(e.target.value === '' ? null : (e.target.value as PurchaseOrderType))}
              aria-label="발주 구분"
            >
              <option value="">구분 선택</option>
              <option value="FIRM">실발주(FOB)</option>
              <option value="PROVISIONAL">가발주(CMT)</option>
            </select>
          </div>
          {!styleSearch && (
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">적용 브랜드</label>
              <select className="border border-gray-300 rounded px-3 py-2 w-36" value={brandOverride} onChange={(e) => setBrandOverride(e.target.value)} aria-label="적용 브랜드">
                <option value="">선택 안 함</option>
                {availableBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-sm text-gray-600 mb-1">비고</label>
            <textarea
              className="border border-gray-300 rounded px-3 py-2"
              rows={1}
              placeholder="비고"
              value={newPo.notes || ''}
              onChange={(e) => setNewPo({ ...newPo, notes: e.target.value })}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700" disabled={loading}>발주 생성</button>
        </div>
        {/* PR-219: 검증/제출 오류를 "발주 생성" 버튼 바로 아래(이 자리)에 띄운다 — 폼을
            아래로 스크롤해 작성 중일 때도 보이게. 화면 맨 위 박스(error state)는 발주
            목록 조회 등 폼 밖의 상태 전용으로 남긴다(PR-219-report.md 참고). */}
        {formError && <div className="p-3 bg-red-100 text-red-700 rounded text-sm" data-testid="form-error">{formError}</div>}
        {autofillNote && <p className="text-xs text-blue-700" data-testid="autofill-note">{autofillNote}</p>}
        {orderTypeHint && <p className="text-xs text-gray-500" data-testid="order-type-hint">구분 제안: {orderTypeHint}</p>}
        {/* PR-219: 실/테이프 종류가 미지정이고 이름상 실/테이프로 보이는 품목 — 전문가
            관점 키워드 추천을 보여주고, 임시 선택(저장 안 함)을 바꾸면 아래 수량/단가
            참고가 즉시 그 종류로 다시 계산된다. 이미 종류가 지정된 품목은 이 영역을
            숨긴다(PR-216/218 기존 동작 유지). */}
        {needsSubtypeUi && (
          <div className="border border-indigo-200 bg-indigo-50 rounded p-2 space-y-1" data-testid="subtype-suggestion-box">
            {threadTapeSuggestion ? (
              <p className="text-xs text-indigo-800">
                추천: <b>{threadTapeSuggestion.displayName}</b>
                {effectiveSubtypeRule && ` (${effectiveSubtypeRule.unitLengthM}m/${effectiveSubtypeRule.packagingUnitLabel})`}
                {' — 근거: '}{threadTapeSuggestion.reason}
                {threadTapeSuggestion.conflict && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 text-xs">확인 필요 — {threadTapeSuggestion.conflictReason}</span>}
              </p>
            ) : (
              <p className="text-xs text-indigo-800">추천 없음 — 이름에서 종류를 하나로 판별할 수 없습니다. 직접 선택해 주세요.</p>
            )}
            <div className="flex items-center gap-2">
              <select
                className="border rounded px-2 py-1 text-sm"
                aria-label="실/테이프 종류 임시 선택"
                value={tempSubtype ?? ''}
                onChange={(e) => setTempSubtype(e.target.value || null)}
              >
                <option value="">- 선택 안 함 -</option>
                {packagingRules.map((r) => <option key={r.materialSubType} value={r.materialSubType}>{r.displayName}</option>)}
              </select>
              <span className="text-xs text-indigo-600">저장 전 참고값</span>
              {canClassify ? (
                <button
                  type="button"
                  disabled={!tempSubtype || classifying}
                  onClick={() => { if (window.confirm(`품목 "${item?.name}"의 실/테이프 종류를 저장하시겠습니까? (이후 BOM/발주/선적 계산에 반영됩니다)`)) void handleSaveSubtype(); }}
                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded disabled:opacity-50"
                >이 종류로 품목에 저장</button>
              ) : (
                <span className="text-xs text-amber-700" data-testid="subtype-save-denied">관리자/매니저만 저장할 수 있습니다.</span>
              )}
            </div>
          </div>
        )}
        {/* PR-219 ⑤: 스타일 연결 트랙에서 종류(저장 또는 임시 선택)가 있으면 필요량을
            콘/롤로 환산한 "참고" 수량과 "이 값 사용" 버튼을 보여준다. */}
        {qtyRef && (
          <div className="border border-gray-200 bg-white rounded p-2 flex items-center gap-2 text-xs text-gray-700" data-testid="qty-reference-box">
            <span>{qtyRef.formula}{qtyRef.shortage !== qtyRef.packages ? ` · 부족 ${qtyRef.shortage}${effectiveSubtypeRule?.packagingUnitLabel}` : ''}</span>
            <button
              type="button"
              className="text-blue-600 border border-blue-300 rounded px-2 py-0.5 hover:bg-blue-50"
              onClick={() => setQuantityInput(String(qtyRef.shortage > 0 ? qtyRef.shortage : qtyRef.packages))}
            >이 값 사용</button>
          </div>
        )}
        {item && (
          <PriceReferenceBlock
            itemId={item.id}
            itemName={item.name}
            styleNo={styleSearch?.styleNo}
            brandName={styleSearch ? undefined : (brandOverride || undefined)}
            materialSubType={effectiveSubtype ?? undefined}
            value={priceRef}
            onChange={setPriceRef}
            onPackagingUnitLabel={setPriceRefPackagingUnitLabel}
          />
        )}
        {/* PR-176: 색상/사이즈별 상세 — 접었다 펼친다. 줄이 하나라도 있으면 수량은 줄 합계로 계산된다. */}
        <details className="border border-gray-200 rounded p-2 bg-white" open={poLines.length > 0}>
          <summary className="cursor-pointer text-sm text-gray-700">색상/사이즈별 상세 (선택){poLines.length > 0 ? ` — ${poLines.length}줄, 합계 ${sumPurchaseOrderLines(poLines)}` : ''}</summary>
          <div className="mt-2 space-y-2">
            {poLines.map((l, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <input className="border border-gray-300 rounded px-2 py-1 w-32" placeholder="색상(자유입력)" aria-label={`색상 ${idx + 1}`} value={l.color ?? ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} />
                <input className="border border-gray-300 rounded px-2 py-1 w-28" placeholder="사이즈(자유입력)" aria-label={`사이즈 ${idx + 1}`} value={l.size ?? ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, size: e.target.value } : x)))} />
                <input type="number" min={1} className="border border-gray-300 rounded px-2 py-1 w-24" placeholder="수량" aria-label={`수량 ${idx + 1}`} value={l.qty || ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))} />
                <button type="button" className="text-red-600 text-sm" onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}>삭제</button>
              </div>
            ))}
            <button type="button" className="text-blue-600 text-sm" onClick={() => setPoLines([...poLines, { color: '', size: '', qty: 0 }])}>+ 줄 추가</button>
            {poLines.length > 0 && <p className="text-xs text-gray-500">줄 합계 {sumPurchaseOrderLines(poLines)}개가 발주 수량이 됩니다.</p>}
          </div>
        </details>
      </form>

      <div className="flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">업체별 조회</label>
          <SearchSelectField<SupplierRef>
            value={filterSupplier}
            onChange={setFilterSupplier}
            search={searchSuppliers}
            getKey={(x) => x.id}
            getLabel={(x) => `${x.name} (${x.code})`}
            ariaLabel="업체별 조회"
            placeholder="전체 업체"
            title="업체별 조회 — 공급업체 검색"
            allowClear
            className="w-64"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목별 조회</label>
          <SearchSelectField<ItemRef>
            value={filterItem}
            onChange={setFilterItem}
            search={searchAllItems}
            getKey={(i) => i.id}
            getLabel={(i) => `${i.name} (${i.code})`}
            ariaLabel="품목별 조회"
            placeholder="전체 품목"
            title="품목별 조회 — 품목 검색"
            allowClear
            className="w-64"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">트랙</label>
          <div className="flex gap-1">
            {(['ALL', 'STYLE', 'ITEM_ONLY'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setListTrack(t)}
                className={`px-3 py-2 rounded text-sm ${listTrack === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {t === 'ALL' ? '전체' : t === 'STYLE' ? '스타일 연결' : '스타일 미연결'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedPoIds.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{selectedPoIds.size}건 선택됨</span>
          <button
            type="button"
            disabled={combinedDownloading}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
            onClick={async () => {
              setCombinedDownloading(true);
              try {
                const files = await getCombinedPurchaseOrderDocuments([...selectedPoIds]);
                for (const f of files) downloadBase64File(f.base64, f.filename);
                toast.success(`업체 ${files.length}곳의 합본 발주서를 받았습니다.`);
              } catch (err: any) {
                toast.error(getErrorMessage(err, '합본 발주서 생성에 실패했습니다.'));
              } finally {
                setCombinedDownloading(false);
              }
            }}
          >{combinedDownloading ? '생성 중...' : '선택 발주 합본 발주서'}</button>
          <button type="button" className="text-sm text-gray-500" onClick={() => setSelectedPoIds(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={purchaseOrders.length > 0 && selectedPoIds.size === purchaseOrders.length}
                  onChange={(e) => setSelectedPoIds(e.target.checked ? new Set(purchaseOrders.map((p) => p.id)) : new Set())}
                />
              </th>
              <th className="px-4 py-2 text-left">품목</th>
              <th className="px-4 py-2 text-left">스타일</th>
              <th className="px-4 py-2 text-right">수량</th>
              <th className="px-4 py-2 text-right">단가</th>
              <th className="px-4 py-2 text-right">총액</th>
              <th className="px-4 py-2 text-left">공급업체</th>
              <th className="px-4 py-2 text-left">구분</th>
              <th className="px-4 py-2 text-left">비고</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {purchaseOrders.map((po) => (
              <Fragment key={po.id}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${po.item?.name ?? po.itemId} 선택`}
                    checked={selectedPoIds.has(po.id)}
                    onChange={(e) => setSelectedPoIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(po.id); else next.delete(po.id);
                      return next;
                    })}
                  />
                </td>
                <td className="px-4 py-2">{po.item?.name ?? `#${po.itemId}`}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${po.styleNo ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>{trackBadgeLabel(po.styleNo)}</span>
                </td>
                <td className="px-4 py-2 text-right">{po.quantity}</td>
                <td className="px-4 py-2 text-right">
                  {po.unitPrice != null ? po.unitPrice : (
                    <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full" title="CMT 등 단가가 아직 정해지지 않은 발주 — 수출선적서류 작성 시 입력">단가 미입력</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{po.unitPrice != null ? (po.unitPrice * po.quantity).toLocaleString() : '-'}</td>
                <td className="px-4 py-2">{po.supplier?.name ?? '-'}</td>
                <td className="px-4 py-2 text-xs whitespace-nowrap" data-testid="order-type-cell">
                  <span className={`px-2 py-1 rounded font-medium ${po.orderType === 'PROVISIONAL' ? 'bg-purple-100 text-purple-800' : po.orderType === 'FIRM' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>{orderTypeLabel(po.orderType)}</span>
                  {orderTypeNote(po.orderType) && <span className="block mt-1 text-amber-700">{orderTypeNote(po.orderType)}</span>}
                </td>
                <td className="px-4 py-2 max-w-[200px] truncate" title={po.notes ?? ''}>{po.notes ?? '-'}</td>
                <td className="px-4 py-2">{statusBadge(po.status)}</td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <button
                    className="text-emerald-700"
                    onClick={async () => {
                      try {
                        const doc = await getPurchaseOrderDocument(po.id);
                        downloadBase64File(doc.base64, doc.filename);
                      } catch (err: any) {
                        toast.error(getErrorMessage(err, '발주서 발행에 실패했습니다.'));
                      }
                    }}
                  >발주서</button>
                  {po.status === 'PENDING' && (
                    <>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" onClick={() => handleReceive(po.id)}>입고 처리</button>
                      <button className="text-red-600" onClick={() => handleCancel(po.id)}>취소</button>
                      <button className="text-amber-700" onClick={() => setEditing({ order: po, pendingCount: 1 })}>수정</button>
                    </>
                  )}
                  <button className="text-purple-600" onClick={() => setPackingReceiptsFor(po)}>포장내역</button>
                </td>
              </tr>
              {po.lines && po.lines.length > 0 && (
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <td className="px-4 py-1" colSpan={10}>
                    색상/사이즈별: {po.lines.map((l, i) => <span key={i} className="mr-3">{l.color || '-'}/{l.size || '-'} × {l.qty}</span>)}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <PurchaseOrderEditModal
          order={editing.order}
          pendingCount={editing.pendingCount}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setPanelRefresh((n) => n + 1); loadPurchaseOrders(); }}
        />
      )}

      {packingReceiptsFor && (
        <PackingReceiptsModal
          purchaseOrderId={packingReceiptsFor.id}
          purchaseOrderLabel={`발주 #${packingReceiptsFor.id} (${packingReceiptsFor.item?.name ?? `#${packingReceiptsFor.itemId}`})`}
          onClose={() => setPackingReceiptsFor(null)}
        />
      )}

      {showQuickCreateSupplier && (
        <SupplierQuickCreateModal
          onCreated={(created) => {
            // 발주 폼의 나머지 입력값(품목/수량/단가/비고 등)은 전혀 건드리지 않고
            // 공급업체 선택란만 채운다 — autofilled는 "이력으로 자동 채움"이 아니라
            // 사람이 방금 등록/선택한 값이므로 false로 둔다(기존 수동 선택과 동일하게 취급).
            setSupplier({ id: created.id, code: created.code, name: created.name });
            setAutofilled(false);
          }}
          onClose={() => setShowQuickCreateSupplier(false)}
        />
      )}
        </>
      )}
    </div>
  );
};
