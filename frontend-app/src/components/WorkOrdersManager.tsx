import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getWorkOrders, updateWorkOrderStatus, type GetWorkOrdersFilter, type WorkOrder } from '../api/workOrders.service';

export const WorkOrdersManager: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<GetWorkOrdersFilter>({});

  const loadWorkOrders = useCallback(async () => {
    try {
      const res = await getWorkOrders(filter);
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setWorkOrders(data);
    } catch (error) {
      toast.error('작업 지시 목록을 불러오는 데 실패했습니다.');
      setWorkOrders([]);
    }
  }, [filter]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  const handleUpdateStatus = async (id: number) => {
    try {
      await updateWorkOrderStatus(id, { status: 'COMPLETED' });
      toast.success('작업 지시 상태가 변경되었습니다.');
      loadWorkOrders();
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Work Orders</h2>
      
      <div className="bg-gray-50 p-4 rounded-lg">
        <label className="text-sm text-gray-600 block mb-2">Filter by Status</label>
        <select className="border border-gray-300 rounded px-3 py-2 w-full md:w-64" onChange={(e) => setFilter({...filter, status: e.target.value})}>
          <option value="">All</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>
      
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((wo) => (
              <tr key={wo.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{wo.id}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {wo.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {wo.status !== 'COMPLETED' && (
                    <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" onClick={() => handleUpdateStatus(wo.id)}>Complete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
