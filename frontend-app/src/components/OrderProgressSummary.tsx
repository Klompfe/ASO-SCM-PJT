import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getOrderProgressSummary, type OrderProgressSummaryRow } from '../api/orderProgressSummary.service';
import { bulkApproveContracts } from '../api/contracts.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import type { ExcelColumn } from '../utils/excelExport';

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
  const [bulkApproving, setBulkApproving] = useState(false);

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

  const pendingCount = rows.filter((r) => r.contractStatus === 'PENDING_APPROVAL').length;

  // PR-090: 이 화면은 스타일당 계약상태 하나만 보여줄 뿐 개별 계약 id는 갖고 있지
  // 않으므로(한 스타일에 계약이 여러 건 쌓일 수 있음), ids 없이 호출해 서버가
  // 현재 PENDING_APPROVAL 전체를 대상으로 하게 한다.
  const handleBulkApprove = async () => {
    if (pendingCount === 0) return;
    const confirmed = window.confirm(`현재 미승인 상태인 계약 ${pendingCount}건을 모두 승인하시겠습니까?`);
    if (!confirmed) return;

    setBulkApproving(true);
    try {
      const result = await bulkApproveContracts();
      if (result.failed.length > 0) {
        toast.error(`${result.approvedCount}건 승인, ${result.failed.length}건 실패`);
      } else {
        toast.success(`${result.approvedCount}건 모두 승인되었습니다.`);
      }
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '일괄승인에 실패했습니다.'));
    } finally {
      setBulkApproving(false);
    }
  };

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

  const excelColumns: ExcelColumn<OrderProgressSummaryRow>[] = [
    { header: 'Style No', accessor: (r) => r.styleNo },
    { header: '공장', accessor: (r) => r.factory ?? '' },
    { header: '바이어', accessor: (r) => r.buyer ?? '' },
    { header: 'RDD', accessor: (r) => r.targetRdd ?? '' },
    { header: '계약상태', accessor: (r) => CONTRACT_STATUS_LABELS[r.contractStatus] ?? r.contractStatus },
    { header: '재단%', accessor: (r) => Math.round(r.stages.CUTTING.rate) },
    { header: '봉제%', accessor: (r) => Math.round(r.stages.SEWING.rate) },
    { header: '포장%', accessor: (r) => Math.round(r.stages.PACKING.rate) },
    { header: '출고율', accessor: (r) => Math.round(r.shipRate) },
    { header: '이행률', accessor: (r) => Math.round(r.fulfillmentRate) },
    { header: '납기상태', accessor: (r) => r.deliveryStatus },
  ];

  return (
    <PrintableReport
      title={`오더 진행현황 요약 (${rows.length}건)`}
      columns={excelColumns}
      rows={sortedRows}
      fileName="오더_진행현황_요약"
    >
      <div className="flex justify-end items-center mb-3 print:hidden">
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {bulkApproving ? '승인 중...' : `미승인 계약 일괄 승인 (${pendingCount}건)`}
            </button>
          )}
          <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
        </div>
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
    </PrintableReport>
  );
};
