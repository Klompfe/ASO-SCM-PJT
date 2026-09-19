import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getExportPerformance, type ExportPerformance } from '../api/exportShipments.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import { describePerformanceFilters, formatQtyByUnit, performanceColumns } from '../utils/exportPerformanceReport';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
const td = 'border border-gray-300 px-2 py-1 align-top';

// PR-119: 수출 실적표(선적관리 > 수출 실적표). 확정(FINALIZED) 문서만 집계하고, INVOICE 일자 기간으로 조회한다.
export const ExportPerformanceReport: React.FC = () => {
  const [data, setData] = useState<(ExportPerformance & { excludedNotFinalized: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const load = useCallback(async (f: { from?: string; to?: string } = {}) => {
    setLoading(true);
    try {
      setApplied(f);
      setData(await getExportPerformance(f));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수출 실적을 불러오는 데 실패했습니다.'));
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

  const shipments = data?.shipments ?? [];

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">INVOICE 일자 From</label>
          <input type="date" aria-label="INVOICE 일자 From" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">INVOICE 일자 To</label>
          <input type="date" aria-label="INVOICE 일자 To" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleReset} className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">초기화</button>
      </form>

      {loading || !data ? (
        <div className="p-4 text-gray-500">불러오는 중...</div>
      ) : (
        <PrintableReport
          title="수출 실적표"
          subtitle={describePerformanceFilters(applied)}
          columns={performanceColumns}
          rows={shipments}
          fileName="수출_실적표"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2" data-testid="perf-summary">
            {[
              ['수출 건수', `${data.totals.shipmentCount}건`, `라인 ${data.totals.lineCount}개`],
              ['총 수량', formatQtyByUnit(data.totals.qtyByUnit), '단위별 합계'],
              ['총 금액', fmt(data.totals.amount), data.totals.linesWithoutAmount > 0 ? `단가 미정 ${data.totals.linesWithoutAmount}라인(0으로 계산)` : ' '],
              ['제외된 미확정', `${data.excludedNotFinalized}건`, 'DRAFT/REVIEWED (같은 기간)'],
            ].map(([label, value, sub]) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold mt-1 text-gray-900 break-words">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-1">
            브랜드별 소계 <span className="font-normal text-xs text-gray-400">(라인 단위로 분류 · 건수는 해당 브랜드 라인이 있는 문서 수라 합이 전체와 다를 수 있음)</span>
          </h4>
          <table className="w-full text-sm border-collapse mb-4" data-testid="perf-brand-table">
            <thead>
              <tr>
                <th className={th}>브랜드</th>
                <th className={`${th} text-right`}>수출 건수</th>
                <th className={`${th} text-right`}>라인 수</th>
                <th className={`${th} text-right`}>수량</th>
                <th className={`${th} text-right`}>금액</th>
              </tr>
            </thead>
            <tbody>
              {data.byBrand.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={5}>집계할 확정 문서가 없습니다.</td></tr>}
              {data.byBrand.map((b) => (
                <tr key={b.brand}>
                  <td className={td}>{b.brand}</td>
                  <td className={`${td} text-right`}>{b.shipmentCount}건</td>
                  <td className={`${td} text-right`}>{b.lineCount}</td>
                  <td className={`${td} text-right`}>{formatQtyByUnit(b.qtyByUnit)}</td>
                  <td className={`${td} text-right`}>{fmt(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="text-sm font-semibold text-gray-700 mb-1">
            거래처별 소계 <span className="font-normal text-xs text-gray-400">(스타일의 거래처(StyleOverview.buyer)로 라인 단위 분류 · 거래처 정보가 없으면 미분류)</span>
          </h4>
          <table className="w-full text-sm border-collapse mb-4" data-testid="perf-buyer-table">
            <thead>
              <tr>
                <th className={th}>거래처</th>
                <th className={`${th} text-right`}>수출 건수</th>
                <th className={`${th} text-right`}>라인 수</th>
                <th className={`${th} text-right`}>수량</th>
                <th className={`${th} text-right`}>금액</th>
              </tr>
            </thead>
            <tbody>
              {data.byBuyer.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={5}>집계할 확정 문서가 없습니다.</td></tr>}
              {data.byBuyer.map((b) => (
                <tr key={b.buyer}>
                  <td className={td}>{b.buyer}</td>
                  <td className={`${td} text-right`}>{b.shipmentCount}건</td>
                  <td className={`${td} text-right`}>{b.lineCount}</td>
                  <td className={`${td} text-right`}>{formatQtyByUnit(b.qtyByUnit)}</td>
                  <td className={`${td} text-right`}>{fmt(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="text-sm font-semibold text-gray-700 mb-1">확정 문서 목록 ({shipments.length}건)</h4>
          <table className="w-full text-sm border-collapse" data-testid="perf-list">
            <thead>
              <tr>
                <th className={th}>INVOICE 일자</th>
                <th className={th}>문서번호</th>
                <th className={th}>스타일번호</th>
                <th className={th}>브랜드</th>
                <th className={th}>거래처</th>
                <th className={`${th} text-right`}>수량</th>
                <th className={`${th} text-right`}>금액</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={7}>조건에 맞는 확정 문서가 없습니다.</td></tr>}
              {shipments.map((s) => (
                <tr key={s.id} className="break-inside-avoid">
                  <td className={td}>{s.invoiceDate ?? '-'}</td>
                  <td className={td}>{s.sheetNo ?? '-'}</td>
                  <td className={td}>{s.styleNos.join(', ') || '-'}</td>
                  <td className={td}>{s.brands.join(', ') || '-'}</td>
                  <td className={td}>{s.buyers.join(', ') || '-'}</td>
                  <td className={`${td} text-right`}>{formatQtyByUnit(s.qtyByUnit)}</td>
                  <td className={`${td} text-right`}>
                    {fmt(s.amount)}
                    {s.linesWithoutAmount > 0 && <span className="block text-xs text-gray-400">단가 미정 {s.linesWithoutAmount}라인</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintableReport>
      )}
    </div>
  );
};
