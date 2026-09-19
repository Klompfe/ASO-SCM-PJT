import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getPackingReceiptsReport } from '../api/packingReceipts.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import {
  aggregateReceipts,
  describePackingFilters,
  flattenGroups,
  packingColumns,
  summarizeBySupplier,
  summarizeGroups,
  type PackingReceiptReportRow,
} from '../utils/packingReceiptReport';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
const td = 'border border-gray-300 px-2 py-1';

// PR-118: 부자재(카톤) 포장내역 집계 — 카톤 단위가 아니라 입고(발주/공급업체)별로 묶고 그 안에서
// 품목/색상별 총 수량·총 중량을 보여준다(발주관리 > 포장내역 집계).
export const PackingReceiptSummaryReport: React.FC = () => {
  const [receipts, setReceipts] = useState<PackingReceiptReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const load = useCallback(async (f: { from?: string; to?: string } = {}) => {
    setLoading(true);
    try {
      setApplied(f);
      const res = await getPackingReceiptsReport(f);
      setReceipts(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '포장내역을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (from && to && from > to) {
      toast.error('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    load({ from: from || undefined, to: to || undefined });
  };

  const handleReset = () => { setFrom(''); setTo(''); load(); };

  const groups = useMemo(() => aggregateReceipts(receipts), [receipts]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const summary = summarizeGroups(groups);
  const bySupplier = summarizeBySupplier(groups);

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">입고일 From</label>
          <input type="date" aria-label="입고일 From" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">입고일 To</label>
          <input type="date" aria-label="입고일 To" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleReset} className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">초기화</button>
      </form>

      {loading ? (
        <div className="p-4 text-gray-500">불러오는 중...</div>
      ) : (
        <PrintableReport
          title="포장내역 집계 (부자재 입고)"
          subtitle={describePackingFilters(applied)}
          columns={packingColumns}
          rows={flat}
          fileName="포장내역_집계"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="packing-summary">
            {[
              ['입고 건수', `${summary.receiptCount}건`],
              ['카톤 수', `${fmt(summary.cartonCount)}개`],
              ['총 수량', fmt(summary.totalQty)],
              ['총 중량', `${fmt(summary.totalWeightKg)} kg`],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {bySupplier.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">공급업체별 입고 합계</h4>
              <table className="w-full text-sm border-collapse" data-testid="packing-supplier-summary">
                <thead><tr><th className={th}>공급업체</th><th className={`${th} text-right`}>입고 건수</th><th className={`${th} text-right`}>수량</th><th className={`${th} text-right`}>중량(kg)</th></tr></thead>
                <tbody>
                  {bySupplier.map((s) => (
                    <tr key={s.name}>
                      <td className={td}>{s.name}</td>
                      <td className={`${td} text-right`}>{s.receiptCount}건</td>
                      <td className={`${td} text-right`}>{fmt(s.totalQty)}</td>
                      <td className={`${td} text-right`}>{fmt(s.totalWeightKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {groups.length === 0 && <p className="text-sm text-gray-500">조건에 맞는 포장내역이 없습니다.</p>}
          {groups.map((g) => (
            <section key={g.receiptId} className="mb-4 break-inside-avoid" data-testid={`packing-group-${g.receiptId}`}>
              <h4 className="text-sm font-semibold text-gray-800 mb-1">
                입고 #{g.receiptId} · 발주 #{g.purchaseOrderId} · {g.supplierName}
                <span className="font-normal text-gray-500"> · 입고일 {g.receivedDate || '-'}{g.remark ? ` · ${g.remark}` : ''}</span>
              </h4>
              <table className="w-full text-sm border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className={`${th} w-[34%]`}>품목</th>
                    <th className={`${th} w-[18%]`}>색상</th>
                    <th className={`${th} w-[12%] text-right`}>카톤 수</th>
                    <th className={`${th} w-[18%] text-right`}>수량</th>
                    <th className={`${th} w-[18%] text-right`}>중량(kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={`${l.itemName}|${l.color}`}>
                      <td className={td}>{l.itemName}</td>
                      <td className={td}>{l.color || '-'}</td>
                      <td className={`${td} text-right`}>{l.cartonCount}</td>
                      <td className={`${td} text-right`}>{fmt(l.qty)}</td>
                      <td className={`${td} text-right`}>{l.weightKg === null ? '-' : fmt(l.weightKg)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className={td} colSpan={2}>소계</td>
                    <td className={`${td} text-right`}>{g.cartonCount}</td>
                    <td className={`${td} text-right`}>{fmt(g.totalQty)}</td>
                    <td className={`${td} text-right`}>{g.totalWeightKg === null ? '-' : fmt(g.totalWeightKg)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ))}
        </PrintableReport>
      )}
    </div>
  );
};
