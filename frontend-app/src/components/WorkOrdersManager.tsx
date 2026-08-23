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
    <div>
      <h2>Work Orders</h2>
      <select onChange={(e) => setFilter({...filter, status: e.target.value})}>
        <option value="">All</option>
        <option value="PLANNED">Planned</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="COMPLETED">Completed</option>
      </select>
      <ul>
        {workOrders.map((wo) => (
          <li key={wo.id}>
            {wo.id} - {wo.status}
            {wo.status !== 'COMPLETED' && <button onClick={() => handleUpdateStatus(wo.id)}>Complete</button>}
          </li>
        ))}
      </ul>
    </div>
  );
};
