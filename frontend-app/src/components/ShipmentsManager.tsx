import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getShipments, createShipment, type CreateShipment, type Shipment } from '../api/shipments.service';

export const ShipmentsManager: React.FC = () => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [newShipment, setNewShipment] = useState<CreateShipment>({ shipmentNumber: '' });

  const loadShipments = useCallback(async () => {
    try {
      const res = await getShipments();
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setShipments(data);
    } catch (error) {
      toast.error('출하 목록을 불러오는 데 실패했습니다.');
      setShipments([]);
    }
  }, []);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createShipment(newShipment);
      toast.success('출하가 생성되었습니다.');
      loadShipments();
      setNewShipment({ shipmentNumber: '' });
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    }
  };

  return (
    <div>
      <h2>Shipments</h2>
      <form onSubmit={handleCreate}>
        <input placeholder="Shipment Number" value={newShipment.shipmentNumber} onChange={(e) => setNewShipment({...newShipment, shipmentNumber: e.target.value})} />
        <button type="submit">Create</button>
      </form>
      <ul>
        {shipments.map((s) => <li key={s.id}>{s.shipmentNumber} - {s.status}</li>)}
      </ul>
    </div>
  );
};
