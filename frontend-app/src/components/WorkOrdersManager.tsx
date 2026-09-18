import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getWorkOrders, createWorkOrder, updateWorkOrderStatus, type GetWorkOrdersFilter, type WorkOrder, type CreateWorkOrder } from '../api/workOrders.service';
import { getItems, type Item } from '../api/items.service';
import { WorkOrderUploadModal } from './WorkOrderUploadModal';
import { useNavigate } from 'react-router-dom'; // Assumed react-router usage
import { getErrorMessage } from '../utils/errorMessage';

const emptyCreateForm: CreateWorkOrder = { itemId: 0, targetQuantity: 1 };

export const WorkOrdersManager: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<GetWorkOrdersFilter>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [newWorkOrder, setNewWorkOrder] = useState<CreateWorkOrder>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate(); // For redirecting on auth error

  const handleAuthError = (error: any) => {
    // 401 Unauthorized handling
    if (error.response?.status === 401 || error.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token'); // Also check alternative key
      toast.error('세션이 만료되었습니다. 다시 로그인해주세요.', { id: 'auth-error' });
      navigate('/login');
    } else {
      toast.error(getErrorMessage(error, '오류가 발생했습니다.'));
    }
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) {
      throw { status: 401, message: '토큰이 없습니다.' };
    }
    return { Authorization: `Bearer ${token}` };
  };

  const loadWorkOrders = useCallback(async () => {
    try {
      // Explicit token check (though interceptor handles it, user asked for explicit handling)
      getAuthHeader();
      
      const res = await getWorkOrders(filter);
      // GET /work-orders는 배열이 아니라 페이지네이션 객체({items, meta})를 반환한다.
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
      setWorkOrders(data);
    } catch (error) {
      handleAuthError(error);
      setWorkOrders([]);
    }
  }, [filter, navigate]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  const loadItems = useCallback(async () => {
    try {
      const res = await getItems({ limit: 100 });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
      setItems(data);
    } catch (error) {
      handleAuthError(error);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkOrder.itemId || newWorkOrder.itemId <= 0) {
      toast.error('품목을 선택해 주세요.');
      return;
    }
    if (!newWorkOrder.targetQuantity || newWorkOrder.targetQuantity < 1) {
      toast.error('목표 수량은 1 이상이어야 합니다.');
      return;
    }
    setCreating(true);
    try {
      getAuthHeader();
      await createWorkOrder(newWorkOrder);
      toast.success('작업 지시가 등록되었습니다.');
      setNewWorkOrder(emptyCreateForm);
      loadWorkOrders();
    } catch (error) {
      handleAuthError(error);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: number) => {
    try {
      getAuthHeader();
      await updateWorkOrderStatus(id, { status: 'COMPLETED' });
      toast.success('작업 지시 상태가 변경되었습니다.');
      loadWorkOrders();
    } catch (error) {
      handleAuthError(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Work Orders</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded">이미지로 등록 (AI 분석)</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">직접 입력으로 등록</h3>
        <form onSubmit={handleCreateWorkOrder} className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">품목</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 w-64"
              value={newWorkOrder.itemId}
              onChange={(e) => setNewWorkOrder({ ...newWorkOrder, itemId: Number(e.target.value) })}
            >
              <option value={0}>선택하세요</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">목표 수량</label>
            <input
              type="number"
              min={1}
              className="border border-gray-300 rounded px-3 py-2 w-32"
              value={newWorkOrder.targetQuantity}
              onChange={(e) => setNewWorkOrder({ ...newWorkOrder, targetQuantity: Number(e.target.value) })}
            />
          </div>
          <button type="submit" disabled={creating} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {creating ? '등록 중...' : '작업 지시 등록'}
          </button>
        </form>
      </div>

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
              <th className="px-4 py-2 text-left">품목</th>
              <th className="px-4 py-2 text-left">목표 수량</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((wo) => (
              <tr key={wo.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{wo.id}</td>
                <td className="px-4 py-2">{wo.item ? `${wo.item.name} (${wo.item.code})` : wo.itemId}</td>
                <td className="px-4 py-2">{wo.targetQuantity}</td>
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

      <WorkOrderUploadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={loadWorkOrders}
      />
    </div>
  );
};
