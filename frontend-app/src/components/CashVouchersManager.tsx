import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getCashVouchers,
  getCashVoucherSummary,
  createCashVoucher,
  deleteCashVoucher,
  type CashVoucher,
  type CashVoucherSummary,
  type CashVoucherType,
} from '../api/cashVouchers.service';
import { getBuyers, type Buyer } from '../api/buyers.service';
import { getSuppliers, type Supplier } from '../api/suppliers.service';
import { type PurchaseOrder } from '../api/purchaseOrders.service';
import { type ProductionContract } from '../api/productionContracts.service';
import { getErrorMessage } from '../utils/errorMessage';
import { CashVoucherStatementView } from './CashVoucherStatementView';
import { SearchSelectField } from './SearchSelectField';
import {
  masterLabel,
  productionContractLabel,
  purchaseOrderLabel,
  searchBuyers,
  searchProductionContracts,
  searchPurchaseOrders,
  searchSuppliers,
} from '../utils/searchFetchers';
import { voucherLinkIds } from '../utils/cashVoucherLinks';

const VOUCHER_TYPE_LABELS: Record<CashVoucherType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
};

const emptyForm = {
  voucherType: 'DEPOSIT' as CashVoucherType,
  voucherDate: '',
  amount: '',
  counterpartyName: '',
  account: '',
  category: '',
  note: '',
};

interface VoucherLinks {
  buyer: Buyer | null;
  supplier: Supplier | null;
  purchaseOrder: PurchaseOrder | null;
  productionContract: ProductionContract | null;
}

const emptyLinks: VoucherLinks = { buyer: null, supplier: null, purchaseOrder: null, productionContract: null };

const formatAmount = (v: number) => Number(v).toLocaleString('ko-KR');

export const CashVouchersManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<CashVoucher[]>([]);
  const [summary, setSummary] = useState<CashVoucherSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<CashVoucherType | ''>('');
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  // PR-127: 연결할 거래처/발주/생산계약은 <select>에 전량을 불러오지 않고(발주·생산계약은 무제한 반환이었다) 검색 선택으로 고른다.
  const [links, setLinks] = useState<VoucherLinks>(emptyLinks);
  // 전표 목록의 "연결" 열에서 연결된 고객사/공급업체 이름을 보여주기 위한 조회용 목록(선택 UI가 아니다 — 거래처 마스터는 소규모).
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showStatement, setShowStatement] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [buyersRes, suppliersRes] = await Promise.all([getBuyers(), getSuppliers()]);
      setBuyers(Array.isArray(buyersRes) ? buyersRes : []);
      setSuppliers(Array.isArray(suppliersRes) ? suppliersRes : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '거래처 목록을 불러오는 데 실패했습니다.'));
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(typeFilter ? { voucherType: typeFilter } : {}),
      };
      const [vouchersRes, summaryRes] = await Promise.all([
        getCashVouchers(filter),
        getCashVoucherSummary(from || undefined, to || undefined),
      ]);
      setVouchers(Array.isArray(vouchersRes) ? vouchersRes : []);
      setSummary(summaryRes ?? null);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '입출금전표 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.voucherDate || !form.amount || !form.counterpartyName || !form.account || !form.category) {
      toast.error('구분/일자/금액/거래처/계좌/분류는 필수입니다.');
      return;
    }
    setSubmitting(true);
    try {
      await createCashVoucher({
        voucherType: form.voucherType,
        voucherDate: form.voucherDate,
        amount: Number(form.amount),
        counterpartyName: form.counterpartyName,
        account: form.account,
        category: form.category,
        ...voucherLinkIds(links),
        ...(form.note ? { note: form.note } : {}),
      });
      toast.success('입출금전표가 등록되었습니다.');
      setForm(emptyForm);
      setLinks(emptyLinks);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 전표를 삭제하시겠습니까?')) return;
    try {
      await deleteCashVoucher(id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowStatement(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700"
        >
          거래내역서 발급
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">입금합계</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{summary ? formatAmount(summary.depositTotal) : '-'}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">출금합계</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">{summary ? formatAmount(summary.withdrawalTotal) : '-'}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">잔액</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{summary ? formatAmount(summary.balance) : '-'}</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-md font-semibold text-gray-800 mb-3">입출금전표 등록</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">구분</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="voucherType"
                  checked={form.voucherType === 'DEPOSIT'}
                  onChange={() => setForm({ ...form, voucherType: 'DEPOSIT' })}
                />
                입금
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="voucherType"
                  checked={form.voucherType === 'WITHDRAWAL'}
                  onChange={() => setForm({ ...form, voucherType: 'WITHDRAWAL' })}
                />
                출금
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">일자</label>
            <input
              type="date"
              value={form.voucherDate}
              onChange={(e) => setForm({ ...form, voucherDate: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">거래처</label>
            <input
              type="text"
              value={form.counterpartyName}
              onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">금액</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">계좌</label>
            <input
              type="text"
              placeholder="예: 국민은행 태일무역, 현금"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">분류</label>
            <input
              type="text"
              placeholder="예: 원자재대금, 임가공비, 운송비"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">거래처(고객사) 연결</label>
            <SearchSelectField<Buyer>
              value={links.buyer}
              onChange={(picked) => setLinks({ ...links, buyer: picked })}
              search={searchBuyers}
              getKey={(b) => b.id}
              getLabel={masterLabel}
              renderRow={(b) => (<span>{b.name} <span className="text-gray-400 text-xs">{b.code}</span></span>)}
              ariaLabel="거래처(고객사) 연결"
              placeholder="연결 안 함"
              title="거래처(고객사) 검색"
              allowClear
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">거래처(공급업체) 연결</label>
            <SearchSelectField<Supplier>
              value={links.supplier}
              onChange={(picked) => setLinks({ ...links, supplier: picked })}
              search={searchSuppliers}
              getKey={(s) => s.id}
              getLabel={masterLabel}
              renderRow={(s) => (<span>{s.name} <span className="text-gray-400 text-xs">{s.code}</span></span>)}
              ariaLabel="거래처(공급업체) 연결"
              placeholder="연결 안 함"
              title="거래처(공급업체) 검색"
              allowClear
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">관련 발주 연결</label>
            <SearchSelectField<PurchaseOrder>
              value={links.purchaseOrder}
              onChange={(picked) => setLinks({ ...links, purchaseOrder: picked })}
              search={searchPurchaseOrders}
              getKey={(po) => po.id}
              getLabel={purchaseOrderLabel}
              renderRow={(po) => (
                <span>
                  {purchaseOrderLabel(po)}
                  <span className="text-gray-400 text-xs"> · {po.supplier?.name ?? '-'} · {po.status}</span>
                </span>
              )}
              ariaLabel="관련 발주 연결"
              placeholder="연결 안 함"
              title="관련 발주 검색 (품목명/코드/공급업체)"
              allowClear
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">관련 생산계약 연결</label>
            <SearchSelectField<ProductionContract>
              value={links.productionContract}
              onChange={(picked) => setLinks({ ...links, productionContract: picked })}
              search={searchProductionContracts}
              getKey={(pc) => pc.id}
              getLabel={productionContractLabel}
              ariaLabel="관련 생산계약 연결"
              placeholder="연결 안 함"
              title="관련 생산계약 검색 (스타일번호/제조사)"
              allowClear
              className="w-full"
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

      <div>
        <div className="flex justify-between items-end mb-3 flex-wrap gap-3">
          <h3 className="text-lg font-semibold text-gray-800">입출금전표 목록 ({vouchers.length}건)</h3>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">기간</label>
              <div className="flex items-center gap-1">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <span className="text-gray-400">~</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">구분</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as CashVoucherType | '')}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">전체</option>
                <option value="DEPOSIT">입금</option>
                <option value="WITHDRAWAL">출금</option>
              </select>
            </div>
            <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-gray-500">불러오는 중...</div>
        ) : vouchers.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 입출금전표가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2">일자</th>
                  <th className="p-2">구분</th>
                  <th className="p-2">거래처</th>
                  <th className="p-2">연결</th>
                  <th className="p-2">계좌</th>
                  <th className="p-2">분류</th>
                  <th className="p-2">금액</th>
                  <th className="p-2">메모</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const linked = [
                    v.counterpartyBuyerId ? `고객사: ${buyers.find((b) => b.id === v.counterpartyBuyerId)?.name ?? `#${v.counterpartyBuyerId}`}` : null,
                    v.counterpartySupplierId ? `공급업체: ${suppliers.find((s) => s.id === v.counterpartySupplierId)?.name ?? `#${v.counterpartySupplierId}`}` : null,
                    v.relatedPurchaseOrderId ? `발주 #${v.relatedPurchaseOrderId}` : null,
                    v.relatedProductionContractId ? `생산계약 #${v.relatedProductionContractId}` : null,
                  ].filter(Boolean);
                  return (
                  <tr key={v.id} className="border-t hover:bg-gray-50">
                    <td className="p-2">{v.voucherDate}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${v.voucherType === 'DEPOSIT' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                        {VOUCHER_TYPE_LABELS[v.voucherType]}
                      </span>
                    </td>
                    <td className="p-2">{v.counterpartyName}</td>
                    <td className="p-2 text-xs text-gray-500">{linked.length > 0 ? linked.join(', ') : '-'}</td>
                    <td className="p-2">{v.account}</td>
                    <td className="p-2">{v.category}</td>
                    <td className="p-2">{formatAmount(v.amount)}</td>
                    <td className="p-2 text-gray-500">{v.note ?? '-'}</td>
                    <td className="p-2">
                      <button onClick={() => handleDelete(v.id)} className="text-red-600 hover:underline text-xs">삭제</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showStatement && (
        <CashVoucherStatementView onClose={() => setShowStatement(false)} />
      )}
    </div>
  );
};
