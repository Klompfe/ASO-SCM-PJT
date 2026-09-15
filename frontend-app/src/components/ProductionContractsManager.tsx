import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getProductionContracts,
  createProductionContract,
  deleteProductionContract,
  type ProductionContract,
  type ProductionContractPriceSource,
} from '../api/productionContracts.service';
import { getSuppliers, type Supplier } from '../api/suppliers.service';
import { getErrorMessage } from '../utils/errorMessage';

const PRICE_SOURCE_LABELS: Record<ProductionContractPriceSource, string> = {
  PRE_AGREED: '사전확정',
  CMT_INVOICE: 'CMT연동대기',
};

const PRICE_SOURCE_BADGE_STYLES: Record<ProductionContractPriceSource, string> = {
  PRE_AGREED: 'bg-blue-100 text-blue-800',
  CMT_INVOICE: 'bg-yellow-100 text-yellow-800',
};

const emptyForm = {
  styleNo: '',
  manufacturerId: '',
  priceSource: 'PRE_AGREED' as ProductionContractPriceSource,
  cmtPrice: '',
  quantity: '',
  contractDate: '',
  note: '',
};

export const ProductionContractsManager: React.FC = () => {
  const [contracts, setContracts] = useState<ProductionContract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, suppliersRes] = await Promise.all([getProductionContracts(), getSuppliers()]);
      setContracts(Array.isArray(contractsRes) ? contractsRes : []);
      setSuppliers(Array.isArray(suppliersRes) ? suppliersRes : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '생산계약 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.styleNo || !form.manufacturerId || !form.quantity || !form.contractDate) {
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
        manufacturerId: Number(form.manufacturerId),
        priceSource: form.priceSource,
        ...(form.priceSource === 'PRE_AGREED' ? { cmtPrice: Number(form.cmtPrice) } : {}),
        quantity: Number(form.quantity),
        contractDate: form.contractDate,
        ...(form.note ? { note: form.note } : {}),
      });
      toast.success('생산계약이 등록되었습니다.');
      setForm(emptyForm);
      await load();
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
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

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
            <select
              value={form.manufacturerId}
              onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })}
              className="border rounded px-2 py-1 w-full text-sm"
            >
              <option value="">선택</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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

      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">생산계약 목록 ({contracts.length}건)</h3>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
      </div>
      {loading ? (
        <div className="p-4 text-gray-500">불러오는 중...</div>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 생산계약이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">Style No</th>
                <th className="p-2">제조사</th>
                <th className="p-2">단가원천</th>
                <th className="p-2">단가</th>
                <th className="p-2">수량</th>
                <th className="p-2">계약일자</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{c.styleNo}</td>
                  <td className="p-2">{c.manufacturer?.name ?? `#${c.manufacturerId}`}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${PRICE_SOURCE_BADGE_STYLES[c.priceSource]}`}>
                      {PRICE_SOURCE_LABELS[c.priceSource]}
                    </span>
                  </td>
                  <td className="p-2">
                    {c.priceStatus === 'PENDING_CMT_INVOICE' ? (
                      <span className="text-yellow-700">CMT 인보이스 대기중</span>
                    ) : (
                      c.cmtPrice
                    )}
                  </td>
                  <td className="p-2">{c.quantity}</td>
                  <td className="p-2">{c.contractDate}</td>
                  <td className="p-2">
                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline text-xs">삭제</button>
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
