import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getMidoPriceItems, createMidoPriceItem, updateMidoPriceItem,
  previewMidoPriceImport, applyMidoPriceImport,
  type MidoPriceItem, type CreateMidoPriceItem,
  type MidoPriceImportPreviewRow, type MidoPriceImportPreviewResult,
} from '../api/midoPriceTable.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
import { getErrorMessage } from '../utils/errorMessage';
import { defaultSelectedLines, selectableRows as selectSelectableRows } from '../utils/midoPriceImport';

const emptyForm: CreateMidoPriceItem = { itemName: '', priceUsdMin: 0, priceUsdMax: 0, unit: '', note: '' };
const CSV_HEADER = 'itemName,priceUsdMin,priceUsdMax,unit,note';
const CSV_TEMPLATE = `${CSV_HEADER}\n겉감(WOOL 60~70%),2.5,3,YD,\n실(THREAD),0.00012,0.00012,M,미터당 단가 — 콘/롤 환산은 자동 계산됨\n`;

function downloadCsvTemplate() {
  const blob = new Blob([`﻿${CSV_TEMPLATE}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'mido-price-table-template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<MidoPriceImportPreviewRow['status'], string> = {
  NEW: '신규', CHANGED: '변경', SAME: '동일', ERROR: '오류',
};
const STATUS_STYLE: Record<MidoPriceImportPreviewRow['status'], string> = {
  NEW: 'bg-green-100 text-green-800', CHANGED: 'bg-blue-100 text-blue-800',
  SAME: 'bg-gray-100 text-gray-600', ERROR: 'bg-red-100 text-red-800',
};

// PR-188: 미도 단가표 관리 — 등록/수정/사용중지(MANAGER/ADMIN)와 CSV 일괄 등록(미리보기 →
// 선택 적용). 가격 값은 추측/자동 확정하지 않는다 — 일괄 등록도 반드시 미리보기에서 사람이
// 신규/변경 행을 확인하고 체크해야 적용된다(변경 행은 기본 체크 해제 — 실수로 덮어쓰지 않게).
export const MidoPriceTableManager: React.FC = () => {
  const [items, setItems] = useState<MidoPriceItem[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const canManage = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';

  const [form, setForm] = useState<CreateMidoPriceItem>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CreateMidoPriceItem>(emptyForm);

  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<MidoPriceImportPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({}); // line -> checked
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMidoPriceItems(includeInactive);
      setItems(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '미도 단가표 목록을 불러오는 데 실패했습니다.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemName.trim() || !form.unit.trim()) {
      toast.error('항목명과 단위는 필수입니다.');
      return;
    }
    if (!(form.priceUsdMin >= 0) || !(form.priceUsdMax >= 0) || form.priceUsdMin > form.priceUsdMax) {
      toast.error('최소 단가는 0 이상, 최대 단가보다 클 수 없습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await createMidoPriceItem({ ...form, note: form.note || undefined });
      toast.success('단가표 항목이 등록되었습니다.');
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: MidoPriceItem) => {
    setEditingId(item.id);
    setEditDraft({ itemName: item.itemName, priceUsdMin: Number(item.priceUsdMin), priceUsdMax: Number(item.priceUsdMax), unit: item.unit, note: item.note ?? '' });
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    try {
      await updateMidoPriceItem(id, { ...editDraft, note: editDraft.note || undefined });
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const toggleActive = async (item: MidoPriceItem) => {
    const verb = item.isActive ? '사용 중지' : '재사용';
    if (!window.confirm(`"${item.itemName}"을(를) ${verb}하시겠습니까?`)) return;
    try {
      await updateMidoPriceItem(item.id, { isActive: !item.isActive });
      toast.success(`${verb}되었습니다.`);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, `${verb}에 실패했습니다.`));
    }
  };

  const filteredItems = keyword.trim()
    ? items.filter((i) => i.itemName.toLowerCase().includes(keyword.trim().toLowerCase()))
    : items;

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    e.target.value = '';
  };

  const runPreview = async () => {
    if (!csvText.trim()) {
      toast.error('CSV 내용을 붙여넣거나 파일을 선택해 주세요.');
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await previewMidoPriceImport(csvText);
      setPreview(res);
      // 기본 선택: 오류 없는 신규만 체크(변경은 기본 해제 — 실수로 기존 값을 덮어쓰지 않게).
      setSelected(defaultSelectedLines(res.rows));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '미리보기에 실패했습니다. CSV 형식을 확인해 주세요.'));
    } finally {
      setPreviewing(false);
    }
  };

  const selectableRows = selectSelectableRows(preview?.rows ?? []);
  const selectedCount = selectableRows.filter((r) => selected[r.line]).length;

  const applySelected = async () => {
    if (!preview) return;
    const rows = selectableRows
      .filter((r) => selected[r.line])
      .map((r) => ({
        line: r.line,
        itemName: r.after.itemName,
        priceUsdMin: r.after.priceUsdMin as number,
        priceUsdMax: r.after.priceUsdMax as number,
        unit: r.after.unit,
        note: r.after.note,
        status: r.status as 'NEW' | 'CHANGED',
      }));
    if (rows.length === 0) {
      toast.error('적용할 행을 선택해 주세요.');
      return;
    }
    setApplying(true);
    try {
      const res = await applyMidoPriceImport(rows);
      toast.success(`적용 완료 — 생성 ${res.created}건, 수정 ${res.updated}건`);
      setPreview(null);
      setCsvText('');
      setSelected({});
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '적용에 실패했습니다. 선택 항목을 다시 확인해 주세요.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">미도 단가표</h2>
      <p className="text-sm text-gray-500">
        미도컴퍼니 원부자재 수출 단가(USD) 참고표입니다. 실(THREAD)은 미터(M) 단가로 등록하면 콘
        단가로 자동 환산됩니다. 테이프는 야드(YD) 단가로 등록하며, 롤 단가 환산은 후속
        PR-189에서 길이 단위 구분과 함께 반영됩니다(그 전에는 테이프 롤 환산 후보가 표시되지
        않을 수 있음). 가격 값은 추측해서 채우지 않습니다 — 직접 등록하거나 CSV로 일괄
        등록(미리보기 확인 후 적용)하세요.
      </p>
      {!canManage && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
          조회만 가능합니다. 등록·수정·일괄 등록은 관리자/매니저만 할 수 있습니다.
        </p>
      )}

      {canManage && (
        <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-sm text-gray-600 mb-1">항목명</label>
            <input className="border border-gray-300 rounded px-3 py-2" placeholder="예: 겉감(WOOL 60~70%)" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">최소 단가(USD)</label>
            <input type="number" min={0} step="any" className="border border-gray-300 rounded px-3 py-2 w-28" value={form.priceUsdMin} onChange={(e) => setForm({ ...form, priceUsdMin: Number(e.target.value) })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">최대 단가(USD)</label>
            <input type="number" min={0} step="any" className="border border-gray-300 rounded px-3 py-2 w-28" value={form.priceUsdMax} onChange={(e) => setForm({ ...form, priceUsdMax: Number(e.target.value) })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">단위</label>
            <input className="border border-gray-300 rounded px-3 py-2 w-24" placeholder="YD" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="flex flex-col flex-1 min-w-[160px]">
            <label className="text-sm text-gray-600 mb-1">비고</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {submitting ? '등록 중...' : '항목 등록'}
          </button>
        </form>
      )}

      {canManage && (
        <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-700">CSV 일괄 등록</h3>
            <button type="button" onClick={downloadCsvTemplate} className="text-xs text-blue-600 hover:underline">CSV 양식 내려받기</button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-200">파일 선택</button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFilePicked} />
            <span className="text-xs text-gray-400">또는 아래에 CSV 내용을 붙여넣으세요.</span>
          </div>
          <textarea
            className="border border-gray-300 rounded px-3 py-2 w-full font-mono text-xs"
            rows={6}
            placeholder={CSV_HEADER}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(null); }}
          />
          <button type="button" onClick={runPreview} disabled={previewing} className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 disabled:opacity-50">
            {previewing ? '미리보기 중...' : '미리보기'}
          </button>

          {preview && (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">
                신규 {preview.summary.new} · 변경 {preview.summary.changed} · 동일 {preview.summary.same} · 오류 {preview.summary.error} (총 {preview.summary.total}행)
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="text-xs w-full">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-2 py-1 text-left"></th>
                      <th className="px-2 py-1 text-left">줄</th>
                      <th className="px-2 py-1 text-left">상태</th>
                      <th className="px-2 py-1 text-left">항목명</th>
                      <th className="px-2 py-1 text-left">이전→이후</th>
                      <th className="px-2 py-1 text-left">단위</th>
                      <th className="px-2 py-1 text-left">오류</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.rows.map((row) => {
                      const checkable = row.status === 'NEW' || row.status === 'CHANGED';
                      return (
                        <tr key={row.line} className={row.status === 'ERROR' ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1">
                            {checkable && (
                              <input
                                type="checkbox"
                                aria-label={`${row.after.itemName} 선택`}
                                checked={!!selected[row.line]}
                                onChange={(e) => setSelected((s) => ({ ...s, [row.line]: e.target.checked }))}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1">{row.line}</td>
                          <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[row.status]}`}>{STATUS_LABEL[row.status]}</span></td>
                          <td className="px-2 py-1">{row.after.itemName}</td>
                          <td className="px-2 py-1">
                            {row.before
                              ? `$${row.before.priceUsdMin}~$${row.before.priceUsdMax} → $${row.after.priceUsdMin}~$${row.after.priceUsdMax}`
                              : `$${row.after.priceUsdMin}~$${row.after.priceUsdMax}`}
                          </td>
                          <td className="px-2 py-1">{row.after.unit}</td>
                          <td className="px-2 py-1 text-red-600">{row.errors?.join(' / ') ?? ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={applySelected} disabled={applying || selectedCount === 0} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                {applying ? '적용 중...' : `선택 적용 (${selectedCount}건)`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <input className="border border-gray-300 rounded px-3 py-2 flex-1 min-w-[200px]" placeholder="항목명 검색" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          사용 중지 항목도 보기
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left">항목명</th>
                  <th className="px-4 py-2 text-right">단가(USD)</th>
                  <th className="px-4 py-2 text-left">단위</th>
                  <th className="px-4 py-2 text-left">비고</th>
                  <th className="px-4 py-2 text-left">상태</th>
                  {canManage && <th className="px-4 py-2 text-left">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                    {editingId === item.id ? (
                      <>
                        <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editDraft.itemName} onChange={(e) => setEditDraft({ ...editDraft, itemName: e.target.value })} /></td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <input type="number" min={0} step="any" className="border rounded px-2 py-1 w-20 text-right" value={editDraft.priceUsdMin} onChange={(e) => setEditDraft({ ...editDraft, priceUsdMin: Number(e.target.value) })} />
                            <span>~</span>
                            <input type="number" min={0} step="any" className="border rounded px-2 py-1 w-20 text-right" value={editDraft.priceUsdMax} onChange={(e) => setEditDraft({ ...editDraft, priceUsdMax: Number(e.target.value) })} />
                          </div>
                        </td>
                        <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-20" value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} /></td>
                        <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editDraft.note ?? ''} onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} /></td>
                        <td className="px-4 py-2 text-gray-400">{item.isActive ? '사용중' : '중지됨'}</td>
                        <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                          <button className="text-blue-600" onClick={() => saveEdit(item.id)}>저장</button>
                          <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-medium">{item.itemName}</td>
                        <td className="px-4 py-2 text-right">{Number(item.priceUsdMin) === Number(item.priceUsdMax) ? `$${item.priceUsdMin}` : `$${item.priceUsdMin}~$${item.priceUsdMax}`}</td>
                        <td className="px-4 py-2">{item.unit}</td>
                        <td className="px-4 py-2 text-gray-500">{item.note ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-500">{item.isActive ? '사용중' : '중지됨'}</td>
                        {canManage && (
                          <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                            <button className="text-blue-600" onClick={() => startEdit(item)}>수정</button>
                            <button className="text-amber-600" onClick={() => toggleActive(item)}>{item.isActive ? '사용 중지' : '재사용'}</button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="px-4 py-6 text-center text-gray-400" data-testid="mido-price-table-empty">등록된 단가표 항목이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
