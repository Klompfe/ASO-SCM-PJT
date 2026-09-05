import React, { useState, useEffect } from 'react';
import { commitMapping } from '../api/mapping.service';

interface MappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  alreadyExists?: boolean;
  onRefresh: () => void;
}

export const MappingPreviewModal: React.FC<MappingPreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  alreadyExists,
  onRefresh,
}) => {
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [styleOverview, setStyleOverview] = useState<any>(data?.overview || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBomItems(data?.bomItems || []);
    setStyleOverview(data?.overview || {});
  }, [data, isOpen]);

  const handleCommit = async () => {
    const payload = {
      styleNo: data?.styleNo || 'UNKNOWN',
      overviewData: styleOverview,
      bomItems: bomItems
    };
    setSaving(true);
    try {
      await commitMapping(payload);
      alert('저장 성공!');
      onRefresh();
      onClose();
    } catch (e) {
      alert('Commit failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
      <div className="p-6 overflow-y-auto flex-1 min-h-0">

        {/* Style Overview Card */}
        <div className="bg-gray-50 p-4 rounded border mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold">Style: {data?.styleNo || 'N/A'}</h3>
            {alreadyExists && (
              <span className="px-2 py-1 rounded text-sm font-bold bg-yellow-100 text-yellow-800">
                이미 등록됨
              </span>
            )}
          </div>
          {alreadyExists && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 p-2 rounded mb-2 text-sm">
              이 Style No는 이미 등록되어 있습니다. 다시 승인하면 새로운 BOM/BOM Item이 추가로 쌓이며 기존 데이터는 자동으로 정리되지 않습니다(덮어쓰기 로직은 아직 구현되지 않음).
            </div>
          )}
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
              </tr>
            </thead>
            <tbody>
              {bomItems.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.category}</td>
                  <td className="border p-2">{item.itemName}</td>
                  <td className="border p-2">{item.consumption}</td>
                  <td className="border p-2">{item.requiredQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
        <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
        <button
          onClick={handleCommit}
          disabled={saving}
          className={`px-4 py-2 text-white rounded disabled:bg-gray-400 ${alreadyExists ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {alreadyExists ? '재승인(덮어쓰기)' : '저장 및 승인'}
        </button>
      </div>
      </div>
    </div>
  );
};
