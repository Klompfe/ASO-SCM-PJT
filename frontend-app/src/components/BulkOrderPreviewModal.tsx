import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPurchaseOrders, createPurchaseOrdersBulk, getOrderTypeSuggestion } from '../api/purchaseOrders.service';
import { canCreateWithOrderType, type PurchaseOrderType } from '../utils/purchaseOrderType';
import { getSuppliers } from '../api/suppliers.service';
import { getErrorMessage } from '../utils/errorMessage';
import { pickLatestOrderDefaults, resolveBulkSupplierId, isBulkRowReady, suggestedQuantity } from '../utils/purchaseOrderForm';

export interface BulkDraftSource {
  itemId: number;
  itemName: string;
  itemCode: string;
  shortageQty: number;
  hasEditablePending: boolean;
}

interface Draft {
  itemId: number;
  itemName: string;
  itemCode: string;
  include: boolean;
  supplierId: number | null;
  candidateSupplierIds: number[];
  quantity: number;
  unitPrice: number | null;
  note: string | null;
  // PR-180: 발주 구분(제안값으로 미리 채우고 사람이 확정한다).
  orderType: PurchaseOrderType | null;
  orderTypeReason: string | null;
}

interface Props {
  sources: BulkDraftSource[];
  onDone: () => void;
  onClose: () => void;
}

// PR-179: 일괄발주 2단계 — 1) 자재별 초안(공급업체·수량·단가)을 보여주고 사람이 고친다
// 2) "일괄 생성"을 눌러야 한 번에 커밋한다. 공급업체는 이력상 후보가 하나일 때만 미리 고르고,
// 나머지는 추측하지 않고 직접 고르게 둔다.
export const BulkOrderPreviewModal: React.FC<Props> = ({ sources, onDone, onClose }) => {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [supRes, histories, suggestions] = await Promise.all([
        getSuppliers(),
        Promise.all(sources.map((s) => getPurchaseOrders({ itemId: s.itemId }).catch(() => []))),
        Promise.all(sources.map((s) => getOrderTypeSuggestion(s.itemId).catch(() => null))),
      ]);
      if (cancelled) return;
      setSuppliers(Array.isArray(supRes) ? supRes : (supRes?.data ?? []));
      const built: Draft[] = sources.map((s, i) => {
        const orders = Array.isArray(histories[i]) ? histories[i] : (histories[i]?.data ?? []);
        const latest = pickLatestOrderDefaults(orders);
        const candidates: number[] = [...new Set<number>(orders.filter((o: any) => o.supplier).map((o: any) => Number(o.supplier.id)))];
        return {
          itemId: s.itemId,
          itemName: s.itemName,
          itemCode: s.itemCode,
          include: !s.hasEditablePending,
          supplierId: resolveBulkSupplierId(candidates),
          candidateSupplierIds: candidates,
          quantity: suggestedQuantity(s.shortageQty),
          unitPrice: latest ? latest.unitPrice : null,
          note: s.hasEditablePending ? '이미 미입고 발주가 있어 기본 제외 — 필요하면 포함' : null,
          orderType: suggestions[i]?.orderType ?? null,
          orderTypeReason: suggestions[i]?.reason ?? null,
        };
      });
      setDrafts(built);
    })();
    return () => { cancelled = true; };
  }, [sources]);

  const update = (itemId: number, patch: Partial<Draft>) =>
    setDrafts((prev) => (prev ?? []).map((d) => (d.itemId === itemId ? { ...d, ...patch } : d)));

  const included = (drafts ?? []).filter((d) => d.include);
  const readyCount = included.filter((d) => isBulkRowReady({ supplierId: d.supplierId, quantity: d.quantity, unitPrice: d.unitPrice }) && canCreateWithOrderType(d.orderType)).length;

  const commit = async () => {
    if (included.length === 0) {
      toast.error('포함된 자재가 없습니다.');
      return;
    }
    if (readyCount !== included.length) {
      toast.error('공급업체·구분·수량·단가가 모두 채워지지 않은 행이 있습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await createPurchaseOrdersBulk(included.map((d) => ({
        supplierId: d.supplierId as number,
        itemId: d.itemId,
        quantity: d.quantity,
        unitPrice: d.unitPrice as number,
        orderType: d.orderType as PurchaseOrderType,
      })));
      toast.success(`${included.length}건의 발주가 생성되었습니다.`);
      onDone();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '일괄발주에 실패했습니다. 아무 발주도 생성되지 않았습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-11/12 max-w-4xl max-h-[90vh] overflow-y-auto space-y-3">
        <h3 className="text-lg font-bold">일괄발주 미리보기 ({sources.length}개 자재)</h3>
        <p className="text-sm text-gray-500">
          내용을 확인하고 고친 뒤 <b>일괄 생성</b>을 누르면 한 번에 발주가 만들어집니다. 하나라도 틀리면 아무것도 생성되지 않습니다.
        </p>
        {drafts === null ? (
          <p className="text-sm text-gray-500">후보 공급업체와 최근 단가를 불러오는 중...</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">포함</th>
                <th className="p-2 text-left">자재</th>
                <th className="p-2 text-left">공급업체</th>
                <th className="p-2 text-left">구분</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2 text-right">단가</th>
                <th className="p-2 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.itemId} className="border-t">
                  <td className="p-2">
                    <input type="checkbox" checked={d.include} onChange={(e) => update(d.itemId, { include: e.target.checked })} aria-label={`${d.itemName} 포함`} />
                  </td>
                  <td className="p-2">{d.itemName} <span className="text-xs text-gray-400">{d.itemCode}</span></td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1 w-56"
                      value={d.supplierId ?? ''}
                      onChange={(e) => update(d.itemId, { supplierId: e.target.value ? Number(e.target.value) : null })}
                      aria-label={`${d.itemName} 공급업체`}
                    >
                      <option value="">(직접 선택)</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{d.candidateSupplierIds.includes(s.id) ? ' · 이력' : ''}</option>
                      ))}
                    </select>
                    {d.candidateSupplierIds.length > 1 && (
                      <div className="text-xs text-amber-700">이력 공급업체 {d.candidateSupplierIds.length}곳 — 직접 고르세요</div>
                    )}
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1 w-36"
                      value={d.orderType ?? ''}
                      onChange={(e) => update(d.itemId, { orderType: e.target.value === '' ? null : (e.target.value as PurchaseOrderType) })}
                      aria-label={`${d.itemName} 구분`}
                    >
                      <option value="">구분 선택</option>
                      <option value="FIRM">실발주(FOB)</option>
                      <option value="PROVISIONAL">가발주(CMT)</option>
                    </select>
                    {d.orderTypeReason && <div className="text-xs text-gray-500 max-w-[14rem]">{d.orderTypeReason}</div>}
                  </td>
                  <td className="p-2 text-right">
                    <input type="number" min={1} className="border rounded px-2 py-1 w-20 text-right" value={d.quantity} onChange={(e) => update(d.itemId, { quantity: Number(e.target.value) })} aria-label={`${d.itemName} 수량`} />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="border rounded px-2 py-1 w-24 text-right"
                      value={d.unitPrice ?? ''}
                      placeholder="필수"
                      onChange={(e) => update(d.itemId, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      aria-label={`${d.itemName} 단가`}
                    />
                  </td>
                  <td className="p-2 text-xs text-gray-500">{d.note ?? (d.unitPrice != null ? '최근 발주 단가' : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-gray-600">포함 {included.length}건 · 확인 완료 {readyCount}건</span>
          <div className="flex gap-2">
            <button className="bg-gray-500 text-white px-4 py-2 rounded" onClick={onClose}>취소</button>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={submitting || drafts === null || included.length === 0 || readyCount !== included.length}
              onClick={commit}
            >
              {submitting ? '생성 중...' : `일괄 생성 (${included.length}건)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
