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
  // MERGE-2: CMT 발주는 단가가 null일 수 있다(PR-173) — 0으로 채워 보여주면 "0원"으로
  // 오해하기 쉬워 빈 칸으로 보여준다. 건드리지 않고 저장하면 undefined로 보내 기존 값(null
  // 포함) 그대로 유지한다(update()의 "undefined면 안 건드림" 규칙과 동일).
  const [unitPrice, setUnitPrice] = useState<number | null>(order.unitPrice != null ? Number(order.unitPrice) : null);
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
      await updatePurchaseOrder(order.id, { quantity, unitPrice: unitPrice ?? undefined, notes });
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
          <input type="number" min={0} step="any" className="border rounded px-3 py-2 mt-1" placeholder="CMT는 비워둘 수 있음" value={unitPrice ?? ''} onChange={(e) => setUnitPrice(e.target.value === '' ? null : Number(e.target.value))} aria-label="수정 단가" />
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
