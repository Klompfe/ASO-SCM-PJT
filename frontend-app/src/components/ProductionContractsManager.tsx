import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getProductionContracts,
  createProductionContract,
  deleteProductionContract,
  type ProductionContract,
  type ProductionContractPriceSource,
} from '../api/productionContracts.service';
import { type Supplier } from '../api/suppliers.service';
import { SearchSelectField } from './SearchSelectField';
import { searchSuppliers } from '../utils/searchFetchers';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import {
  PRICE_STATUS_LABELS,
  describeContractFilters,
  priceTextOf,
  productionContractColumns,
  summarizeContracts,
} from '../utils/productionContractReport';

const fmtNum = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

const emptyForm = {
  styleNo: '',
  priceSource: 'PRE_AGREED' as ProductionContractPriceSource,
  cmtPrice: '',
  quantity: '',
  contractDate: '',
  note: '',
};

export const ProductionContractsManager: React.FC = () => {
  const [contracts, setContracts] = useState<ProductionContract[]>([]);
  // PR-127: 제조사는 <select>(공급업체 전량 로드)가 아니라 서버 검색 선택이다.
  const [manufacturer, setManufacturer] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  // PR-115: 계약일 기간 필터. 보고서 부제에는 입력창 값이 아니라 마지막으로 조회한 조건을 쓴다.
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const load = useCallback(async (filter: { from?: string; to?: string } = {}) => {
    setLoading(true);
    try {
      setApplied(filter);
      const contractsRes = await getProductionContracts(filter);
      setContracts(Array.isArray(contractsRes) ? contractsRes : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '생산계약 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reload = () => load(applied);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filterFrom && filterTo && filterFrom > filterTo) {
      toast.error('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    load({ from: filterFrom || undefined, to: filterTo || undefined });
  };

  const handleFilterReset = () => {
    setFilterFrom('');
    setFilterTo('');
    load();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.styleNo || !manufacturer || !form.quantity || !form.contractDate) {
      toast.error('스타일번호/제조사/수량/계약일자는 필수입니다.');
      return;
    }
    if (form.priceSource === 'PRE_AGREED' && !form.cmtPrice) {
      toast.error('사전확정(PRE_AGREED)은 단가를 입력해야 합니다.');
      return;
    }

    setSubmitting(true);
    try {
      await createProductionContract({
        styleNo: form.styleNo,
        manufacturerId: manufacturer.id,
        priceSource: form.priceSource,
        ...(form.priceSource === 'PRE_AGREED' ? { cmtPrice: Number(form.cmtPrice) } : {}),
        quantity: Number(form.quantity),
        contractDate: form.contractDate,
        ...(form.note ? { note: form.note } : {}),
      });
      toast.success('생산계약이 등록되었습니다.');
      setForm(emptyForm);
      setManufacturer(null);
      await reload();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '생산계약 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 생산계약을 삭제하시겠습니까?')) return;
    try {
      await deleteProductionContract(id);
      toast.success('삭제되었습니다.');
      await reload();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  const summary = summarizeContracts(contracts);

  return (
    <div>
      <div className="bg-white border rounded-lg p-4 mb-6">
        <h3 className="text-md font-semibold text-gray-800 mb-3">생산계약 등록 (태일비나)</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">스타일번호</label>
            <input
              type="text"
              value={form.styleNo}
              onChange={(e) => setForm({ ...form, styleNo: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">제조사</label>
            <SearchSelectField<Supplier>
              value={manufacturer}
              onChange={setManufacturer}
              search={searchSuppliers}
              getKey={(s) => s.id}
              getLabel={(s) => s.name}
              renderRow={(s) => (<span>{s.name} <span className="text-gray-400 text-xs">{s.code}</span></span>)}
              ariaLabel="제조사"
              placeholder="제조사 검색"
              title="제조사(공급업체) 검색"
              className="w-full"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">단가원천</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="priceSource"
                  checked={form.priceSource === 'PRE_AGREED'}
                  onChange={() => setForm({ ...form, priceSource: 'PRE_AGREED' })}
                />
                사전확정 (고객사 계약 단가 그대로)
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="priceSource"
                  checked={form.priceSource === 'CMT_INVOICE'}
                  onChange={() => setForm({ ...form, priceSource: 'CMT_INVOICE', cmtPrice: '' })}
                />
                CMT 인보이스 연동(추후 확정)
              </label>
            </div>
          </div>
          {form.priceSource === 'PRE_AGREED' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">단가</label>
              <input
                type="number"
                step="0.01"
                value={form.cmtPrice}
                onChange={(e) => setForm({ ...form, cmtPrice: e.target.value })}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">수량</label>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">계약일자</label>
            <input
              type="date"
              value={form.contractDate}
              onChange={(e) => setForm({ ...form, contractDate: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">메모</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">계약일 From</label>
          <input type="date" aria-label="계약일 From" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">계약일 To</label>
          <input type="date" aria-label="계약일 To" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleFilterReset} className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">초기화</button>
      </form>

      {loading ? (
        <div className="p-4 text-gray-500">불러오는 중...</div>
      ) : (
        <PrintableReport
          title="생산계약 현황 보고서"
          subtitle={describeContractFilters(applied)}
          columns={productionContractColumns}
          rows={contracts}
          fileName="생산계약_현황"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              ['전체', `${summary.total}건`, `수량 ${fmtNum(summary.confirmedQty + summary.pendingQty)}`, 'text-gray-900'],
              ['단가 확정', `${summary.confirmed}건`, `수량 ${fmtNum(summary.confirmedQty)}`, 'text-green-600'],
              ['단가 미확정', `${summary.pending}건`, 'IV CMT 시트 확정 대기', 'text-yellow-600'],
              ['미확정 총 수량', fmtNum(summary.pendingQty), '추후 정산 대상 물량', 'text-red-600'],
            ].map(([label, value, sub, color]) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>
          {contracts.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 생산계약이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-2">스타일번호</th>
                    <th className="p-2">제조사</th>
                    <th className="p-2">계약일</th>
                    <th className="p-2 text-right">수량</th>
                    <th className="p-2">단가</th>
                    <th className="p-2">단가 상태</th>
                    <th className="p-2 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">{c.styleNo}</td>
                      <td className="p-2">{c.manufacturer?.name ?? `#${c.manufacturerId}`}</td>
                      <td className="p-2">{String(c.contractDate).slice(0, 10)}</td>
                      <td className="p-2 text-right">{fmtNum(Number(c.quantity))}</td>
                      <td className="p-2">
                        {c.priceStatus === 'PENDING_CMT_INVOICE' ? <span className="text-yellow-700">{priceTextOf(c)}</span> : priceTextOf(c)}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${c.priceStatus === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {PRICE_STATUS_LABELS[c.priceStatus] ?? c.priceStatus}
                        </span>
                      </td>
                      <td className="p-2 print:hidden">
                        <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline text-xs">삭제</button>
                      </td>
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
