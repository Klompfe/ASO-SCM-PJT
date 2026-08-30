import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ValidationError {
  row: number;
  message: string;
}

interface MappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any; // API 응답 객체 자체를 받을 수 있도록 변경
  onConfirm: (mappings: { rawKey: string; standardKey: string }[]) => void;
}

export const MappingPreviewModal: React.FC<MappingPreviewModalProps> = ({
  isOpen,
  onClose,
  rows,
  onConfirm,
}) => {
  const [displayRows, setDisplayRows] = useState<any[]>([]);
  const [editingRow, setEditingRow] = useState<any | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const responseData = rows?.data?.data || rows?.data || rows;
    const rowsArray = responseData?.rows || responseData?.items || (Array.isArray(responseData) ? responseData : []);
    setDisplayRows(Array.isArray(rowsArray) ? rowsArray.map((r, i) => ({ ...r, id: r.id || `item_${i}` })) : []);
  }, [rows, isOpen]);

  const handleSave = (updatedRow: any) => {
    setDisplayRows(prev => prev.map(r => r.id === updatedRow.id ? updatedRow : r));
    setEditingRow(null);
  };

  const handleDelete = (id: string) => {
    setDisplayRows(prev => prev.filter(r => r.id !== id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">데이터 매핑 프리뷰 및 수정</h3>
          <button onClick={() => setEditingRow({})} className="px-3 py-1 bg-green-600 text-white rounded">+ 신규 자재 추가</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">Row</th>
                <th className="border p-2">자재명</th>
                <th className="border p-2">QTY</th>
                <th className="border p-2">COLOR OF</th>
                <th className="border p-2">SPEC</th>
                <th className="border p-2">요척</th>
                <th className="border p-2">필요량</th>
                <th className="border p-2">공급처</th>
                <th className="border p-2">비고</th>
                <th className="border p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="border p-2">{index + 1}</td>
                  <td className="border p-2">{row.itemName}</td>
                  <td className="border p-2">{row.orderQty}</td>
                  <td className="border p-2">{row.colorOf}</td>
                  <td className="border p-2">{row.spec}</td>
                  <td className="border p-2">{row.consumption}</td>
                  <td className="border p-2">{row.requiredQty}</td>
                  <td className="border p-2">{row.supplier}</td>
                  <td className="border p-2">{row.remarks}</td>
                  <td className="border p-2">
                    <button onClick={() => setEditingRow(row)} className="text-blue-600 mr-2">수정</button>
                    <button onClick={() => handleDelete(row.id)} className="text-red-600">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingRow && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h4 className="font-bold mb-4">자재 상세 정보 편집</h4>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: '자재명', key: 'itemName' },
                        { label: 'QTY', key: 'orderQty' },
                        { label: 'COLOR OF', key: 'colorOf' },
                        { label: 'SPEC', key: 'spec' },
                        { label: '요척', key: 'consumption' },
                        { label: '필요량', key: 'requiredQty' },
                        { label: '공급처', key: 'supplier' },
                        { label: '비고', key: 'remarks' },
                    ].map(field => (
                        <div key={field.key}>
                            <label className="block text-xs font-bold">{field.label}</label>
                            <input className="w-full border p-1 rounded" value={editingRow[field.key] || ''} onChange={(e) => setEditingRow({...editingRow, [field.key]: e.target.value})} />
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setEditingRow(null)} className="px-4 py-2 bg-gray-300 rounded">취소</button>
                    <button onClick={() => handleSave(editingRow)} className="px-4 py-2 bg-blue-600 text-white rounded">저장</button>
                </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
          <button onClick={() => onConfirm(displayRows)} className="px-4 py-2 bg-blue-600 text-white rounded">저장 및 승인</button>
        </div>
      </div>
    </div>
  );
};
