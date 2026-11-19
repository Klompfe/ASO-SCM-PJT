import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getPurchaseOrders, type GetPurchaseOrdersFilter, type PurchaseOrder } from '../api/purchaseOrders.service';
import { type Supplier } from '../api/suppliers.service';
import { SearchSelectField } from './SearchSelectField';
import { searchSuppliers } from '../utils/searchFetchers';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import {
  PO_STATUS_LABELS,
  amountOf,
  describePurchaseOrderFilters,
  purchaseOrderColumnsFor,
  currencyOf,
  totalsOfSummary,
  summarizeBySupplier,
  summarizeByStatus,
} from '../utils/purchaseOrderReport';
import { formatAmount, formatTotals, formatUnitPrice, sumByCurrency, toKstDay, type CurrencyTotals } from '../utils/currency';
import { isUsd, type UsdRow } from '../utils/krwReference';
import { useImportRates } from '../hooks/useImportRates';
import { KrwReferenceNote, KrwReferenceTotal } from './KrwReferenceNote';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const STATUS_COLORS: Record<string, string> = { PENDING: 'text-yellow-600', RECEIVED: 'text-green-600', CANCELLED: 'text-gray-500' };

interface Applied { supplierId?: number; supplierName?: string; status?: string; startDate?: string; endDate?: string }

// PR-116: "발주 원장" 관점의 목록형 보고서(발주관리 > 발주 현황표). 오더관리 > "발주·입고·출고 현황"
// (ProcurementStatusReport, 스타일/공정 단계 추적)과는 별개 화면이다.
export const PurchaseOrderLedgerReport: React.FC = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  // PR-127: 공급업체 필터는 <select>(공급업체 전량 로드)가 아니라 서버 검색 선택이다. 선택 해제 = 전체.
  const [supplier, setSupplier] = useState<Supplier | null>(null);
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
  }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      toast.error('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    load({
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleReset = () => {
    setSupplier(null); setStatus(''); setStartDate(''); setEndDate('');
    load();
  };

  const byStatus = summarizeByStatus(orders);
  const bySupplier = summarizeBySupplier(orders);
  // PR-244b: 통화가 다른 값은 더하지 않는다 — 합계는 통화별로 따로(KRW 만 있으면 표시는 이전과 같다).
  const supplierTotals: CurrencyTotals = bySupplier.length > 0
    ? sumByCurrency(
        bySupplier.flatMap((s) => (Object.entries(totalsOfSummary(s)) as [string, number][]).map(([c, n]) => ({ c, n }))),
        (x) => x.n,
        (x) => x.c,
      )
    : {};
  // 환산 참고(표시 전용): USD 발주의 발주일별 수입환율. 같은 날짜는 한 번만 조회한다.
  const usdRowsOf = (list: PurchaseOrder[]): UsdRow[] =>
    list.filter((o) => isUsd(o.currency)).map((o) => ({ usdAmount: amountOf(o), date: toKstDay(o.createdAt) }));
  const allUsdDates = useMemo(
    () => orders.filter((o) => isUsd(o.currency)).map((o) => toKstDay(o.createdAt)).filter((d): d is string => !!d),
    [orders],
  );
  const { rates } = useImportRates(allUsdDates);
  const columns = purchaseOrderColumnsFor(orders);
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
          <SearchSelectField<Supplier>
            value={supplier}
            onChange={setSupplier}
            search={searchSuppliers}
            getKey={(s) => s.id}
            getLabel={(s) => s.name}
            renderRow={(s) => (<span>{s.name} <span className="text-gray-400 text-xs">{s.code}</span></span>)}
            ariaLabel="공급업체 필터"
            placeholder="전체 업체"
            title="공급업체 검색"
            allowClear
            className="w-56"
          />
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
          columns={columns}
          rows={orders}
          fileName="발주_현황표"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">상태별 집계</h4>
              <div className="overflow-x-auto">
              <table className="text-sm border-collapse" data-testid="status-summary">
                <thead><tr><th className={th}>상태</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>금액 합계</th></tr></thead>
                <tbody>
                  {byStatus.map((s) => (
                    <tr key={s.status}>
                      <td className={`${td} font-medium ${STATUS_COLORS[s.status]}`}>{PO_STATUS_LABELS[s.status]}</td>
                      <td className={`${td} text-right`}>{s.count}건</td>
                      <td className={`${td} text-right`}>
                        {formatTotals(totalsOfSummary(s))}
                        <KrwReferenceTotal rows={usdRowsOf(orders.filter((o) => o.status === s.status))} rates={rates} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">공급업체별 발주 금액 <span className="font-normal text-xs text-gray-400">(취소 제외)</span></h4>
              <div className="overflow-x-auto">
              <table className="text-sm border-collapse" data-testid="supplier-summary">
                <thead><tr><th className={th}>공급업체</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>금액 합계</th></tr></thead>
                <tbody>
                  {bySupplier.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={3}>해당 발주 없음</td></tr>}
                  {bySupplier.map((s) => (
                    <tr key={s.supplierId ?? 'none'}>
                      <td className={td}>{s.name}</td>
                      <td className={`${td} text-right`}>{s.count}건</td>
                      <td className={`${td} text-right`}>
                        {formatTotals(totalsOfSummary(s))}
                        <KrwReferenceTotal rows={usdRowsOf(orders.filter((o) => o.status !== 'CANCELLED' && (o.supplierId ?? null) === s.supplierId))} rates={rates} />
                      </td>
                    </tr>
                  ))}
                  {bySupplier.length > 0 && (
                    <tr className="bg-gray-50 font-semibold"><td className={td}>합계</td><td className={`${td} text-right`}>{bySupplier.reduce((a, s) => a + s.count, 0)}건</td><td className={`${td} text-right`}>{formatTotals(supplierTotals)}<KrwReferenceTotal rows={usdRowsOf(orders.filter((o) => o.status !== 'CANCELLED'))} rates={rates} /></td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <h4 className="text-sm font-semibold text-gray-700 mb-1">발주 목록 ({orders.length}건)</h4>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">조건에 맞는 발주가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="text-sm border-collapse" data-testid="order-list">
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
                    <td className={`${td} text-right`}>{o.unitPrice === null || o.unitPrice === undefined ? '-' : formatUnitPrice(Number(o.unitPrice), o.currency)}</td>
                    <td className={`${td} text-right`}>
                      {formatAmount(amountOf(o), currencyOf(o))}
                      {isUsd(o.currency) && <KrwReferenceNote usd={amountOf(o)} date={toKstDay(o.createdAt)} rates={rates} />}
                    </td>
                    <td className={td}>{o.supplier?.name ?? '-'}</td>
                    <td className={td}>{PO_STATUS_LABELS[o.status] ?? o.status}</td>
                    <td className={td}>{o.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </PrintableReport>
      )}
    </div>
  );
};
