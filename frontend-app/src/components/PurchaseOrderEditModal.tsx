import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { updatePurchaseOrder, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getErrorMessage } from '../utils/errorMessage';

interface PurchaseOrderEditModalProps {
  order: PurchaseOrder;
  pendingCount: number;
  onSaved: () => void;
  onClose: () => void;
}

// PR-177: "수정하기" 버튼이 여는 기존 발주 수정 폼. 미입고(PENDING) 발주만 수정 대상이다.
// 여러 건이 대기 중이면 가장 최근 것을 열고, 나머지 건수는 안내로만 보여준다(발주 목록에서 확인).
export const PurchaseOrderEditModal: React.FC<PurchaseOrderEditModalProps> = ({ order, pendingCount, onSaved, onClose }) => {
  const [quantity, setQuantity] = useState(order.quantity);
  const [unitPrice, setUnitPrice] = useState<number>(Number(order.unitPrice ?? 0));
  const [notes, setNotes] = useState(order.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePurchaseOrder(order.id, { quantity, unitPrice, notes });
      toast.success(`발주 #${order.id}이(가) 수정되었습니다.`);
      onSaved();
    } catch (err: any) {
      setError(getErrorMessage(err, '발주 수정에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <form onSubmit={save} className="bg-white p-6 rounded w-full max-w-md space-y-3">
        <h3 className="text-lg font-bold">발주 #{order.id} 수정</h3>
        <p className="text-sm text-gray-500">{order.item?.name ?? `품목 #${order.itemId}`} · 미입고 발주만 수정할 수 있습니다.</p>
        {pendingCount > 1 && (
          <p className="text-xs text-blue-700" data-testid="pending-count-note">
            이 자재의 미입고 발주가 {pendingCount}건 있어 가장 최근 발주(#{order.id})를 열었습니다. 나머지는 발주 목록에서 확인하세요.
          </p>
        )}
        {error && <div className="p-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <label className="flex flex-col text-sm text-gray-600">수량
          <input type="number" min={1} className="border rounded px-3 py-2 mt-1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} aria-label="수정 수량" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">단가
          <input type="number" min={0} step="any" className="border rounded px-3 py-2 mt-1" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} aria-label="수정 단가" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">비고
          <input className="border rounded px-3 py-2 mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="수정 비고" />
        </label>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">{submitting ? '저장 중...' : '저장'}</button>
          <button type="button" className="bg-gray-500 text-white px-4 py-2 rounded" onClick={onClose}>취소</button>
        </div>
      </form>
    </div>
  );
};
