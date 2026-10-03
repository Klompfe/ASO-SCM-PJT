import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type CreateSupplier,
  type Supplier,
  type SupplierMainItem,
} from '../api/suppliers.service';
import { getItems } from '../api/items.service';
import { SearchSelectField } from './SearchSelectField';
import { addMainItem, removeMainItem } from '../utils/mainItemsPicker';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateSupplier = { name: '', businessNumber: '', contactPhone: '', email: '', address: '', abbrCode: '' };

// PR-171: 주요품목 다중 선택 — WorkOrdersManager.tsx/PurchaseOrdersManager.tsx가 이미
// 쓰는 SearchSelectField<T> 패턴을 재사용하되, 이 컴포넌트는 단일 선택용(value: T | null)
// 이라 value는 항상 null로 두고(선택해도 입력란에 값이 남지 않게) onChange에서 목록에
// 추가만 한다 — 선택된 품목은 칩으로 따로 보여주고 각 칩의 x 버튼으로 제거한다. 중복
// 추가는 id로 걸러낸다(이 코드베이스에 기존 다중선택 선례가 없어 가장 단순한 방식으로 구현).
function MainItemsPicker({
  selected,
  onChange,
  ariaLabel,
}: {
  selected: SupplierMainItem[];
  onChange: (items: SupplierMainItem[]) => void;
  ariaLabel: string;
}) {
  const searchItems = useCallback(async (keyword: string): Promise<SupplierMainItem[]> => {
    const res = await getItems({ keyword: keyword || undefined, limit: 20 });
    const list = Array.isArray(res) ? res : (res?.items ?? []);
    return list.map((i: any) => ({ id: i.id, name: i.name }));
  }, []);

  const addItem = (picked: SupplierMainItem | null) => onChange(addMainItem(selected, picked));
  const removeItem = (id: number) => onChange(removeMainItem(selected, id));

  return (
    <div className="flex flex-col">
      <SearchSelectField<SupplierMainItem>
        value={null}
        onChange={addItem}
        search={searchItems}
        getKey={(i) => i.id}
        getLabel={(i) => i.name}
        ariaLabel={ariaLabel}
        placeholder="품목 검색 후 추가"
        title="주요품목 검색"
        className="w-64"
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {i.name}
              <button type="button" onClick={() => removeItem(i.id)} aria-label={`${i.name} 제거`} className="text-blue-600 hover:text-blue-900">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const SuppliersManager: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState<CreateSupplier>(emptyForm);
  const [newMainItems, setNewMainItems] = useState<SupplierMainItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CreateSupplier>(emptyForm);
  const [editMainItems, setEditMainItems] = useState<SupplierMainItem[]>([]);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSuppliers();
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
    loadSuppliers();
  }, [loadSuppliers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await createSupplier({ ...newSupplier, mainItemIds: newMainItems.map((i) => i.id) });
      toast.success(`공급업체가 등록되었습니다. (코드: ${res?.code ?? '-'})`);
      setNewSupplier(emptyForm);
      setNewMainItems([]);
      loadSuppliers();
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
    setEditMainItems(s.mainItems ?? []);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditMainItems([]);
  };

  const handleUpdate = async (id: number) => {
    setError(null);
    try {
      await updateSupplier(id, { ...editForm, mainItemIds: editMainItems.map((i) => i.id) });
      toast.success('공급업체 정보가 수정되었습니다.');
      cancelEdit();
      loadSuppliers();
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
      loadSuppliers();
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
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">주요품목</label>
          <MainItemsPicker selected={newMainItems} onChange={setNewMainItems} ariaLabel="주요품목" />
        </div>
        <div className="col-span-2 md:col-span-3">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700" disabled={loading}>등록</button>
        </div>
      </form>

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
              <th className="px-4 py-2 text-left">주요품목</th>
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
                    <MainItemsPicker selected={editMainItems} onChange={setEditMainItems} ariaLabel={`${s.name} 주요품목`} />
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
                    {s.mainItems && s.mainItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.mainItems.map((i) => (
                          <span key={i.id} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{i.name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
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
