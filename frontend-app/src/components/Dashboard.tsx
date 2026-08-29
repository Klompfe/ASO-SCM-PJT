import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getItems } from '../api/items.service';
import { getWorkOrders } from '../api/workOrders.service';
import { getShipments } from '../api/shipments.service';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ items: 0, workOrders: 0, shipments: 0 });
  const navigate = useNavigate();

  const handleAuthError = (error: any) => {
    console.error('Dashboard API Error:', error);
    if (error?.response?.status === 401 || error?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token');
      navigate('/login');
    } else {
      toast.error('대시보드 데이터를 불러오는 데 실패했습니다.');
    }
  };

  useEffect(() => {
    const loadStats = async () => {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const [items, wo, shipments] = await Promise.all([
          getItems({}).catch(() => []),
          getWorkOrders({}).catch(() => []),
          getShipments().catch(() => [])
        ]);

        setStats({
          items: Array.isArray(items) 
            ? items.length 
            : (Array.isArray(items?.data) ? items.data.length : 0),
          workOrders: Array.isArray(wo) 
            ? wo.filter((item: any) => item?.status !== 'COMPLETED').length 
            : (Array.isArray(wo?.data) ? wo.data.filter((item: any) => item?.status !== 'COMPLETED').length : 0),
          shipments: Array.isArray(shipments) 
            ? shipments.length 
            : (Array.isArray(shipments?.data) ? shipments.data.length : 0),
        });
      } catch (error) {
        handleAuthError(error);
      }
    };
    loadStats();
  }, [navigate]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">총 품목 수</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.items ?? 0}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">진행 중인 작업지시</h3>
        <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.workOrders ?? 0}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">총 출하 건수</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.shipments ?? 0}</p>
      </div>
    </div>
  );
};
