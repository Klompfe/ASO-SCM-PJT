import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getImportShipmentPackingDetails,
  createImportShipmentPackingDetails,
  updateImportShipmentPackingDetail,
  deleteImportShipmentPackingDetail,
  type ImportShipmentPackingDetail,
  type CreatePackingDetailRow,
} from '../api/importShipments.service';
import { getGoodsReceipts, createGoodsReceipt, type GoodsReceipt } from '../api/goodsReceipts.service';
import { getErrorMessage } from '../utils/errorMessage';
import { GoodsReceiptPrintView } from './GoodsReceiptPrintView';

// PR-112: 엑셀(DPKL 시트)에서 자동으로 들어온 행과 수기입력 행을 구분해 보여준다.
const SourceBadge: React.FC<{ source: string }> = ({ source }) => (
  <span
    className={`px-2 py-0.5 rounded text-xs font-medium ${source === 'EXCEL' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}
  >
    {source === 'EXCEL' ? 'EXCEL' : 'MANUAL'}
  </span>
);

interface GoodsReceiptPanelProps {
  importShipmentId: number;
}

const emptyRow: CreatePackingDetailRow = { color: '', size: '', qty: 0 };

interface ReviewLine {
  detail: ImportShipmentPackingDetail;
  adjustedQty: number;
  adjustmentReason: string;
}

// PR-107: 색상·사이즈별 상세내역 관리 + 완제품입고증 작성. ImportShipmentManager의
// shipment 행을 펼치면 이 패널이 나온다 — 상세내역은 엑셀 업로드(PR-112, DPKL 시트
// 자동 파싱, source=EXCEL)로 들어오거나 화면에서 직접 입력(source=MANUAL)한다.
export const GoodsReceiptPanel: React.FC<GoodsReceiptPanelProps> = ({ importShipmentId }) => {
  const [details, setDetails] = useState<ImportShipmentPackingDetail[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);

  const [newRows, setNewRows] = useState<CreatePackingDetailRow[]>([{ ...emptyRow }]);
  const [addingDetails, setAddingDetails] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CreatePackingDetailRow>({ ...emptyRow });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reviewLines, setReviewLines] = useState<ReviewLine[] | null>(null);
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [printReceiptId, setPrintReceiptId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailsRes, receiptsRes] = await Promise.all([
        getImportShipmentPackingDetails(importShipmentId),
        getGoodsReceipts(importShipmentId),
      ]);
      setDetails(Array.isArray(detailsRes) ? detailsRes : []);
      setReceipts(Array.isArray(receiptsRes) ? receiptsRes : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상세내역/입고증을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [importShipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateNewRow = (idx: number, patch: Partial<CreatePackingDetailRow>) => {
    setNewRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addNewRow = () => setNewRows((prev) => [...prev, { ...emptyRow }]);
  const removeNewRow = (idx: number) => setNewRows((prev) => prev.filter((_, i) => i !== idx));

  const handleAddDetails = async () => {
    const validRows = newRows.filter((r) => r.color.trim() && r.size.trim() && r.qty > 0);
    if (validRows.length === 0) {
      toast.error('색상/사이즈/수량을 입력해 주세요.');
      return;
    }
    setAddingDetails(true);
    try {
      await createImportShipmentPackingDetails(importShipmentId, validRows);
      toast.success(`상세내역 ${validRows.length}건이 등록되었습니다.`);
      setNewRows([{ ...emptyRow }]);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상세내역 등록에 실패했습니다.'));
    } finally {
      setAddingDetails(false);
    }
  };

  const startEdit = (detail: ImportShipmentPackingDetail) => {
    setEditingId(detail.id);
    setEditDraft({ color: detail.color, size: detail.size, qty: detail.qty });
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (detailId: number) => {
    try {
      await updateImportShipmentPackingDetail(importShipmentId, detailId, editDraft);
      toast.success('상세내역이 수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };
  const handleDeleteDetail = async (detailId: number) => {
    if (!window.confirm('이 상세내역을 삭제하시겠습니까?')) return;
    try {
      await deleteImportShipmentPackingDetail(importShipmentId, detailId);
      toast.success('삭제되었습니다.');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(detailId);
        return next;
      });
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다. 이미 입고증에 쓰인 상세내역은 삭제할 수 없습니다.'));
    }
  };

  const toggleSelect = (detailId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(detailId)) next.delete(detailId);
      else next.add(detailId);
      return next;
    });
  };

  const handleOpenReview = () => {
    if (selectedIds.size === 0) {
      toast.error('입고증에 포함할 상세내역을 하나 이상 선택해 주세요.');
      return;
    }
    const selectedDetails = details.filter((d) => selectedIds.has(d.id));
    const alreadyWritten = selectedDetails.filter((d) => d.hasReceipt);
    if (alreadyWritten.length > 0) {
      const ok = window.confirm(
        `선택한 항목 중 ${alreadyWritten.length}건은 이미 입고증이 작성되어 있습니다. 그래도 새로 작성하시겠습니까?`,
      );
      if (!ok) return;
    }
    setReviewLines(
      selectedDetails.map((detail) => ({ detail, adjustedQty: Number(detail.qty), adjustmentReason: '' })),
    );
  };

  const updateReviewLine = (idx: number, patch: Partial<ReviewLine>) => {
    setReviewLines((prev) => (prev ? prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)) : prev));
  };

  const handleSaveReceipt = async () => {
    if (!reviewLines) return;
    for (const line of reviewLines) {
      const isAdjusted = Number(line.adjustedQty) !== Number(line.detail.qty);
      if (isAdjusted && !line.adjustmentReason.trim()) {
        toast.error(`색상 ${line.detail.color}/사이즈 ${line.detail.size}: 수량을 조정했다면 조정 사유를 입력해 주세요.`);
        return;
      }
    }
    setSaving(true);
    try {
      await createGoodsReceipt({
        importShipmentId,
        remark: remark || undefined,
        lines: reviewLines.map((line) => ({
          packingDetailId: line.detail.id,
          adjustedQty: line.adjustedQty,
          adjustmentReason: line.adjustmentReason || undefined,
        })),
      });
      toast.success('완제품입고증이 작성되었습니다.');
      setReviewLines(null);
      setSelectedIds(new Set());
      setRemark('');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '입고증 작성에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 p-3">불러오는 중...</div>;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">색상·사이즈별 상세내역</h4>
        {details.length === 0 ? (
          <p className="text-xs text-gray-400 mb-2">등록된 상세내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-1 pr-2 w-8"></th>
                <th className="py-1 pr-2">색상</th>
                <th className="py-1 pr-2">사이즈</th>
                <th className="py-1 pr-2">수량</th>
                <th className="py-1 pr-2">출처</th>
                <th className="py-1 pr-2">상태</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-1 pr-2">
                    <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} />
                  </td>
                  {editingId === d.id ? (
                    <>
                      <td className="py-1 pr-2">
                        <input className="border rounded px-1 py-0.5 text-sm w-20" value={editDraft.color} onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input className="border rounded px-1 py-0.5 text-sm w-16" value={editDraft.size} onChange={(e) => setEditDraft({ ...editDraft, size: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="number" className="border rounded px-1 py-0.5 text-sm w-20" value={editDraft.qty} onChange={(e) => setEditDraft({ ...editDraft, qty: Number(e.target.value) })} />
                      </td>
                      <td className="py-1 pr-2"><SourceBadge source={d.source} /></td>
                      <td className="py-1 pr-2"></td>
                      <td className="py-1 pr-2 space-x-1 whitespace-nowrap">
                        <button className="text-blue-600 text-xs" onClick={() => saveEdit(d.id)}>저장</button>
                        <button className="text-gray-500 text-xs" onClick={cancelEdit}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-2">{d.color}</td>
                      <td className="py-1 pr-2">{d.size}</td>
                      <td className="py-1 pr-2">{d.qty}</td>
                      <td className="py-1 pr-2"><SourceBadge source={d.source} /></td>
                      <td className="py-1 pr-2">
                        {d.hasReceipt ? (
                          <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">작성완료</span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 space-x-1 whitespace-nowrap">
                        <button className="text-blue-600 text-xs" onClick={() => startEdit(d)}>수정</button>
                        <button className="text-red-600 text-xs" onClick={() => handleDeleteDetail(d.id)}>삭제</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div id="packing-detail-add-form" className="bg-white border border-gray-200 rounded p-2 space-y-2">
          <p className="text-xs font-medium text-gray-600">상세내역 추가</p>
          {newRows.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <input
                className="border rounded px-2 py-1 text-sm w-24"
                placeholder="색상"
                value={row.color}
                onChange={(e) => updateNewRow(idx, { color: e.target.value })}
              />
              <input
                className="border rounded px-2 py-1 text-sm w-20"
                placeholder="사이즈"
                value={row.size}
                onChange={(e) => updateNewRow(idx, { size: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className="border rounded px-2 py-1 text-sm w-24"
                placeholder="수량"
                value={row.qty || ''}
                onChange={(e) => updateNewRow(idx, { qty: Number(e.target.value) })}
              />
              <button type="button" className="text-red-600 text-xs" onClick={() => removeNewRow(idx)} disabled={newRows.length === 1}>삭제</button>
            </div>
          ))}
          <div className="flex gap-3 items-center">
            <button type="button" className="text-blue-600 text-xs font-medium" onClick={addNewRow}>+ 행 추가</button>
            <button
              type="button"
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              disabled={addingDetails}
              onClick={handleAddDetails}
            >
              {addingDetails ? '등록 중...' : '상세내역 등록'}
            </button>
          </div>
        </div>

        <div className="mt-2">
          <button
            type="button"
            className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700"
            onClick={handleOpenReview}
          >
            선택한 항목으로 입고증 작성
          </button>
        </div>
      </div>

      {reviewLines && (
        <div className="bg-indigo-50 border border-indigo-200 rounded p-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">완제품입고증 작성 확인</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-indigo-200">
                <th className="py-1 pr-2">색상</th>
                <th className="py-1 pr-2">사이즈</th>
                <th className="py-1 pr-2">원 수량</th>
                <th className="py-1 pr-2">조정 수량</th>
                <th className="py-1 pr-2">조정 사유</th>
              </tr>
            </thead>
            <tbody>
              {reviewLines.map((line, idx) => {
                const isAdjusted = Number(line.adjustedQty) !== Number(line.detail.qty);
                return (
                  <tr key={line.detail.id} className="border-b border-indigo-100">
                    <td className="py-1 pr-2">{line.detail.color}</td>
                    <td className="py-1 pr-2">{line.detail.size}</td>
                    <td className="py-1 pr-2">{line.detail.qty}</td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        className="border rounded px-1 py-0.5 text-sm w-24"
                        value={line.adjustedQty}
                        onChange={(e) => updateReviewLine(idx, { adjustedQty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="border rounded px-1 py-0.5 text-sm w-48 disabled:bg-gray-100"
                        placeholder={isAdjusted ? '조정 사유 (필수)' : '조정 시에만 입력'}
                        disabled={!isAdjusted}
                        value={line.adjustmentReason}
                        onChange={(e) => updateReviewLine(idx, { adjustmentReason: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col flex-1">
              <label className="text-xs text-gray-500 mb-1">비고</label>
              <input className="border rounded px-2 py-1 text-sm" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <button
              type="button"
              className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              disabled={saving}
              onClick={handleSaveReceipt}
            >
              {saving ? '저장 중...' : '입고증 저장'}
            </button>
            <button type="button" className="text-gray-500 text-sm" onClick={() => setReviewLines(null)}>취소</button>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">작성된 완제품입고증</h4>
        {receipts.length === 0 ? (
          <p className="text-xs text-gray-400">아직 작성된 입고증이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium">{r.receiptNo}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{r.issuedDate?.slice(0, 10)}{r.remark ? ` · ${r.remark}` : ''}</span>
                    <button className="text-indigo-600 text-xs font-medium" onClick={() => setPrintReceiptId(r.id)}>입고증 발급</button>
                  </div>
                </div>
                <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
                  {r.lines.map((l) => (
                    <li key={l.id}>
                      {l.color}/{l.size}: {l.originalQty}
                      {Number(l.adjustedQty) !== Number(l.originalQty) && (
                        <> → {l.adjustedQty} ({l.adjustmentReason})</>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {printReceiptId !== null && (
        <GoodsReceiptPrintView goodsReceiptId={printReceiptId} onClose={() => setPrintReceiptId(null)} />
      )}
    </div>
  );
};
