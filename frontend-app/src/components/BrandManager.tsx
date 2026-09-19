import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getBrandPrefixRules,
  createBrandPrefixRule,
  updateBrandPrefixRule,
  deleteBrandPrefixRule,
  type BrandPrefixRule,
  type CreateBrandPrefixRule,
} from '../api/brandPrefixRules.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateBrandPrefixRule = { prefix: '', isNumericStart: false, brandName: '', note: '' };

// PR-111: 스타일번호 접두사 → 브랜드 매핑 마스터 관리 화면. 접두사 체계가 앞으로도
// 늘거나 바뀔 수 있어 하드코딩 대신 여기서 추가/수정한다.
export const BrandManager: React.FC = () => {
  const [rules, setRules] = useState<BrandPrefixRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateBrandPrefixRule>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CreateBrandPrefixRule>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBrandPrefixRules();
      setRules(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '브랜드 규칙 목록을 불러오는 데 실패했습니다.'));
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
    if (!form.brandName.trim()) {
      toast.error('브랜드명을 입력해 주세요.');
      return;
    }
    if (!form.isNumericStart && !form.prefix?.trim()) {
      toast.error('숫자시작 규칙이 아니면 접두사(2자리)를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await createBrandPrefixRule({
        brandName: form.brandName,
        isNumericStart: form.isNumericStart,
        ...(form.isNumericStart ? {} : { prefix: form.prefix }),
        ...(form.note ? { note: form.note } : {}),
      });
      toast.success('브랜드 규칙이 등록되었습니다.');
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (rule: BrandPrefixRule) => {
    setEditingId(rule.id);
    setEditDraft({
      prefix: rule.prefix ?? '',
      isNumericStart: rule.isNumericStart,
      brandName: rule.brandName,
      note: rule.note ?? '',
    });
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    try {
      await updateBrandPrefixRule(id, {
        brandName: editDraft.brandName,
        isNumericStart: editDraft.isNumericStart,
        ...(editDraft.isNumericStart ? {} : { prefix: editDraft.prefix }),
        note: editDraft.note || undefined,
      });
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 브랜드 규칙을 삭제하시겠습니까?')) return;
    try {
      await deleteBrandPrefixRule(id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">브랜드 관리</h2>
      <p className="text-sm text-gray-500">
        스타일번호 접두사로 브랜드를 자동 분류하는 규칙입니다. 새 브랜드가 생기거나 접두사
        체계가 바뀌면 여기서 추가/수정하세요. 숫자로 시작하는 스타일번호(예: 에잇세컨즈)는
        접두사 대신 "숫자시작" 규칙으로 등록합니다.
      </p>

      <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">접두사(2자리)</label>
          <input
            className="border border-gray-300 rounded px-3 py-2 w-28 disabled:bg-gray-100"
            placeholder="예: BF"
            maxLength={2}
            disabled={form.isNumericStart}
            value={form.prefix ?? ''}
            onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1 flex items-center gap-1">
            <input
              type="checkbox"
              checked={form.isNumericStart ?? false}
              onChange={(e) => setForm({ ...form, isNumericStart: e.target.checked, prefix: e.target.checked ? '' : form.prefix })}
            />
            숫자로 시작
          </label>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">브랜드명</label>
          <input
            className="border border-gray-300 rounded px-3 py-2 w-40"
            placeholder="예: 빈폴"
            value={form.brandName}
            onChange={(e) => setForm({ ...form, brandName: e.target.value })}
          />
        </div>
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-sm text-gray-600 mb-1">비고</label>
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="예: W컨셉 다른 라인"
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
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">접두사</th>
                <th className="px-4 py-2 text-left">숫자시작</th>
                <th className="px-4 py-2 text-left">브랜드명</th>
                <th className="px-4 py-2 text-left">비고</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  {editingId === rule.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-20 disabled:bg-gray-100"
                          maxLength={2}
                          disabled={editDraft.isNumericStart}
                          value={editDraft.prefix ?? ''}
                          onChange={(e) => setEditDraft({ ...editDraft, prefix: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={editDraft.isNumericStart ?? false}
                          onChange={(e) => setEditDraft({ ...editDraft, isNumericStart: e.target.checked, prefix: e.target.checked ? '' : editDraft.prefix })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-32"
                          value={editDraft.brandName}
                          onChange={(e) => setEditDraft({ ...editDraft, brandName: e.target.value })}
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
                      <td className="px-4 py-2 font-mono">{rule.prefix ?? '-'}</td>
                      <td className="px-4 py-2">{rule.isNumericStart ? '예' : '-'}</td>
                      <td className="px-4 py-2 font-medium">{rule.brandName}</td>
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
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">등록된 브랜드 규칙이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
