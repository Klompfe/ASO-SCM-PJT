import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getBuyers,
  createBuyer,
  updateBuyer,
  deleteBuyer,
  type CreateBuyer,
  type Buyer,
} from '../api/buyers.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateBuyer = { code: '', name: '', contactPerson: '', contactPhone: '', email: '', country: '', address: '' };

export const BuyersManager: React.FC = () => {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBuyer, setNewBuyer] = useState<CreateBuyer>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CreateBuyer>(emptyForm);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBuyers();
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setBuyers(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '고객사 목록을 불러오는 데 실패했습니다.'));
      setBuyers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuyers();
  }, [loadBuyers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createBuyer(newBuyer);
      toast.success('고객사가 등록되었습니다.');
      setNewBuyer(emptyForm);
      loadBuyers();
    } catch (err: any) {
      setError(getErrorMessage(err, '고객사 등록에 실패했습니다.'));
    }
  };

  const startEdit = (b: Buyer) => {
    setEditingId(b.id);
    setEditForm({
      code: b.code,
      name: b.name,
      contactPerson: b.contactPerson,
      contactPhone: b.contactPhone,
      email: b.email || '',
      country: b.country,
      address: b.address || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleUpdate = async (id: number) => {
    setError(null);
    try {
      await updateBuyer(id, editForm);
      toast.success('고객사 정보가 수정되었습니다.');
      cancelEdit();
      loadBuyers();
    } catch (err: any) {
      setError(getErrorMessage(err, '고객사 수정에 실패했습니다.'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 고객사를 삭제하시겠습니까?')) return;
    setError(null);
    try {
      await deleteBuyer(id);
      toast.success('고객사가 삭제되었습니다.');
      loadBuyers();
    } catch (err: any) {
      setError(getErrorMessage(err, '고객사 삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Buyers (고객사 관리)</h2>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">코드</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newBuyer.code} onChange={(e) => setNewBuyer({ ...newBuyer, code: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">고객사명</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newBuyer.name} onChange={(e) => setNewBuyer({ ...newBuyer, name: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">담당자</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newBuyer.contactPerson} onChange={(e) => setNewBuyer({ ...newBuyer, contactPerson: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">연락처</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newBuyer.contactPhone} onChange={(e) => setNewBuyer({ ...newBuyer, contactPhone: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">이메일</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newBuyer.email} onChange={(e) => setNewBuyer({ ...newBuyer, email: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">국가</label>
          <input className="border border-gray-300 rounded px-3 py-2" required value={newBuyer.country} onChange={(e) => setNewBuyer({ ...newBuyer, country: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">주소</label>
          <input className="border border-gray-300 rounded px-3 py-2" value={newBuyer.address} onChange={(e) => setNewBuyer({ ...newBuyer, address: e.target.value })} />
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
              <th className="px-4 py-2 text-left">고객사명</th>
              <th className="px-4 py-2 text-left">담당자</th>
              <th className="px-4 py-2 text-left">연락처</th>
              <th className="px-4 py-2 text-left">이메일</th>
              <th className="px-4 py-2 text-left">국가</th>
              <th className="px-4 py-2 text-left">주소</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {buyers.map((b) =>
              editingId === b.id ? (
                <tr key={b.id} className="bg-yellow-50">
                  <td className="px-4 py-2 font-mono">{b.code}</td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => handleUpdate(b.id)}>저장</button>
                    <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{b.code}</td>
                  <td className="px-4 py-2">{b.name}</td>
                  <td className="px-4 py-2">{b.contactPerson}</td>
                  <td className="px-4 py-2">{b.contactPhone}</td>
                  <td className="px-4 py-2">{b.email}</td>
                  <td className="px-4 py-2">{b.country}</td>
                  <td className="px-4 py-2">{b.address}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => startEdit(b)}>수정</button>
                    <button className="text-red-600" onClick={() => handleDelete(b.id)}>삭제</button>
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
