import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  type CreatePurchaseOrder,
  type PurchaseOrder,
} from '../api/purchaseOrders.service';
import { getSuppliers } from '../api/suppliers.service';
import { getItems, getItem } from '../api/items.service';
import { getErrorMessage } from '../utils/errorMessage';
import { SearchSelectField } from './SearchSelectField';
import { StyleShortagePanel } from './StyleShortagePanel';
import { pickLatestOrderDefaults, resolveAutofill, suggestedQuantity, type SupplierRef } from '../utils/purchaseOrderForm';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';
import { PackingReceiptsModal } from './PackingReceiptsModal';
import { ShipmentsManager } from './ShipmentsManager';

interface ItemRef { id: number; name: string; code: string }

const emptyForm: CreatePurchaseOrder = { supplierId: 0, itemId: 0, quantity: 1, unitPrice: 0 };

interface PurchaseOrdersManagerProps {
  prefillItemId?: number | null;
  onPrefillConsumed?: () => void;
}

export const PurchaseOrdersManager: React.FC<PurchaseOrdersManagerProps> = ({ prefillItemId, onPrefillConsumed }) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPo, setNewPo] = useState<CreatePurchaseOrder>(emptyForm);
  // PR-126: 공급업체/품목은 <select>(최초 100개만 불러와 그 밖의 품목은 선택 불가)가 아니라 서버 검색 선택이다.
  const [supplier, setSupplier] = useState<SupplierRef | null>(null);
  const [item, setItem] = useState<ItemRef | null>(null);
  // 공급업체/단가가 최근 발주 이력으로 자동 채워진 상태인지(다른 품목으로 바꿀 때 이전 자동값을 남기지 않기 위함)
  const [autofilled, setAutofilled] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);
  const [panelRefresh, setPanelRefresh] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const itemRequestSeq = useRef(0);
  // 비동기 이력 조회가 끝난 시점의 "현재" 폼 값을 읽기 위한 ref(렌더마다 갱신)
  const formValuesRef = useRef({ supplier: null as SupplierRef | null, unitPrice: 0, autofilled: false });
  const [filterSupplier, setFilterSupplier] = useState<SupplierRef | null>(null);
  const [filterItem, setFilterItem] = useState<ItemRef | null>(null);
  // PR-074: 포장내역은 발주 하위 흐름이라 별도 탭이 아니라 발주 행에서 모달로 연다.
  const [packingReceiptsFor, setPackingReceiptsFor] = useState<PurchaseOrder | null>(null);
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
      });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setPurchaseOrders(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filterSupplier, filterItem]);

  formValuesRef.current = { supplier, unitPrice: newPo.unitPrice, autofilled };

  // 서버 검색(검색어마다 조회) — 100건 캡이 없다. 품목은 원자재만(완제품 Item과 섞이지 않게), 한 번에 20건.
  const searchSuppliers = useCallback(async (keyword: string): Promise<SupplierRef[]> => {
    const res = await getSuppliers(keyword ? { keyword } : undefined);
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    return list.slice(0, 30);
  }, []);
  const searchRawMaterials = useCallback(async (keyword: string): Promise<ItemRef[]> => {
    const res = await getItems({ keyword: keyword || undefined, type: 'RAW_MATERIAL', limit: 20 });
    return Array.isArray(res) ? res : (res?.items ?? []);
  }, []);
  const searchAllItems = useCallback(async (keyword: string): Promise<ItemRef[]> => {
    const res = await getItems({ keyword: keyword || undefined, limit: 20 });
    return Array.isArray(res) ? res : (res?.items ?? []);
  }, []);

  // 품목을 고르면 그 품목의 가장 최근 발주 이력으로 공급업체/단가를 미리 채운다(수정 가능). 이력이 없으면 공란.
  const selectItem = useCallback(async (picked: ItemRef | null, opts?: { quantity?: number }) => {
    setItem(picked);
    setAutofillNote(null);
    if (opts?.quantity) setNewPo((prev) => ({ ...prev, quantity: opts.quantity as number }));
    if (!picked) return;
    const seq = ++itemRequestSeq.current;
    try {
      const res = await getPurchaseOrders({ itemId: picked.id });
      if (seq !== itemRequestSeq.current) return; // 그 사이 다른 품목을 골랐다
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
  }, []);

  const handlePickMaterial = (row: MaterialRequirementRow) => {
    void selectItem({ id: row.itemId, name: row.itemName, code: row.itemCode }, { quantity: suggestedQuantity(row.shortageQty) });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

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
    if (!newPo.unitPrice || newPo.unitPrice <= 0) {
      setError('품목 단가를 입력해 주세요.');
      return;
    }
    try {
      await createPurchaseOrder({ ...newPo, supplierId: supplier.id, itemId: item.id });
      toast.success('발주가 생성되었습니다.');
      setNewPo(emptyForm);
      setSupplier(null);
      setItem(null);
      setAutofilled(false);
      setAutofillNote(null);
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

      <StyleShortagePanel onPickMaterial={handlePickMaterial} refreshKey={panelRefresh} />

      <form ref={formRef} onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg space-y-2">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">품목(원자재)</label>
            <SearchSelectField<ItemRef>
              value={item}
              onChange={(picked) => { void selectItem(picked); }}
              search={searchRawMaterials}
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
            <SearchSelectField<SupplierRef>
              value={supplier}
              onChange={(picked) => { setSupplier(picked); setAutofilled(false); }}
              search={searchSuppliers}
              getKey={(x) => x.id}
              getLabel={(x) => `${x.name} (${x.code})`}
              renderRow={(x) => (<span>{x.name} <span className="text-gray-400 text-xs">{x.code}</span></span>)}
              ariaLabel="공급업체"
              placeholder="공급업체 검색"
              title="공급업체 검색"
              className="w-64"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">수량</label>
            <input type="number" min={1} className="border border-gray-300 rounded px-3 py-2 w-32" value={newPo.quantity} onChange={(e) => setNewPo({ ...newPo, quantity: Number(e.target.value) })} aria-label="수량" />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">단가</label>
            <input type="number" min={0} step="0.01" className="border border-gray-300 rounded px-3 py-2 w-32" value={newPo.unitPrice} onChange={(e) => { setNewPo({ ...newPo, unitPrice: Number(e.target.value) }); setAutofilled(false); }} aria-label="단가" />
          </div>
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
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">품목</th>
              <th className="px-4 py-2 text-right">수량</th>
              <th className="px-4 py-2 text-right">단가</th>
              <th className="px-4 py-2 text-right">총액</th>
              <th className="px-4 py-2 text-left">공급업체</th>
              <th className="px-4 py-2 text-left">비고</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {purchaseOrders.map((po) => (
              <tr key={po.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{po.item?.name ?? `#${po.itemId}`}</td>
                <td className="px-4 py-2 text-right">{po.quantity}</td>
                <td className="px-4 py-2 text-right">{po.unitPrice ?? '-'}</td>
                <td className="px-4 py-2 text-right">{po.unitPrice != null ? (po.unitPrice * po.quantity).toLocaleString() : '-'}</td>
                <td className="px-4 py-2">{po.supplier?.name ?? '-'}</td>
                <td className="px-4 py-2 max-w-[200px] truncate" title={po.notes ?? ''}>{po.notes ?? '-'}</td>
                <td className="px-4 py-2">{statusBadge(po.status)}</td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  {po.status === 'PENDING' && (
                    <>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" onClick={() => handleReceive(po.id)}>입고 처리</button>
                      <button className="text-red-600" onClick={() => handleCancel(po.id)}>취소</button>
                    </>
                  )}
                  <button className="text-purple-600" onClick={() => setPackingReceiptsFor(po)}>포장내역</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {packingReceiptsFor && (
        <PackingReceiptsModal
          purchaseOrderId={packingReceiptsFor.id}
          purchaseOrderLabel={`발주 #${packingReceiptsFor.id} (${packingReceiptsFor.item?.name ?? `#${packingReceiptsFor.itemId}`})`}
          onClose={() => setPackingReceiptsFor(null)}
        />
      )}
        </>
      )}
    </div>
  );
};
