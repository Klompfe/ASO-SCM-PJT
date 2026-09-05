import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  type CreatePurchaseOrder,
  type PurchaseOrder,
} from '../api/purchaseOrders.service';
import { getSuppliers, type Supplier } from '../api/suppliers.service';
import { getItems, type Item } from '../api/items.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreatePurchaseOrder = { supplierId: 0, itemId: 0, quantity: 1, unitPrice: 0 };

interface PurchaseOrdersManagerProps {
  prefillItemId?: number | null;
  onPrefillConsumed?: () => void;
}

export const PurchaseOrdersManager: React.FC<PurchaseOrdersManagerProps> = ({ prefillItemId, onPrefillConsumed }) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPo, setNewPo] = useState<CreatePurchaseOrder>(emptyForm);
  const [filterSupplierId, setFilterSupplierId] = useState(0);
  const [filterItemId, setFilterItemId] = useState(0);

  const loadPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPurchaseOrders({
        supplierId: filterSupplierId || undefined,
        itemId: filterItemId || undefined,
      });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setPurchaseOrders(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filterSupplierId, filterItemId]);

  const loadOptions = useCallback(async () => {
    try {
      // limit은 PaginationQueryDto의 @Max(100) 제약을 넘으면 400이 나므로 최대치인 100까지만.
      const [supplierRes, itemRes] = await Promise.all([getSuppliers(), getItems({ limit: 100 })]);
      const supplierData = Array.isArray(supplierRes) ? supplierRes : (supplierRes?.data ?? []);
      // GET /items는 페이지네이션 객체({items, meta})를 반환한다(TransformInterceptor 미등록,
      // Shipments/Suppliers처럼 배열을 바로 주는 API와 다름) — items 필드에서 꺼내야 한다.
      const itemData = Array.isArray(itemRes) ? itemRes : (itemRes?.items ?? []);
      setSuppliers(supplierData);
      setItems(itemData);
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체/품목 목록을 불러오는 데 실패했습니다.'));
    }
  }, []);

  useEffect(() => {
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Items(자재명세) 화면에서 "발주하기"로 넘어온 경우, 해당 품목을 폼에 미리 선택해 둔다.
  useEffect(() => {
    if (prefillItemId) {
      setNewPo((prev) => ({ ...prev, itemId: prefillItemId }));
      onPrefillConsumed?.();
    }
  }, [prefillItemId, onPrefillConsumed]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPo.supplierId || !newPo.itemId) {
      setError('공급업체와 품목을 선택해 주세요.');
      return;
    }
    if (!newPo.unitPrice || newPo.unitPrice <= 0) {
      setError('품목 단가를 입력해 주세요.');
      return;
    }
    try {
      await createPurchaseOrder(newPo);
      toast.success('발주가 생성되었습니다.');
      setNewPo(emptyForm);
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

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">공급업체</label>
          <select className="border border-gray-300 rounded px-3 py-2 w-56" value={newPo.supplierId} onChange={(e) => setNewPo({ ...newPo, supplierId: Number(e.target.value) })}>
            <option value={0}>선택하세요</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목</label>
          <select className="border border-gray-300 rounded px-3 py-2 w-56" value={newPo.itemId} onChange={(e) => setNewPo({ ...newPo, itemId: Number(e.target.value) })}>
            <option value={0}>선택하세요</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">수량</label>
          <input type="number" min={1} className="border border-gray-300 rounded px-3 py-2 w-32" value={newPo.quantity} onChange={(e) => setNewPo({ ...newPo, quantity: Number(e.target.value) })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">단가</label>
          <input type="number" min={0} step="0.01" className="border border-gray-300 rounded px-3 py-2 w-32" value={newPo.unitPrice} onChange={(e) => setNewPo({ ...newPo, unitPrice: Number(e.target.value) })} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700" disabled={loading}>발주 생성</button>
      </form>

      <div className="flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">업체별 조회</label>
          <select className="border border-gray-300 rounded px-3 py-2 w-56" value={filterSupplierId} onChange={(e) => setFilterSupplierId(Number(e.target.value))}>
            <option value={0}>전체 업체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목별 조회</label>
          <select className="border border-gray-300 rounded px-3 py-2 w-56" value={filterItemId} onChange={(e) => setFilterItemId(Number(e.target.value))}>
            <option value={0}>전체 품목</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
            ))}
          </select>
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
                <td className="px-4 py-2">{statusBadge(po.status)}</td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  {po.status === 'PENDING' && (
                    <>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" onClick={() => handleReceive(po.id)}>입고 처리</button>
                      <button className="text-red-600" onClick={() => handleCancel(po.id)}>취소</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
