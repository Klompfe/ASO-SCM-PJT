import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type CreateSupplier,
  type Supplier,
} from '../api/suppliers.service';
import { getMaterialCategories, type MaterialCategory } from '../api/materialCategories.service';
import { CategoryChips } from './CategoryChips';
import { getErrorMessage } from '../utils/errorMessage';
import { categoryNames, legacyMainItemsNote } from '../utils/materialCategories';

const emptyForm: CreateSupplier = { name: '', businessNumber: '', contactPhone: '', email: '', address: '', abbrCode: '' };

// PR-183: 공급업체의 "주요품목"(개별 품목 M:N)은 "취급 품목군"(겉감·안감·실 …)으로 바뀌었다.
// 등록/수정은 품목군 칩으로만 하고, 예전 주요품목은 자동 변환하지 않고 회색 읽기 전용 문구로만 보여준다.
export const SuppliersManager: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState<CreateSupplier>(emptyForm);
  const [newCategoryIds, setNewCategoryIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CreateSupplier>(emptyForm);
  const [editCategoryIds, setEditCategoryIds] = useState<number[]>([]);
  const [editLegacyNote, setEditLegacyNote] = useState<string | null>(null);
  // 목록 필터: 품목군을 고르면 그 품목군을 취급하는 업체만 본다('' = 전체).
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [categories, setCategories] = useState<MaterialCategory[]>([]);

  const loadSuppliers = useCallback(async (categoryId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSuppliers(categoryId ? { categoryId: Number(categoryId) } : undefined);
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setSuppliers(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체 목록을 불러오는 데 실패했습니다.'));
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers(filterCategoryId);
  }, [loadSuppliers, filterCategoryId]);

  useEffect(() => {
    getMaterialCategories()
      .then((res) => setCategories(Array.isArray(res) ? res : (res?.data ?? [])))
      .catch(() => setCategories([]));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await createSupplier({ ...newSupplier, categoryIds: newCategoryIds });
      toast.success(`공급업체가 등록되었습니다. (코드: ${res?.code ?? '-'})`);
      setNewSupplier(emptyForm);
      setNewCategoryIds([]);
      loadSuppliers(filterCategoryId);
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체 등록에 실패했습니다.'));
    }
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      businessNumber: s.businessNumber || '',
      contactPhone: s.contactPhone || '',
      email: s.email || '',
      address: s.address || '',
      abbrCode: s.abbrCode || '',
    });
    setEditCategoryIds((s.categories ?? []).map((c) => c.id));
    setEditLegacyNote(legacyMainItemsNote(s.mainItems));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditCategoryIds([]);
    setEditLegacyNote(null);
  };

  const handleUpdate = async (id: number) => {
    setError(null);
    try {
      await updateSupplier(id, { ...editForm, categoryIds: editCategoryIds });
      toast.success('공급업체 정보가 수정되었습니다.');
      cancelEdit();
      loadSuppliers(filterCategoryId);
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체 수정에 실패했습니다.'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 공급업체를 삭제하시겠습니까?')) return;
    setError(null);
    try {
      await deleteSupplier(id);
      toast.success('공급업체가 삭제되었습니다.');
      loadSuppliers(filterCategoryId);
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체 삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Suppliers</h2>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">이름</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">업체약칭 (선택, 비우면 업체명에서 자동생성)</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newSupplier.abbrCode} onChange={(e) => setNewSupplier({ ...newSupplier, abbrCode: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">사업자번호</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newSupplier.businessNumber} onChange={(e) => setNewSupplier({ ...newSupplier, businessNumber: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">연락처</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newSupplier.contactPhone} onChange={(e) => setNewSupplier({ ...newSupplier, contactPhone: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">이메일</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">주소</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} />
        </div>
        <div className="flex flex-col col-span-2 md:col-span-3">
          <label className="text-sm text-gray-600 mb-1">취급 품목군</label>
          <CategoryChips selectedIds={newCategoryIds} onChange={setNewCategoryIds} ariaLabel="취급 품목군" />
        </div>
        <div className="col-span-2 md:col-span-3">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700" disabled={loading}>등록</button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600" htmlFor="supplier-category-filter">품목군 필터</label>
        <select
          id="supplier-category-filter"
          className="border border-gray-300 rounded px-3 py-2"
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
        >
          <option value="">전체</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.isActive ? c.name : `${c.name} (비활성)`}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">코드</th>
              <th className="px-4 py-2 text-left">업체약칭</th>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">사업자번호</th>
              <th className="px-4 py-2 text-left">연락처</th>
              <th className="px-4 py-2 text-left">이메일</th>
              <th className="px-4 py-2 text-left">주소</th>
              <th className="px-4 py-2 text-left">취급 품목군</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {suppliers.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="bg-yellow-50">
                  <td className="px-4 py-2 font-mono">{s.code}</td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.abbrCode} onChange={(e) => setEditForm({ ...editForm, abbrCode: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.businessNumber} onChange={(e) => setEditForm({ ...editForm, businessNumber: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                  <td className="px-4 py-2 min-w-[14rem]">
                    <CategoryChips selectedIds={editCategoryIds} onChange={setEditCategoryIds} ariaLabel={`${s.name} 취급 품목군`} />
                    {editLegacyNote && <p className="text-xs text-gray-400 mt-2">{editLegacyNote}</p>}
                  </td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => handleUpdate(s.id)}>저장</button>
                    <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{s.code}</td>
                  <td className="px-4 py-2">{s.abbrCode ?? '-'}</td>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">{s.businessNumber}</td>
                  <td className="px-4 py-2">{s.contactPhone}</td>
                  <td className="px-4 py-2">{s.email}</td>
                  <td className="px-4 py-2">{s.address}</td>
                  <td className="px-4 py-2">
                    {categoryNames(s.categories).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {categoryNames(s.categories).map((name) => (
                          <span key={name} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                    {legacyMainItemsNote(s.mainItems) && (
                      <p className="text-xs text-gray-400 mt-1">{legacyMainItemsNote(s.mainItems)}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => startEdit(s)}>수정</button>
                    <button className="text-red-600" onClick={() => handleDelete(s.id)}>삭제</button>
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
