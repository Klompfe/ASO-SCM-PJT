import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItems, createItem, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';
import { axiosInstance } from '../api/axiosInstance';
import { MappingPreviewModal } from './MappingPreviewModal';

export const ItemsManager: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [filter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', type: 'RAW_MATERIAL' });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getItems(filter);
      const data = Array.isArray(res.data) ? res.data : (res && Array.isArray(res) ? res : []);
      setItems(data);
    } catch (error) {
      toast.error('아이템 목록을 불러오는 데 실패했습니다.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createItem(newItem);
      toast.success('아이템이 생성되었습니다.');
      loadItems();
      setNewItem({ code: '', name: '', type: 'RAW_MATERIAL' });
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.post('/mapping/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreviewData(res.data);
      setValidationErrors(res.rawErrors || []);
      setModalOpen(true);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || '파일 분석에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Items</h2>
        <div className="space-x-2">
          <input type="file" onChange={handleFileUpload} accept=".csv" className="hidden" id="file-upload" />
          <label htmlFor="file-upload" className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 cursor-pointer">엑셀 업로드</label>
        </div>
      </div>
      
      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleCreate} className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Code</label>
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="Code" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Name</label>
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50" disabled={loading}>Create</button>
      </form>

      <MappingPreviewModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        rows={previewData?.rows ?? []}
        onConfirm={async (mappings) => {
            console.log('Mapping confirmed:', mappings);
            setModalOpen(false);
            loadItems();
        }}
      />
      
      <div className="flex gap-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <input type="text" placeholder="시즌 선택" className="border px-2 py-1 rounded" />
          <input type="date" className="border px-2 py-1 rounded" />
          <select className="border px-2 py-1 rounded">
              <option>자재 분류</option>
              <option>원단</option>
              <option>부자재</option>
          </select>
          <label className="flex items-center gap-1">
              <input type="checkbox" /> 미입고 잔량
          </label>
      </div>

      <table className="w-full">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="px-4 py-2 text-left">Code</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-mono">{item.code}</td>
              <td className="px-4 py-2">{item.name}</td>
              <td className="px-4 py-2 text-sm text-gray-500">{item.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
