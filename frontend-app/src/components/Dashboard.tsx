import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getItems } from '../api/items.service';
import { getWorkOrders } from '../api/workOrders.service';
import { getShipments } from '../api/shipments.service';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ items: 0, workOrders: 0, shipments: 0 });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [items, wo, shipments] = await Promise.all([
          getItems({}),
          getWorkOrders({}),
          getShipments()
        ]);
        setStats({
          items: Array.isArray(items) ? items.length : (items?.data?.length || 0),
          workOrders: Array.isArray(wo) ? wo.filter(item => item.status !== 'COMPLETED').length : (wo?.data?.filter((item: any) => item.status !== 'COMPLETED').length || 0),
          shipments: Array.isArray(shipments) ? shipments.length : (shipments?.data?.length || 0),
        });
      } catch (error) {
        toast.error('대시보드 데이터를 불러오는 데 실패했습니다.');
      }
    };
    loadStats();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">총 품목 수</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.items}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">진행 중인 작업지시</h3>
        <p className="text-3xl font-bold text-blue-600 mt-2">{stats.workOrders}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-500">총 출하 건수</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.shipments}</p>
      </div>
    </div>
  );
};
