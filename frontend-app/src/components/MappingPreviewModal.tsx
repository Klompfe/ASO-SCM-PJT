import React, { useState } from 'react';

interface ValidationError {
  row: number;
  message: string;
}

interface MappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  onConfirm: (mappings: { rawKey: string; standardKey: string }[]) => void;
}

export const MappingPreviewModal: React.FC<MappingPreviewModalProps> = ({
  isOpen,
  onClose,
  rows = [],
  onConfirm,
}) => {
  const [manualMappings, setManualMappings] = useState<{ rawKey: string; standardKey: string }[]>([]);

  if (!isOpen) return null;

  const handleManualMap = (rawKey: string, standardKey: string) => {
    setManualMappings(prev => [...prev, { rawKey, standardKey }]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">데이터 매핑 프리뷰 및 승인</h3>
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Row</th>
              <th className="border p-2">Style No</th>
              <th className="border p-2">Color</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasError = row.errors && row.errors.length > 0;
              return (
                <tr key={row.rowNum} className={hasError ? 'bg-red-100' : (row.status === 'NEW_MASTER_CANDIDATE' ? 'bg-yellow-50' : '')}>
                  <td className="border p-2">{row.rowNum}</td>
                  <td className="border p-2">{row.styleNo}</td>
                  <td className="border p-2">{row.color}</td>
                  <td className="border p-2">
                    <span className={`px-2 py-1 rounded text-xs ${row.status === 'NEW_MASTER_CANDIDATE' ? 'bg-yellow-200' : 'bg-green-200'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="border p-2">
                    {row.status === 'NEW_MASTER_CANDIDATE' && (
                      <button 
                        onClick={() => handleManualMap(row.color, 'AUTO_ASSIGNED_MATERIAL')}
                        className="text-blue-600 underline"
                      >
                        자재 매핑 승인
                      </button>
                    )}
                    {hasError && <span className="text-red-600 block text-xs" title={row.errors.join(', ')}>{row.errors[0]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
          <button onClick={() => onConfirm(manualMappings)} disabled={rows.some(r => r.errors?.length > 0)} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">저장 및 승인</button>
        </div>
      </div>
    </div>
  );
};
