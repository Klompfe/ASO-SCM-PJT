import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getProcurementStatusReport, type ProcurementStatusRow } from '../api/orderProcessStages.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import type { ExcelColumn } from '../utils/excelExport';
import { PackingReceiptsModal } from './PackingReceiptsModal';

// PR-089: 종합상태별 색상 뱃지 — 회색=미발주, 노랑=입고대기, 파랑=출고대기, 초록=완료.
const STATUS_BADGE_STYLES: Record<string, string> = {
  미발주: 'bg-gray-100 text-gray-700',
  입고대기: 'bg-yellow-100 text-yellow-800',
  포장내역대기: 'bg-orange-100 text-orange-800',
  출고대기: 'bg-blue-100 text-blue-800',
  완료: 'bg-green-100 text-green-800',
};

// PR-179: 미진한 상태(미발주/입고대기/포장내역대기)는 행에서 바로 조치할 수 있게 인라인 액션을 단다.
// 발주 화면으로 넘어가는 액션은 onGoToPurchaseOrders로 탭만 바꾸고, 포장내역 등록은 이 화면에서 모달로 연다.
interface ProcurementStatusReportProps {
  onGoToPurchaseOrders?: () => void;
}

export const ProcurementStatusReport: React.FC<ProcurementStatusReportProps> = ({ onGoToPurchaseOrders }) => {
  const [packingFor, setPackingFor] = useState<{ purchaseOrderId: number; styleNo: string } | null>(null);
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

  const excelColumns: ExcelColumn<ProcurementStatusRow>[] = [
    { header: 'Style No', accessor: (r) => r.styleNo },
    { header: '브랜드·고객사', accessor: (r) => r.buyer ?? '' },
    { header: '발주상태', accessor: (r) => (r.poCreated ? '발주완료' : '미발주') },
    { header: '입고상태', accessor: (r) => `${r.materialReadiness.ready}/${r.materialReadiness.total} 입고완료` },
    { header: '출고상태', accessor: (r) => (r.exported ? '출고완료' : '출고전') },
    { header: '종합상태', accessor: (r) => r.overallStatus },
  ];

  return (
    <PrintableReport
      title={`발주·입고·출고 현황 (${filteredRows.length}건)`}
      subtitle={filter ? `검색어: ${filter}` : undefined}
      columns={excelColumns}
      rows={filteredRows}
      fileName="발주_입고_출고_현황"
    >
      <div className="flex justify-end items-center mb-3 print:hidden">
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
          <table className="border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">Style No</th>
                <th className="p-2">브랜드·고객사</th>
                <th className="p-2">발주상태</th>
                <th className="p-2">입고상태</th>
                <th className="p-2">출고상태</th>
                <th className="p-2">종합상태</th>
                <th className="p-2 print:hidden">바로 조치</th>
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
                  <td className="p-2 print:hidden whitespace-nowrap">
                    {r.overallStatus === '미발주' && onGoToPurchaseOrders && (
                      <button className="text-sm text-blue-600 hover:underline" onClick={onGoToPurchaseOrders}>발주하기</button>
                    )}
                    {r.overallStatus === '입고대기' && onGoToPurchaseOrders && (
                      <button className="text-sm text-blue-600 hover:underline" onClick={onGoToPurchaseOrders}>발주 보기</button>
                    )}
                    {r.overallStatus === '포장내역대기' && r.packingPendingPurchaseOrderId != null && (
                      <button
                        className="text-sm text-purple-700 hover:underline"
                        onClick={() => setPackingFor({ purchaseOrderId: r.packingPendingPurchaseOrderId as number, styleNo: r.styleNo })}
                      >포장내역 등록</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {packingFor && (
        <PackingReceiptsModal
          purchaseOrderId={packingFor.purchaseOrderId}
          purchaseOrderLabel={`${packingFor.styleNo} · 발주 #${packingFor.purchaseOrderId}`}
          onClose={() => { setPackingFor(null); load(); }}
        />
      )}
    </PrintableReport>
  );
};
