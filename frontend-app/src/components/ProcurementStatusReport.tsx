import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getProcurementStatusReport, type ProcurementStatusRow } from '../api/orderProcessStages.service';
import { getErrorMessage } from '../utils/errorMessage';

// PR-089: 종합상태별 색상 뱃지 — 회색=미발주, 노랑=입고대기, 파랑=출고대기, 초록=완료.
const STATUS_BADGE_STYLES: Record<string, string> = {
  미발주: 'bg-gray-100 text-gray-700',
  입고대기: 'bg-yellow-100 text-yellow-800',
  출고대기: 'bg-blue-100 text-blue-800',
  완료: 'bg-green-100 text-green-800',
};

export const ProcurementStatusReport: React.FC = () => {
  const [rows, setRows] = useState<ProcurementStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProcurementStatusReport();
      setRows(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '발주·입고·출고 현황을 불러오는 데 실패했습니다.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(
      (r) =>
        r.styleNo.toLowerCase().includes(keyword) ||
        (r.buyer ?? '').toLowerCase().includes(keyword),
    );
  }, [rows, filter]);

  if (loading) {
    return <div className="p-4 text-gray-500">불러오는 중...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">발주·입고·출고 현황 ({filteredRows.length}건)</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="브랜드·고객사 또는 스타일번호 검색"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
        </div>
      </div>
      {filteredRows.length === 0 ? (
        <p className="text-sm text-gray-500">해당하는 오더가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">Style No</th>
                <th className="p-2">브랜드·고객사</th>
                <th className="p-2">발주상태</th>
                <th className="p-2">입고상태</th>
                <th className="p-2">출고상태</th>
                <th className="p-2">종합상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.styleNo} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.styleNo}</td>
                  <td className="p-2">{r.buyer ?? '-'}</td>
                  <td className="p-2">{r.poCreated ? '발주완료' : '미발주'}</td>
                  <td className="p-2">
                    {r.materialReadiness.ready}/{r.materialReadiness.total} 입고완료
                  </td>
                  <td className="p-2">{r.exported ? '출고완료' : '출고전'}</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_BADGE_STYLES[r.overallStatus] ?? 'bg-gray-100 text-gray-700'}`}
                    >
                      {r.overallStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
