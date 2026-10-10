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
  type PurchaseOrderLine,
} from '../api/purchaseOrders.service';
import { downloadBase64File } from '../utils/fileDownload';
import { getSuppliers } from '../api/suppliers.service';
import { getItems, getItem } from '../api/items.service';
import { getMasterStyles } from '../api/styles.service';
import { getStyleRequirements } from '../api/workOrders.service';
import { getBrandPriceRules } from '../api/brandPriceRules.service';
import { getErrorMessage } from '../utils/errorMessage';
import { SearchSelectField } from './SearchSelectField';
import { StyleShortagePanel } from './StyleShortagePanel';
import {
  pickLatestOrderDefaults, resolveAutofill, buildEditableOrderByItem, isUnitPriceRequired,
  sumPurchaseOrderLines, suggestStyleLinkedQuantity, suggestUnlinkedQuantity, trackBadgeLabel, isQuantityFilled, type SupplierRef,
} from '../utils/purchaseOrderForm';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';
import { PackingReceiptsModal } from './PackingReceiptsModal';
import { PurchaseOrderEditModal } from './PurchaseOrderEditModal';
import { ShipmentsManager } from './ShipmentsManager';
import { SupplierQuickCreateModal } from './SupplierQuickCreateModal';
import { categoryFilterState, supplierSearchCategoryId } from '../utils/materialCategories';
import { PriceReferenceBlock, type PriceReferenceValue } from './PriceReferenceBlock';

interface ItemRef { id: number; name: string; code: string; categoryId?: number | null; unit?: string | null }
interface StyleOption { styleNo: string; overview?: { styleName?: string | null } | null }

const emptyForm: CreatePurchaseOrder = { supplierId: 0, itemId: 0, unitPrice: 0 };
const emptyPriceRef: PriceReferenceValue = { usd: null, source: null, note: null };

interface PurchaseOrdersManagerProps {
  prefillItemId?: number | null;
  onPrefillConsumed?: () => void;
}

export const PurchaseOrdersManager: React.FC<PurchaseOrdersManagerProps> = ({ prefillItemId, onPrefillConsumed }) => {
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
  // PR-180: 발주 구분 — 품목을 고르면 스타일 계약방식 제안을 미리 채우되, 사람이 바꾸거나 직접 고른다.
  const [orderType, setOrderType] = useState<PurchaseOrderType | null>(null);
  const [orderTypeHint, setOrderTypeHint] = useState<string | null>(null);
  const [panelRefresh, setPanelRefresh] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const itemRequestSeq = useRef(0);
  // 비동기 이력 조회가 끝난 시점의 "현재" 폼 값을 읽기 위한 ref(렌더마다 갱신)
  const formValuesRef = useRef({ supplier: null as SupplierRef | null, unitPrice: 0, autofilled: false });
  const [filterSupplier, setFilterSupplier] = useState<SupplierRef | null>(null);
  const [filterItem, setFilterItem] = useState<ItemRef | null>(null);
  // PR-185 A: 목록 트랙 필터 — 전체 / 스타일 연결 / 스타일 미연결.
  const [listTrack, setListTrack] = useState<'ALL' | 'STYLE' | 'ITEM_ONLY'>('ALL');
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
      });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setPurchaseOrders(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filterSupplier, filterItem, listTrack]);

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
  }, []);

  // 품목을 고르면 그 품목의 가장 최근 발주 이력으로 공급업체/단가를 미리 채운다(수정 가능). 이력이 없으면 공란.
  const selectItem = useCallback(async (picked: ItemRef | null, opts?: { quantityInput?: string }) => {
    setItem(picked);
    setAutofillNote(null);
    setItemProductionType(null);
    setPriceRef(emptyPriceRef);
    setPriceRefPackagingUnitLabel(null);
    if (opts?.quantityInput !== undefined) setQuantityInput(opts.quantityInput);
    if (!picked) {
      setOrderType(null);
      setOrderTypeHint(null);
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
      // 어떤 값이 자동 채움이고 어떤 값이 사용자가 넣은 값인지는 resolveAutofill(테스트된 순수 함수)이 정한다.
      const cur = formValuesRef.current;
      const next = resolveAutofill({ supplier: cur.supplier, unitPrice: cur.unitPrice, autofilled: cur.autofilled }, latest);
      setSupplier(next.supplier);
      setNewPo((prev) => ({ ...prev, unitPrice: next.unitPrice }));
      setAutofilled(next.autofilled);
      setAutofillNote(latest ? `최근 발주 #${latest.orderId}의 공급업체(${latest.supplier.name})/단가(${latest.unitPrice})를 채웠습니다. 필요하면 수정하세요.` : '이 품목의 발주 이력이 없어 공급업체/단가는 직접 선택해 주세요.');
    } catch {
      // 이력 조회 실패는 발주 자체를 막지 않는다 — 자동 채움만 건너뛴다.
    }
    try {
      const ctx = await getMaterialProductionContext(picked.id);
      if (seq !== itemRequestSeq.current) return;
      setItemProductionType(ctx.productionType);
    } catch {
      // 생산유형 조회 실패는 FOB와 동일(단가 필수)로 안전하게 처리 — itemProductionType은 null 그대로 둔다.
    }
  }, []);

  // 스타일 연결 트랙에서 BOM 자재를 고르면: 품목 선택(기존 로직)에 더해 수량을
  // 부족분(콘/롤 환산 포함, suggestStyleLinkedQuantity)으로 미리 채운다.
  // PR-187 C: rowOverride를 받을 수 있게 한다 — handlePickMaterial이 setStyleMaterialRows
  // 직후 바로 호출하면 styleMaterialRows state는 다음 렌더까지 갱신되지 않아(React의
  // 비동기 state 업데이트), 방금 고른 row를 못 찾고 수량이 비워지지 않는 버그가 있었다.
  const selectStyleMaterial = (picked: ItemRef | null, rowOverride?: MaterialRequirementRow) => {
    if (!picked) { void selectItem(null); return; }
    const row = rowOverride ?? styleMaterialRows.find((r) => r.itemId === picked.id);
    if (!row) { void selectItem(picked); return; }
    const sugg = suggestStyleLinkedQuantity(row);
    void selectItem({ ...picked, unit: sugg.unitLabel ?? undefined }, { quantityInput: sugg.quantity != null ? String(sugg.quantity) : '' });
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

  const handlePickMaterial = (row: MaterialRequirementRow, styleNo?: string) => {
    // PR-185: 소요량 화면에서 "이 자재로 발주하기"를 누르면 그 스타일도 함께 연결한다.
    if (styleNo) {
      setStyleSearch({ styleNo });
      setStyleMaterialRows([row]);
      selectStyleMaterial({ id: row.itemId, name: row.itemName, code: row.itemCode }, row);
    } else {
      // PR-187 C: 스타일 미연결 경로도 같은 원칙(종류 미지정 실/테이프는 미터 수량을
      // 추측해서 채우지 않는다)을 따른다 — 일반 자재는 기존처럼 ceil(부족)/최소 1.
      const qty = suggestUnlinkedQuantity(row);
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
  useEffect(() => {
    if (prefillItemId) {
      getItem(prefillItemId)
        .then((it) => selectItem({ id: it.id, name: it.name, code: it.code }))
        .catch((err) => setError(getErrorMessage(err, '품목 정보를 불러오지 못했습니다.')));
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillItemId, onPrefillConsumed]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supplier || !item) {
      setError('공급업체와 품목을 선택해 주세요.');
      return;
    }
    const hasLines = poLines.length > 0;
    // PR-185 B: 수량은 더 이상 기본값이 없다 — 라인이 없으면 반드시 입력해야 한다.
    if (!hasLines && !isQuantityFilled(quantityInput)) {
      setError('수량을 입력해 주세요(0보다 큰 숫자).');
      return;
    }
    if (isUnitPriceRequired(itemProductionType) && (!newPo.unitPrice || newPo.unitPrice <= 0)) {
      setError('품목 단가를 입력해 주세요.');
      return;
    }
    if (hasLines && poLines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) {
      setError('색상/사이즈 줄의 수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (!canCreateWithOrderType(orderType)) {
      setError('발주 구분(실발주/가발주)을 선택해 주세요.');
      return;
    }
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
      setPanelRefresh((n) => n + 1); // 스타일 부족 자재 표의 "이미 발주" 수량 갱신
      loadPurchaseOrders();
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 생성에 실패했습니다.'));
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
        editable={buildEditableOrderByItem(pendingOrders)}
        onEdit={(order, pendingCount) => setEditing({ order, pendingCount })}
        onBulkDone={() => { setPanelRefresh((n) => n + 1); loadPurchaseOrders(); loadPendingOrders(); }}
      />

      <form ref={formRef} onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg space-y-2">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일 연결(선택)</label>
            <SearchSelectField<StyleOption>
              value={styleSearch}
              onChange={(picked) => { setStyleSearch(picked); setItem(null); setQuantityInput(''); }}
              search={searchStyles}
              getKey={(s) => s.styleNo}
              getLabel={(s) => s.styleNo}
              ariaLabel="스타일 연결"
              placeholder="스타일 미연결(기본)"
              title="스타일 검색 — 고르면 그 스타일 BOM 자재만 선택할 수 있습니다"
              allowClear
              className="w-56"
            />
            {styleSearch && <span className="text-xs text-gray-400 mt-1">{styleRowsLoading ? '자재 목록 불러오는 중...' : `${styleMaterialRows.length}종 자재`}</span>}
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">품목(원자재){styleSearch && <span className="text-blue-600 font-normal"> — 이 스타일 BOM 자재만</span>}</label>
            <SearchSelectField<ItemRef>
              value={item}
              onChange={(picked) => { if (styleSearch) selectStyleMaterial(picked); else void selectItem(picked); }}
              search={styleSearch ? searchStyleMaterials : searchRawMaterials}
              getKey={(i) => i.id}
              getLabel={(i) => `${i.name} (${i.code})`}
              renderRow={(i) => (<span>{i.name} <span className="text-gray-400 text-xs">{i.code}</span></span>)}
              ariaLabel="품목"
              placeholder="품목 검색"
              title="품목(원자재) 검색"
              className="w-64"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">공급업체</label>
            <div className="flex items-stretch gap-1">
              <SearchSelectField<SupplierRef>
                value={supplier}
                onChange={(picked) => { setSupplier(picked); setAutofilled(false); }}
                search={searchFormSuppliers}
                getKey={(x) => x.id}
                getLabel={(x) => `${x.name} (${x.code})`}
                renderRow={(x) => (<span>{x.name} <span className="text-gray-400 text-xs">{x.code}</span></span>)}
                ariaLabel="공급업체"
                placeholder="공급업체 검색"
                title="공급업체 검색"
                className="w-64"
              />
              <button
                type="button"
                onClick={() => setShowQuickCreateSupplier(true)}
                className="border border-gray-300 rounded px-2 text-sm text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                + 새 공급업체 등록
              </button>
            </div>
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
              type="number"
              min={1}
              className="border border-gray-300 rounded px-3 py-2 w-32 disabled:bg-gray-100"
              value={poLines.length > 0 ? sumPurchaseOrderLines(poLines) : quantityInput}
              readOnly={poLines.length > 0}
              required={poLines.length === 0}
              title={poLines.length > 0 ? '색상/사이즈 줄 합계로 자동 계산됩니다' : undefined}
              onChange={(e) => setQuantityInput(e.target.value)}
              aria-label="수량"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              단가{!isUnitPriceRequired(itemProductionType) && <span className="text-gray-400 font-normal"> (CMT — 선택, 선적서류 작성 시 입력 가능)</span>}
            </label>
            <input type="number" min={0} step="any" className="border border-gray-300 rounded px-3 py-2 w-32" value={newPo.unitPrice} onChange={(e) => { setNewPo({ ...newPo, unitPrice: Number(e.target.value) }); setAutofilled(false); }} aria-label="단가" />
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
        {autofillNote && <p className="text-xs text-blue-700" data-testid="autofill-note">{autofillNote}</p>}
        {orderTypeHint && <p className="text-xs text-gray-500" data-testid="order-type-hint">구분 제안: {orderTypeHint}</p>}
        {item && (
          <PriceReferenceBlock
            itemId={item.id}
            styleNo={styleSearch?.styleNo}
            brandName={styleSearch ? undefined : (brandOverride || undefined)}
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
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
                  <td className="px-4 py-1" colSpan={9}>
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
