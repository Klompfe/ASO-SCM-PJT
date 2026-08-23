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

  const downloadCSV = () => {
    const headers = ['Shipment Number', 'Status'];
    const csvContent = [
      headers.join(','),
      ...shipments.map(s => [s.shipmentNumber, s.status].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'shipments.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Shipments</h2>
        <button onClick={downloadCSV} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700">Download CSV</button>
      </div>
      
      <form onSubmit={handleCreate} className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Shipment Number</label>
          <input className="border border-gray-300 rounded px-3 py-2 w-64" placeholder="Shipment Number" value={newShipment.shipmentNumber} onChange={(e) => setNewShipment({...newShipment, shipmentNumber: e.target.value})} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">Create</button>
      </form>
      
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">Shipment Number</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shipments.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{s.shipmentNumber}</td>
                <td className="px-4 py-2">
                  <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
