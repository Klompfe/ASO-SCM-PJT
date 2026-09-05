import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getWorkOrders, updateWorkOrderStatus, type GetWorkOrdersFilter, type WorkOrder } from '../api/workOrders.service';
import { WorkOrderUploadModal } from './WorkOrderUploadModal';
import { useNavigate } from 'react-router-dom'; // Assumed react-router usage
import { getErrorMessage } from '../utils/errorMessage';

export const WorkOrdersManager: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<GetWorkOrdersFilter>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
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
        <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded">작업지시서 이미지 업로드</button>
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

      <WorkOrderUploadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={loadWorkOrders}
      />
    </div>
  );
};
