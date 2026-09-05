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
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateSupplier = { code: '', name: '', businessNumber: '', contactPhone: '', email: '', address: '' };

export const SuppliersManager: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState<CreateSupplier>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CreateSupplier>(emptyForm);

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
      await createSupplier(newSupplier);
      toast.success('공급업체가 등록되었습니다.');
      setNewSupplier(emptyForm);
      loadSuppliers();
    } catch (err: any) {
      setError(getErrorMessage(err, '공급업체 등록에 실패했습니다.'));
    }
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditForm({
      code: s.code,
      name: s.name,
      businessNumber: s.businessNumber || '',
      contactPhone: s.contactPhone || '',
      email: s.email || '',
      address: s.address || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleUpdate = async (id: number) => {
    setError(null);
    try {
      await updateSupplier(id, editForm);
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
          <label className="text-sm text-gray-600 mb-1">코드</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newSupplier.code} onChange={(e) => setNewSupplier({ ...newSupplier, code: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">이름</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
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
        <div className="col-span-2 md:col-span-3">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700" disabled={loading}>등록</button>
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">코드</th>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">사업자번호</th>
              <th className="px-4 py-2 text-left">연락처</th>
              <th className="px-4 py-2 text-left">이메일</th>
              <th className="px-4 py-2 text-left">주소</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {suppliers.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="bg-yellow-50">
                  <td className="px-4 py-2 font-mono">{s.code}</td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.businessNumber} onChange={(e) => setEditForm({ ...editForm, businessNumber: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => handleUpdate(s.id)}>저장</button>
                    <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{s.code}</td>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">{s.businessNumber}</td>
                  <td className="px-4 py-2">{s.contactPhone}</td>
                  <td className="px-4 py-2">{s.email}</td>
                  <td className="px-4 py-2">{s.address}</td>
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
