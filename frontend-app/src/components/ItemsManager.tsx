import React, { useState, useEffect, useCallback } from 'react';
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
      // 백엔드 응답 구조에 따라 배열 추출 (응답이 바로 배열이거나 {data: []} 형태일 것으로 가정)
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setItems(data);
    } catch (error) {
      console.error('Failed to load items:', error);
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
      loadItems();
      setNewItem({ code: '', name: '', type: 'RAW_MATERIAL' });
    } catch (error) {
      console.error('Failed to create item:', error);
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
