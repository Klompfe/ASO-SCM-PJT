import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getMaterialCategories,
  createMaterialCategory,
  updateMaterialCategory,
  deleteMaterialCategory,
  type MaterialCategory,
} from '../api/materialCategories.service';
import { getErrorMessage } from '../utils/errorMessage';

// PR-183: 품목군 관리 화면. 쓰기는 MANAGER/ADMIN만 가능하다(서버가 막음). 사용 중인 품목군은
// 삭제되지 않으므로 비활성 토글을 안내한다.
export const MaterialCategoriesManager: React.FC = () => {
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMaterialCategories();
      setCategories(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '품목군 목록을 불러오는 데 실패했습니다.'));
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error('품목군 이름을 입력해 주세요.');
      return;
    }
    try {
      await createMaterialCategory({ name: newName.trim(), sortOrder: newSortOrder });
      toast.success('품목군이 추가되었습니다.');
      setNewName('');
      setNewSortOrder(0);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '품목군 추가에 실패했습니다.'));
    }
  };

  const startEdit = (c: MaterialCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSortOrder(c.sortOrder);
  };

  const saveEdit = async (id: number) => {
    try {
      await updateMaterialCategory(id, { name: editName.trim(), sortOrder: editSortOrder });
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const toggleActive = async (c: MaterialCategory) => {
    try {
      await updateMaterialCategory(c.id, { isActive: !c.isActive });
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상태 변경에 실패했습니다.'));
    }
  };

  const handleDelete = async (c: MaterialCategory) => {
    if (!window.confirm(`"${c.name}" 품목군을 삭제하시겠습니까?`)) return;
    try {
      await deleteMaterialCategory(c.id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      // 사용 중이면 서버가 "비활성으로 바꿔 주세요" 메시지를 400으로 준다.
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">품목군 관리</h2>
      <p className="text-sm text-gray-500">
        공급업체가 취급하는 품목군(겉감·안감·심지·실·테이프 등)입니다. 공급업체 등록 시 칩으로 고르고,
        발주에서 품목군 기준으로 업체를 거를 때 씁니다. 공급업체나 품목이 쓰고 있는 품목군은 삭제할 수 없으니
        &apos;비활성&apos;으로 바꿔 주세요(비활성 품목군은 새로 고를 수 없지만 기존 연결은 남습니다).
      </p>

      <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">품목군 이름</label>
          <input className="border border-gray-300 rounded px-3 py-2 w-48" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="새 품목군 이름" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">정렬순서</label>
          <input type="number" min={0} className="border border-gray-300 rounded px-3 py-2 w-24" value={newSortOrder} onChange={(e) => setNewSortOrder(Number(e.target.value))} aria-label="새 품목군 정렬순서" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">추가</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">정렬</th>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && categories.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400">불러오는 중...</td></tr>
            )}
            {categories.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="bg-yellow-50">
                  <td className="px-4 py-2"><input type="number" min={0} className="border rounded px-2 py-1 w-20" value={editSortOrder} onChange={(e) => setEditSortOrder(Number(e.target.value))} /></td>
                  <td className="px-4 py-2"><input className="border rounded px-2 py-1 w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td className="px-4 py-2">{c.isActive ? '활성' : '비활성'}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => saveEdit(c.id)}>저장</button>
                    <button className="text-gray-500" onClick={() => setEditingId(null)}>취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={c.isActive ? 'hover:bg-gray-50' : 'hover:bg-gray-50 text-gray-400'}>
                  <td className="px-4 py-2">{c.sortOrder}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">
                    <button className="text-sm underline" onClick={() => toggleActive(c)}>{c.isActive ? '활성 (비활성으로 바꾸기)' : '비활성 (활성으로 바꾸기)'}</button>
                  </td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="text-blue-600" onClick={() => startEdit(c)}>수정</button>
                    <button className="text-red-600" onClick={() => handleDelete(c)}>삭제</button>
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
