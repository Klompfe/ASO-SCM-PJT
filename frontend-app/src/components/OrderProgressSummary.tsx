import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getOrderProgressSummary, type OrderProgressSummaryRow } from '../api/orderProgressSummary.service';
import { getErrorMessage } from '../utils/errorMessage';

interface Props {
  onSelectStyle: (styleNo: string) => void;
}

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  APPROVED: '승인됨',
  PENDING_APPROVAL: '승인대기',
  NONE: '계약없음',
};

const calculateDDay = (targetRdd: string | null): number | null => {
  if (!targetRdd) return null;
  const diff = new Date(targetRdd).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 3600 * 24));
};

const pct = (rate: number) => `${Math.round(rate)}%`;

export const OrderProgressSummary: React.FC<Props> = ({ onSelectStyle }) => {
  const [rows, setRows] = useState<OrderProgressSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrderProgressSummary();
      setRows(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '진행현황 요약을 불러오는 데 실패했습니다.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 이행률 낮은 순 우선, 같으면 D-day 가까운(임박/초과) 순 — 위험한 오더가 위로 오게.
  // D-day가 없는 행(납기 미입력)은 정렬 안정성을 위해 맨 뒤로 보낸다.
  const sortedRows = [...rows].sort((a, b) => {
    if (a.fulfillmentRate !== b.fulfillmentRate) return a.fulfillmentRate - b.fulfillmentRate;
    const ddayA = calculateDDay(a.targetRdd);
    const ddayB = calculateDDay(b.targetRdd);
    if (ddayA === null && ddayB === null) return 0;
    if (ddayA === null) return 1;
    if (ddayB === null) return -1;
    return ddayA - ddayB;
  });

  if (loading) {
    return <div className="p-4 text-gray-500">불러오는 중...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">오더 진행현황 요약 ({rows.length}건)</h3>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 오더가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">Style No</th>
                <th className="p-2">공장</th>
                <th className="p-2">바이어</th>
                <th className="p-2">RDD</th>
                <th className="p-2">계약상태</th>
                <th className="p-2">재단%</th>
                <th className="p-2">봉제%</th>
                <th className="p-2">포장%</th>
                <th className="p-2">출고율</th>
                <th className="p-2">이행률</th>
                <th className="p-2">납기상태</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.styleNo}
                  onClick={() => onSelectStyle(r.styleNo)}
                  className={`cursor-pointer hover:bg-blue-50 border-t ${r.contractStatus === 'PENDING_APPROVAL' ? 'bg-yellow-50' : ''}`}
                >
                  <td className="p-2 font-medium">{r.styleNo}</td>
                  <td className="p-2">{r.factory ?? '-'}</td>
                  <td className="p-2">{r.buyer ?? '-'}</td>
                  <td className="p-2">{r.targetRdd ?? '-'}</td>
                  <td className="p-2">{CONTRACT_STATUS_LABELS[r.contractStatus] ?? r.contractStatus}</td>
                  <td className="p-2">{pct(r.stages.CUTTING.rate)}</td>
                  <td className="p-2">{pct(r.stages.SEWING.rate)}</td>
                  <td className="p-2">{pct(r.stages.PACKING.rate)}</td>
                  <td className="p-2">{pct(r.shipRate)}</td>
                  <td className="p-2 font-semibold">{pct(r.fulfillmentRate)}</td>
                  <td className={`p-2 ${r.deliveryStatus === '납기지연' ? 'text-red-600' : r.deliveryStatus === '정상납품' ? 'text-green-600' : 'text-gray-600'}`}>
                    {r.deliveryStatus}
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
