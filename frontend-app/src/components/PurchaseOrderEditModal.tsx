import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { updatePurchaseOrder, type PurchaseOrder, type PurchaseOrderLine } from '../api/purchaseOrders.service';
import { getErrorMessage } from '../utils/errorMessage';
import { sumPurchaseOrderLines } from '../utils/purchaseOrderForm';

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
  // PR-185: 스타일 연결/해제/변경 — 비우면 연결 해제, 바꾸지 않으면 서버에 아예 안 보낸다.
  const [styleNoInput, setStyleNoInput] = useState(order.styleNo ?? '');
  // MERGE-3(PR-176×177): 생성 폼과 같은 색상/사이즈 줄 편집 — 기존 줄이 있으면 채워서 보여준다.
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>(
    (order.lines ?? []).map((l) => ({ color: l.color ?? '', size: l.size ?? '', qty: l.qty })),
  );
  const hadLinesOriginally = (order.lines?.length ?? 0) > 0;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLines = poLines.length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (hasLines && poLines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) {
      setError('색상/사이즈 줄의 수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (!hasLines && (!Number.isInteger(quantity) || quantity < 1)) {
      setError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      // 줄이 있거나(현재) 원래 있었던(지금 전부 지운 경우도 서버에 전달해야 실제로 지워짐) 경우에만
      // lines를 보낸다 — 줄을 아예 다룬 적 없는 발주는 건드리지 않는다(기존 단순 발주 동작 유지).
      const linesPayload = hasLines || hadLinesOriginally
        ? poLines.map((l) => ({ color: l.color || undefined, size: l.size || undefined, qty: Number(l.qty) }))
        : undefined;
      const styleNoChanged = styleNoInput.trim() !== (order.styleNo ?? '');
      const res = await updatePurchaseOrder(order.id, {
        quantity: hasLines ? sumPurchaseOrderLines(poLines) : quantity,
        unitPrice: unitPrice ?? undefined,
        notes,
        lines: linesPayload,
        ...(styleNoChanged ? { styleNo: styleNoInput.trim() === '' ? null : styleNoInput.trim() } : {}),
      });
      (res?.warnings ?? []).forEach((w: string) => toast(w, { icon: '⚠️' }));
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
        <label className="flex flex-col text-sm text-gray-600">수량{hasLines && <span className="text-xs text-gray-400"> (색상/사이즈 줄 합계로 자동 계산)</span>}
          <input
            type="number"
            min={1}
            className="border rounded px-3 py-2 mt-1 disabled:bg-gray-100"
            value={hasLines ? sumPurchaseOrderLines(poLines) : quantity}
            disabled={hasLines}
            onChange={(e) => setQuantity(Number(e.target.value))}
            aria-label="수정 수량"
          />
        </label>
        <label className="flex flex-col text-sm text-gray-600">단가
          <input type="number" min={0} step="any" className="border rounded px-3 py-2 mt-1" placeholder="CMT는 비워둘 수 있음" value={unitPrice ?? ''} onChange={(e) => setUnitPrice(e.target.value === '' ? null : Number(e.target.value))} aria-label="수정 단가" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">비고
          <input className="border rounded px-3 py-2 mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="수정 비고" />
        </label>
        <label className="flex flex-col text-sm text-gray-600">연결 스타일(선택, 비우면 연결 해제)
          <input className="border rounded px-3 py-2 mt-1" placeholder="예: MB62SLM103Z" value={styleNoInput} onChange={(e) => setStyleNoInput(e.target.value)} aria-label="연결 스타일" />
        </label>
        <details className="border border-gray-200 rounded p-2 bg-white" open={hasLines}>
          <summary className="cursor-pointer text-sm text-gray-700">색상/사이즈별 상세 (선택){hasLines ? ` — ${poLines.length}줄, 합계 ${sumPurchaseOrderLines(poLines)}` : ''}</summary>
          <div className="mt-2 space-y-2">
            {poLines.map((l, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <input className="border border-gray-300 rounded px-2 py-1 w-28" placeholder="색상(자유입력)" aria-label={`색상 ${idx + 1}`} value={l.color ?? ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} />
                <input className="border border-gray-300 rounded px-2 py-1 w-24" placeholder="사이즈(자유입력)" aria-label={`사이즈 ${idx + 1}`} value={l.size ?? ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, size: e.target.value } : x)))} />
                <input type="number" min={1} className="border border-gray-300 rounded px-2 py-1 w-20" placeholder="수량" aria-label={`수량 ${idx + 1}`} value={l.qty || ''} onChange={(e) => setPoLines(poLines.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))} />
                <button type="button" className="text-red-600 text-sm" onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}>삭제</button>
              </div>
            ))}
            <button type="button" className="text-blue-600 text-sm" onClick={() => setPoLines([...poLines, { color: '', size: '', qty: 0 }])}>+ 줄 추가</button>
          </div>
        </details>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">{submitting ? '저장 중...' : '저장'}</button>
          <button type="button" className="bg-gray-500 text-white px-4 py-2 rounded" onClick={onClose}>취소</button>
        </div>
      </form>
    </div>
  );
};
