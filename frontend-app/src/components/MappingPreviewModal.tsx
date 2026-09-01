import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface MappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; 
  onRefresh: () => void;
}

export const MappingPreviewModal: React.FC<MappingPreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  onRefresh,
}) => {
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [styleOverview, setStyleOverview] = useState<any>(data?.overview || {});
  const [editingItem, setEditingItem] = useState<any | null>(null);
  
  // Debug log
  useEffect(() => {
    console.log('[FRONTEND RECEIVED]', data);
  }, [data]);
  
  const isMatch = data?.matchStatus === 'MATCH';
  const isInvalid = data?.matchStatus === 'INVALID_HEADER';

  useEffect(() => {
    if (!isOpen) return;
    setBomItems(data?.bomItems || []);
    setStyleOverview(data?.overview || {});
  }, [data, isOpen]);

  const handleSaveItem = (updatedItem: any) => {
    setBomItems(prev => prev.map(r => r === editingItem ? updatedItem : r));
    setEditingItem(null);
  };

  const handleCommit = async () => {
    const payload = {
      styleNo: data?.styleNo || 'UNKNOWN',
      overviewData: styleOverview,
      bomItems: bomItems
    };
    try {
      await axios.post('/mapping/commit', payload);
      alert('저장 성공!');
      onRefresh();
      onClose();
    } catch (e) {
      alert('Commit failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        
        {/* Style Overview Card */}
        <div className="bg-gray-50 p-4 rounded border mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold">Style: {data?.styleNo || 'N/A'}</h3>
            <span className={`px-2 py-1 rounded text-sm font-bold ${isMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {data?.matchStatus || 'UNKNOWN'}
            </span>
          </div>
          {isInvalid && <div className="bg-red-600 text-white p-2 rounded mb-2 text-sm">{data?.message || 'Error'}</div>}
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><strong>공장:</strong> {styleOverview.factory}</div>
            <div><strong>총 생산수량:</strong> {styleOverview.totalQty}</div>
            <div><strong>바이어:</strong> {styleOverview.buyer}</div>
            <div><strong>선적일:</strong> {styleOverview.shipDate}</div>
          </div>
        </div>

        {/* BOM Table */}
        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2">카테고리</th>
                <th className="border p-2">자재명</th>
                <th className="border p-2">요척</th>
                <th className="border p-2">필요량</th>
                <th className="border p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {bomItems.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.category}</td>
                  <td className="border p-2">{item.itemName}</td>
                  <td className="border p-2">{item.consumption}</td>
                  <td className="border p-2">{item.requiredQty}</td>
                  <td className="border p-2 text-center">
                    <button onClick={() => setEditingItem(item)} className="text-blue-600">수정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
          <button onClick={handleCommit} disabled={!isMatch} className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">저장 및 승인</button>
        </div>
      </div>
    </div>
  );
};
