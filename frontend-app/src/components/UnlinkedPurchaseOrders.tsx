import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getUnlinkedPurchaseOrders,
  linkPurchaseOrderStyle,
  linkPurchaseOrderStyleBulk,
  type UnlinkedPurchaseOrderRow,
} from '../api/purchaseOrders.service';
import { getErrorMessage } from '../utils/errorMessage';
import { buildInitialChosenStyleNo, resolveStyleLinkTargets, filterUnlinkedRows } from '../utils/unlinkedPurchaseOrders';

const ATTRIBUTION_LABEL: Record<UnlinkedPurchaseOrderRow['attribution'], string> = {
  AUTO: '자동 귀속 가능(후보 1개)',
  AMBIGUOUS: '모호(후보 2개 이상)',
  ORPHAN: '연결할 스타일 없음',
};

// PR-196: 기존 발주(스타일 미연결)를 스타일에 연결하는 사람이 하는 정리 도구 — 자동
// 일괄 배정은 하지 않는다. 후보가 1개(AUTO)면 그 스타일을 미리 골라 두지만, 사람이
// 체크하고 [선택 항목 연결 확정]을 눌러야만 저장된다. 한 발주는 한 스타일에만 연결할
// 수 있다(여러 스타일로 나누는 기능은 만들지 않음).
export const UnlinkedPurchaseOrders: React.FC = () => {
  const [rows, setRows] = useState<UnlinkedPurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [chosenStyleNo, setChosenStyleNo] = useState<Map<number, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [itemKeyword, setItemKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'PENDING' | 'RECEIVED'>('');
  const [attributionFilter, setAttributionFilter] = useState<'' | UnlinkedPurchaseOrderRow['attribution']>('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUnlinkedPurchaseOrders();
      const list = Array.isArray(res) ? res : ((res as any)?.data ?? []);
      setRows(list);
      // AUTO 행은 후보 스타일을 미리 골라 둔다(저장은 사람이 체크+버튼을 눌러야만).
      setChosenStyleNo(buildInitialChosenStyleNo(list));
      setSelected(new Set());
    } catch (err: any) {
      toast.error(getErrorMessage(err, '미연결 발주 목록을 불러오는 데 실패했습니다.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(
    () => filterUnlinkedRows(rows, { itemKeyword, status: statusFilter, attribution: attributionFilter }),
    [rows, itemKeyword, statusFilter, attributionFilter],
  );

  const toggleSelected = (poId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId); else next.add(poId);
      return next;
    });

  const setStyleForRow = (poId: number, styleNo: string) =>
    setChosenStyleNo((prev) => {
      const next = new Map(prev);
      if (styleNo) next.set(poId, styleNo); else next.delete(poId);
      return next;
    });

  const confirmSelected = async () => {
    const { targets, hasIncompleteSelection } = resolveStyleLinkTargets(selected, chosenStyleNo);
    if (targets.length === 0) {
      toast.error('연결할 스타일을 고르고, 포함할 행을 체크해 주세요.');
      return;
    }
    if (hasIncompleteSelection) {
      toast.error('체크된 행 중 스타일이 지정되지 않은 행이 있습니다 — 모두 스타일을 고르거나 체크를 해제해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      if (targets.length === 1) {
        await linkPurchaseOrderStyle(targets[0].poId, targets[0].styleNo);
      } else {
        await linkPurchaseOrderStyleBulk(targets);
      }
      toast.success(`${targets.length}건을 스타일에 연결했습니다.`);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 연결에 실패했습니다. 아무것도 저장되지 않았습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">
        기존 발주(스타일 미연결)를 스타일에 연결하는 화면입니다. 한 발주를 여러 스타일에 나눌 수 없습니다 —
        나눠야 하면 발주를 스타일별로 새로 만들어 주세요.
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목 검색</label>
          <input
            className="border rounded px-2 py-1 text-sm w-56"
            placeholder="품목명/코드"
            value={itemKeyword}
            onChange={(e) => setItemKeyword(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">상태</label>
          <select className="border rounded px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="">전체</option>
            <option value="PENDING">미입고</option>
            <option value="RECEIVED">입고완료</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">귀속 종류</label>
          <select className="border rounded px-2 py-1 text-sm" value={attributionFilter} onChange={(e) => setAttributionFilter(e.target.value as any)}>
            <option value="">전체</option>
            <option value="AUTO">자동 귀속 가능</option>
            <option value="AMBIGUOUS">모호</option>
            <option value="ORPHAN">연결할 스타일 없음</option>
          </select>
        </div>
        <button className="text-sm text-blue-600 hover:underline" onClick={load}>새로고침</button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-gray-500">스타일 미연결 발주가 없습니다.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">포함</th>
                <th className="p-2 text-left">품목</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2 text-left">상태</th>
                <th className="p-2 text-left">업체</th>
                <th className="p-2 text-left">발주일</th>
                <th className="p-2 text-left">귀속</th>
                <th className="p-2 text-left">연결할 스타일</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.poId} className="border-t">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      disabled={r.attribution === 'ORPHAN'}
                      checked={selected.has(r.poId)}
                      onChange={() => toggleSelected(r.poId)}
                      aria-label={`${r.itemName ?? r.poId} 포함`}
                    />
                  </td>
                  <td className="p-2">{r.itemName ?? `#${r.itemId}`} <span className="text-xs text-gray-400">{r.itemCode}</span></td>
                  <td className="p-2 text-right">{r.quantity}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.supplierName ?? '-'}</td>
                  <td className="p-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="p-2 text-xs">{ATTRIBUTION_LABEL[r.attribution]}</td>
                  <td className="p-2">
                    {r.attribution === 'ORPHAN' ? (
                      <span className="text-xs text-gray-400">연결할 스타일 없음 — BOM 확인</span>
                    ) : (
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={chosenStyleNo.get(r.poId) ?? ''}
                        onChange={(e) => setStyleForRow(r.poId, e.target.value)}
                        aria-label={`${r.itemName ?? r.poId} 연결할 스타일`}
                      >
                        <option value="">(직접 선택)</option>
                        {r.candidateStyles.map((c) => (
                          <option key={c.styleNo} value={c.styleNo}>{c.styleNo}{c.styleName ? ` — ${c.styleName}` : ''}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={submitting || selected.size === 0}
          onClick={confirmSelected}
        >{submitting ? '연결 중...' : `선택 항목 연결 확정 (${selected.size}건)`}</button>
      </div>
    </div>
  );
};
