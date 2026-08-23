import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItems, createItem, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';

export const ItemsManager: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [filter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', type: 'RAW_MATERIAL' });
  const [loading, setLoading] = useState<boolean>(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getItems(filter);
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
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

  const downloadCSV = () => {
    const headers = ['Code', 'Name', 'Type'];
    const csvContent = [
      headers.join(','),
      ...items.map(item => [item.code, item.name, item.type].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'items.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Items</h2>
        <button onClick={downloadCSV} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700">Download CSV</button>
      </div>
      
      <form onSubmit={handleCreate} className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
        {/* ...기존 폼 유지... */}
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

      {loading && <p className="text-blue-600">Loading...</p>}
      
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* ...기존 테이블 유지... */}
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
    </div>
  );
};
