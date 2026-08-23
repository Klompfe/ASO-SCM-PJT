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

  return (
    <div>
      <h2>Items</h2>
      {loading && <p>Loading...</p>}
      <form onSubmit={handleCreate}>
        <input placeholder="Code" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} />
        <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
        <button type="submit" disabled={loading}>Create</button>
      </form>
      <ul>
        {items.map((item) => <li key={item.id}>{item.name} ({item.code})</li>)}
      </ul>
    </div>
  );
};
