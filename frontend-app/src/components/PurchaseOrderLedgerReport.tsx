import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPurchaseOrders, type GetPurchaseOrdersFilter, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getSuppliers, type Supplier } from '../api/suppliers.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import {
  PO_STATUS_LABELS,
  amountOf,
  describePurchaseOrderFilters,
  purchaseOrderColumns,
  summarizeBySupplier,
  summarizeByStatus,
} from '../utils/purchaseOrderReport';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const STATUS_COLORS: Record<string, string> = { PENDING: 'text-yellow-600', RECEIVED: 'text-green-600', CANCELLED: 'text-gray-500' };

interface Applied { supplierId?: number; supplierName?: string; status?: string; startDate?: string; endDate?: string }

// PR-116: "발주 원장" 관점의 목록형 보고서(발주관리 > 발주 현황표). 오더관리 > "발주·입고·출고 현황"
// (ProcurementStatusReport, 스타일/공정 단계 추적)과는 별개 화면이다.
export const PurchaseOrderLedgerReport: React.FC = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applied, setApplied] = useState<Applied>({});

  const load = useCallback(async (a: Applied = {}) => {
    setLoading(true);
    try {
      setApplied(a);
      const filter: GetPurchaseOrdersFilter = {
        ...(a.supplierId ? { supplierId: a.supplierId } : {}),
        ...(a.status ? { status: a.status as GetPurchaseOrdersFilter['status'] } : {}),
        ...(a.startDate ? { startDate: a.startDate } : {}),
        ...(a.endDate ? { endDate: a.endDate } : {}),
      };
      const res = await getPurchaseOrders(filter);
      setOrders(Array.isArray(res) ? res : (res?.items ?? []));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getSuppliers().then((r) => setSuppliers(Array.isArray(r) ? r : [])).catch(() => setSuppliers([]));
  }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      toast.error('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    load({
      supplierId: supplierId ? Number(supplierId) : undefined,
      supplierName: suppliers.find((s) => String(s.id) === supplierId)?.name,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleReset = () => {
    setSupplierId(''); setStatus(''); setStartDate(''); setEndDate('');
    load();
  };

  const byStatus = summarizeByStatus(orders);
  const bySupplier = summarizeBySupplier(orders);
  const supplierTotal = bySupplier.reduce((a, s) => a + s.amount, 0);
  const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
  const td = 'border border-gray-300 px-2 py-1';

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">발주일 From</label>
          <input type="date" aria-label="발주일 From" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">발주일 To</label>
          <input type="date" aria-label="발주일 To" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">공급업체</label>
          <select aria-label="공급업체 필터" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">전체</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">상태</label>
          <select aria-label="상태 필터" value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">전체</option>
            {Object.entries(PO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleReset} className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">초기화</button>
      </form>

      {loading ? (
        <div className="p-4 text-gray-500">불러오는 중...</div>
      ) : (
        <PrintableReport
          title="발주 현황표 (발주 원장)"
          subtitle={describePurchaseOrderFilters(applied)}
          columns={purchaseOrderColumns}
          rows={orders}
          fileName="발주_현황표"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">상태별 집계</h4>
              <table className="w-full text-sm border-collapse" data-testid="status-summary">
                <thead><tr><th className={th}>상태</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>금액 합계</th></tr></thead>
                <tbody>
                  {byStatus.map((s) => (
                    <tr key={s.status}>
                      <td className={`${td} font-medium ${STATUS_COLORS[s.status]}`}>{PO_STATUS_LABELS[s.status]}</td>
                      <td className={`${td} text-right`}>{s.count}건</td>
                      <td className={`${td} text-right`}>{fmt(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">공급업체별 발주 금액 <span className="font-normal text-xs text-gray-400">(취소 제외)</span></h4>
              <table className="w-full text-sm border-collapse" data-testid="supplier-summary">
                <thead><tr><th className={th}>공급업체</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>금액 합계</th></tr></thead>
                <tbody>
                  {bySupplier.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={3}>해당 발주 없음</td></tr>}
                  {bySupplier.map((s) => (
                    <tr key={s.supplierId ?? 'none'}>
                      <td className={td}>{s.name}</td>
                      <td className={`${td} text-right`}>{s.count}건</td>
                      <td className={`${td} text-right`}>{fmt(s.amount)}</td>
                    </tr>
                  ))}
                  {bySupplier.length > 0 && (
                    <tr className="bg-gray-50 font-semibold"><td className={td}>합계</td><td className={`${td} text-right`}>{bySupplier.reduce((a, s) => a + s.count, 0)}건</td><td className={`${td} text-right`}>{fmt(supplierTotal)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <h4 className="text-sm font-semibold text-gray-700 mb-1">발주 목록 ({orders.length}건)</h4>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">조건에 맞는 발주가 없습니다.</p>
          ) : (
            <table className="w-full text-sm border-collapse" data-testid="order-list">
              <thead>
                <tr>
                  {['발주번호', '발주일', '품목', '수량', '단가', '금액', '공급업체', '상태', '비고'].map((h, i) => (
                    <th key={h} className={`${th} ${[3, 4, 5].includes(i) ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className={td}>#{o.id}</td>
                    <td className={td}>{o.createdAt ? String(o.createdAt).slice(0, 10) : '-'}</td>
                    <td className={td}>{o.item?.name ?? `#${o.itemId}`}</td>
                    <td className={`${td} text-right`}>{fmt(Number(o.quantity))}</td>
                    <td className={`${td} text-right`}>{o.unitPrice === null || o.unitPrice === undefined ? '-' : fmt(Number(o.unitPrice))}</td>
                    <td className={`${td} text-right`}>{fmt(amountOf(o))}</td>
                    <td className={td}>{o.supplier?.name ?? '-'}</td>
                    <td className={td}>{PO_STATUS_LABELS[o.status] ?? o.status}</td>
                    <td className={td}>{o.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PrintableReport>
      )}
    </div>
  );
};
