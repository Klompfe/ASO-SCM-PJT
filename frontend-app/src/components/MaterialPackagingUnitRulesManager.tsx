import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getMaterialPackagingUnitRules,
  createMaterialPackagingUnitRule,
  updateMaterialPackagingUnitRule,
  deleteMaterialPackagingUnitRule,
  type MaterialPackagingUnitRule,
  type CreateMaterialPackagingUnitRule,
} from '../api/materialPackagingUnitRules.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateMaterialPackagingUnitRule = { materialSubType: '', displayName: '', packagingUnitLabel: '', unitLengthM: 0, note: '' };

// PR-175: 실/테이프 등 자재 종류별 포장단위(콘/롤) 환산 기준 관리 화면 — BrandManager.tsx
// (브랜드 접두사 규칙)와 동일한 구조. thread-cone-price.util.ts의 하드코딩 상수를
// 대체하는 DB 테이블이라, 콘길이/롤길이가 바뀌거나 새 자재 종류가 늘어도 여기서 추가/수정한다.
export const MaterialPackagingUnitRulesManager: React.FC = () => {
  const [rules, setRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateMaterialPackagingUnitRule>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CreateMaterialPackagingUnitRule>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMaterialPackagingUnitRules();
      setRules(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '자재 포장단위 규칙 목록을 불러오는 데 실패했습니다.'));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialSubType.trim() || !form.displayName.trim() || !form.packagingUnitLabel.trim()) {
      toast.error('자재 종류 키/표시명/포장단위명은 필수입니다.');
      return;
    }
    if (!(form.unitLengthM > 0)) {
      toast.error('단위당 길이(m)는 0보다 커야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await createMaterialPackagingUnitRule({ ...form, note: form.note || undefined });
      toast.success('자재 포장단위 규칙이 등록되었습니다.');
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (rule: MaterialPackagingUnitRule) => {
    setEditingId(rule.id);
    setEditDraft({
      materialSubType: rule.materialSubType,
      displayName: rule.displayName,
      packagingUnitLabel: rule.packagingUnitLabel,
      unitLengthM: Number(rule.unitLengthM),
      note: rule.note ?? '',
    });
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    try {
      await updateMaterialPackagingUnitRule(id, { ...editDraft, note: editDraft.note || undefined });
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 자재 포장단위 규칙을 삭제하시겠습니까?')) return;
    try {
      await deleteMaterialPackagingUnitRule(id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">자재 포장단위 규칙</h2>
      <p className="text-sm text-gray-500">
        실(THREAD)/테이프 등 자재 종류별 포장단위(콘/롤 등)와 단위당 길이(m)입니다. BOM 자재명세의
        실 종류(코아사/오바사/지누이도)·테이프 종류(다데/암홀) 콘가격 환산에 쓰입니다. 자재 종류 키는
        BomItem.threadType/tapeType 값과 정확히 일치해야 합니다(예: COA_SA, DADE).
      </p>

      <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">자재 종류 키</label>
          <input
            className="border border-gray-300 rounded px-3 py-2 w-32"
            placeholder="예: COA_SA"
            value={form.materialSubType}
            onChange={(e) => setForm({ ...form, materialSubType: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">표시명</label>
          <input
            className="border border-gray-300 rounded px-3 py-2 w-28"
            placeholder="예: 코아사"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">포장단위</label>
          <input
            className="border border-gray-300 rounded px-3 py-2 w-20"
            placeholder="예: 콘"
            value={form.packagingUnitLabel}
            onChange={(e) => setForm({ ...form, packagingUnitLabel: e.target.value })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">단위당 길이(m)</label>
          <input
            type="number"
            min={0}
            step="any"
            className="border border-gray-300 rounded px-3 py-2 w-28"
            value={form.unitLengthM || ''}
            onChange={(e) => setForm({ ...form, unitLengthM: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-sm text-gray-600 mb-1">비고</label>
          <input
            className="border border-gray-300 rounded px-3 py-2"
            value={form.note ?? ''}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '등록 중...' : '규칙 등록'}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">자재 종류 키</th>
                <th className="px-4 py-2 text-left">표시명</th>
                <th className="px-4 py-2 text-left">포장단위</th>
                <th className="px-4 py-2 text-right">단위당 길이(m)</th>
                <th className="px-4 py-2 text-left">비고</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  {editingId === rule.id ? (
                    <>
                      <td className="px-4 py-2 font-mono text-xs">{rule.materialSubType}</td>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-24"
                          value={editDraft.displayName}
                          onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-16"
                          value={editDraft.packagingUnitLabel}
                          onChange={(e) => setEditDraft({ ...editDraft, packagingUnitLabel: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={editDraft.unitLengthM}
                          onChange={(e) => setEditDraft({ ...editDraft, unitLengthM: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={editDraft.note ?? ''}
                          onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button className="text-blue-600" onClick={() => saveEdit(rule.id)}>저장</button>
                        <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs">{rule.materialSubType}</td>
                      <td className="px-4 py-2 font-medium">{rule.displayName}</td>
                      <td className="px-4 py-2">{rule.packagingUnitLabel}</td>
                      <td className="px-4 py-2 text-right">{Number(rule.unitLengthM).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-500">{rule.note ?? '-'}</td>
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button className="text-blue-600" onClick={() => startEdit(rule)}>수정</button>
                        <button className="text-red-600" onClick={() => handleDelete(rule.id)}>삭제</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">등록된 자재 포장단위 규칙이 없습니다.</td>
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
