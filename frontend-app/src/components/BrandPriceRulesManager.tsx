import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getBrandPriceRules,
  createBrandPriceRule,
  updateBrandPriceRule,
  deleteBrandPriceRule,
  type BrandPriceRule,
  type CreateBrandPriceRule,
} from '../api/brandPriceRules.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateBrandPriceRule = { brandName: '', categoryKeyword: '', priceUsd: 0, unit: '', note: '' };

// PR-185: 브랜드 전용가(예: 뮤트 겉감 $1.00/YD) — 미도 단가표보다 우선 적용되는 고정가.
// 뮤트 3건(겉감/안감/행어)만 시드돼 있다(제시님 확정 2026-10-05). 쓰기는 MANAGER/ADMIN.
export const BrandPriceRulesManager: React.FC = () => {
  const [rules, setRules] = useState<BrandPriceRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateBrandPriceRule>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CreateBrandPriceRule>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBrandPriceRules();
      setRules(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '브랜드 전용가 목록을 불러오는 데 실패했습니다.'));
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
    if (!form.brandName.trim() || !form.categoryKeyword.trim() || !form.unit.trim()) {
      toast.error('브랜드명/품목구분 키워드/단위는 필수입니다.');
      return;
    }
    if (!(form.priceUsd > 0)) {
      toast.error('단가(USD)는 0보다 커야 합니다.');
      return;
    }
    try {
      await createBrandPriceRule({ ...form, note: form.note || undefined });
      toast.success('브랜드 전용가가 등록되었습니다.');
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    }
  };

  const startEdit = (rule: BrandPriceRule) => {
    setEditingId(rule.id);
    setEditDraft({ brandName: rule.brandName, categoryKeyword: rule.categoryKeyword, priceUsd: Number(rule.priceUsd), unit: rule.unit, note: rule.note ?? '', isActive: rule.isActive });
  };

  const saveEdit = async (id: number) => {
    try {
      await updateBrandPriceRule(id, { ...editDraft, note: editDraft.note || undefined });
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const toggleActive = async (rule: BrandPriceRule) => {
    try {
      await updateBrandPriceRule(rule.id, { isActive: !rule.isActive });
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상태 변경에 실패했습니다.'));
    }
  };

  const handleDelete = async (rule: BrandPriceRule) => {
    if (!window.confirm(`"${rule.brandName}/${rule.categoryKeyword}" 규칙을 삭제하시겠습니까?`)) return;
    try {
      await deleteBrandPriceRule(rule.id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">브랜드 전용가</h2>
      <p className="text-sm text-gray-500">
        미도(CMT) 계약은 브랜드별로 전용 단가를 쓰는 경우가 있습니다(예: 뮤트 겉감 $1.00/YD). 여기 등록된 브랜드+품목구분
        조합은 발주 폼의 "단가표 참고(USD)"에서 미도 단가표보다 먼저 후보로 나옵니다. 일치하는 규칙이 없으면 미도 단가표를 그대로 씁니다.
      </p>

      <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">브랜드명</label>
          <input className="border border-gray-300 rounded px-3 py-2 w-32" placeholder="예: 뮤트" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목구분 키워드</label>
          <input className="border border-gray-300 rounded px-3 py-2 w-32" placeholder="예: 겉감" value={form.categoryKeyword} onChange={(e) => setForm({ ...form, categoryKeyword: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">단가(USD)</label>
          <input type="number" step="any" min={0} className="border border-gray-300 rounded px-3 py-2 w-28" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: Number(e.target.value) })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">단위</label>
          <input className="border border-gray-300 rounded px-3 py-2 w-24" placeholder="예: YD" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </div>
        <div className="flex flex-col flex-1 min-w-[10rem]">
          <label className="text-sm text-gray-600 mb-1">메모(선택)</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">추가</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">브랜드</th>
              <th className="px-4 py-2 text-left">품목구분</th>
              <th className="px-4 py-2 text-right">단가</th>
              <th className="px-4 py-2 text-left">단위</th>
              <th className="px-4 py-2 text-left">메모</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && rules.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400">불러오는 중...</td></tr>
            )}
            {rules.map((r) =>
              editingId === r.id ? (
                <tr key={r.id} className="bg-yellow-50">
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editDraft.brandName} onChange={(e) => setEditDraft({ ...editDraft, brandName: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editDraft.categoryKeyword} onChange={(e) => setEditDraft({ ...editDraft, categoryKeyword: e.target.value })} /></td>
                  <td className="px-4 py-2"><input type="number" step="any" className="border rounded px-2 py-1 w-24 text-right" value={editDraft.priceUsd} onChange={(e) => setEditDraft({ ...editDraft, priceUsd: Number(e.target.value) })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-20" value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editDraft.note ?? ''} onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} /></td>
                  <td className="px-4 py-2">{r.isActive ? '활성' : '비활성'}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => saveEdit(r.id)}>저장</button>
                    <button className="text-gray-500" onClick={() => setEditingId(null)}>취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className={r.isActive ? 'hover:bg-gray-50' : 'hover:bg-gray-50 text-gray-400'}>
                  <td className="px-4 py-2">{r.brandName}</td>
                  <td className="px-4 py-2">{r.categoryKeyword}</td>
                  <td className="px-4 py-2 text-right">${r.priceUsd}</td>
                  <td className="px-4 py-2">{r.unit}</td>
                  <td className="px-4 py-2 text-gray-500">{r.note ?? '-'}</td>
                  <td className="px-4 py-2">
                    <button className="text-sm underline" onClick={() => toggleActive(r)}>{r.isActive ? '활성 (비활성으로)' : '비활성 (활성으로)'}</button>
                  </td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => startEdit(r)}>수정</button>
                    <button className="text-red-600" onClick={() => handleDelete(r)}>삭제</button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
