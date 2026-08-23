import React, { useState, useEffect } from 'react';
import { getItems, createItem, type GetItemsFilter, type CreateItem } from '../api/items.service';

export const ItemsManager: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [filter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', type: 'RAW_MATERIAL' });
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadItems();
  }, [filter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res: any = await getItems(filter);
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createItem(newItem);
      loadItems();
      setNewItem({ code: '', name: '', type: 'RAW_MATERIAL' });
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
