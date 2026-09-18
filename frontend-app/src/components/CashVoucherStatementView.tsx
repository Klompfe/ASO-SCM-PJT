import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { getCashVouchers, getCashVoucherSummary, type CashVoucher, type CashVoucherSummary } from '../api/cashVouchers.service';
import { type Buyer } from '../api/buyers.service';
import { type Supplier } from '../api/suppliers.service';
import { getErrorMessage } from '../utils/errorMessage';

const COMPANY_INFO = {
  name: '태일무역',
  addressLine: '대한민국',
};

const formatAmount = (v: number) => Number(v).toLocaleString('ko-KR');

interface CashVoucherStatementViewProps {
  buyers: Buyer[];
  suppliers: Supplier[];
  onClose: () => void;
}

// PR-108: 거래내역서 발급 — 고객사/공급업체 중 하나를 골라 기간을 지정하면 그
// 거래처의 CashVoucher만 필터링해 인쇄 전용으로 보여준다. 화면에 이미 로드되어
// 있는 buyers/suppliers 목록을 그대로 props로 받아 재사용하고, 조회는 이 화면에서
// 새로 눌렀을 때만 실행한다(진입 즉시 자동 조회하지 않음 — 거래처 미선택 상태로
// 전체 조회가 나가는 것을 막기 위함).
export const CashVoucherStatementView: React.FC<CashVoucherStatementViewProps> = ({ buyers, suppliers, onClose }) => {
  const [partyType, setPartyType] = useState<'buyer' | 'supplier'>('buyer');
  const [partyId, setPartyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ vouchers: CashVoucher[]; summary: CashVoucherSummary } | null>(null);

  const selectedParty =
    partyType === 'buyer'
      ? buyers.find((b) => String(b.id) === partyId)
      : suppliers.find((s) => String(s.id) === partyId);

  const handleSearch = async () => {
    if (!partyId) {
      toast.error('거래처를 선택해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const filter = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(partyType === 'buyer' ? { buyerId: Number(partyId) } : { supplierId: Number(partyId) }),
      };
      const [vouchersRes, summaryRes] = await Promise.all([
        getCashVouchers(filter),
        getCashVoucherSummary(
          from || undefined,
          to || undefined,
          partyType === 'buyer' ? Number(partyId) : undefined,
          partyType === 'supplier' ? Number(partyId) : undefined,
        ),
      ]);
      setResult({ vouchers: Array.isArray(vouchersRes) ? vouchersRes : [], summary: summaryRes });
    } catch (err: any) {
      toast.error(getErrorMessage(err, '거래내역서 조회에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:static print:bg-white print:block">
      <div className="bg-white w-[900px] max-w-full max-h-[90vh] overflow-y-auto rounded-lg print:rounded-none print:max-h-none print:w-full print:overflow-visible">
        <div className="flex justify-between items-end gap-2 p-3 border-b border-gray-200 print:hidden flex-wrap">
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">거래처 구분</label>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={partyType}
                onChange={(e) => {
                  setPartyType(e.target.value as 'buyer' | 'supplier');
                  setPartyId('');
                }}
              >
                <option value="buyer">고객사</option>
                <option value="supplier">공급업체</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">거래처</label>
              <select className="border rounded px-2 py-1 text-sm w-48" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">선택하세요</option>
                {(partyType === 'buyer' ? buyers : suppliers).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">기간</label>
              <div className="flex items-center gap-1">
                <input type="date" className="border rounded px-2 py-1 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-gray-400">~</span>
                <input type="date" className="border rounded px-2 py-1 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '조회 중...' : '조회'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              disabled={!result}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              인쇄
            </button>
            <button onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-300">
              닫기
            </button>
          </div>
        </div>

        {result ? (
          <div className="print-target p-10 space-y-6">
            <h1 className="text-2xl font-bold text-center">거래내역서</h1>

            <div className="flex justify-between text-sm">
              <div>
                <p className="font-semibold">{COMPANY_INFO.name}</p>
                <p className="text-gray-500">{COMPANY_INFO.addressLine}</p>
              </div>
              <div className="text-right">
                <p>거래처: <span className="font-medium">{selectedParty?.name ?? '-'}</span></p>
                <p>기간: {from || '전체'} ~ {to || '전체'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-b border-gray-200 py-3 text-center">
              <div>
                <p className="text-xs text-gray-500">입금합계</p>
                <p className="text-lg font-bold text-blue-600">{formatAmount(result.summary.depositTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">출금합계</p>
                <p className="text-lg font-bold text-red-600">{formatAmount(result.summary.withdrawalTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">잔액</p>
                <p className="text-lg font-bold text-gray-900">{formatAmount(result.summary.balance)}</p>
              </div>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 px-2 py-1">일자</th>
                  <th className="border border-gray-300 px-2 py-1">구분</th>
                  <th className="border border-gray-300 px-2 py-1">계좌</th>
                  <th className="border border-gray-300 px-2 py-1">분류</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">금액</th>
                  <th className="border border-gray-300 px-2 py-1">메모</th>
                </tr>
              </thead>
              <tbody>
                {result.vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-gray-300 px-2 py-4 text-center text-gray-400">
                      해당 기간에 거래 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  result.vouchers.map((v) => (
                    <tr key={v.id}>
                      <td className="border border-gray-300 px-2 py-1">{v.voucherDate}</td>
                      <td className="border border-gray-300 px-2 py-1">{v.voucherType === 'DEPOSIT' ? '입금' : '출금'}</td>
                      <td className="border border-gray-300 px-2 py-1">{v.account}</td>
                      <td className="border border-gray-300 px-2 py-1">{v.category}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right">{formatAmount(v.amount)}</td>
                      <td className="border border-gray-300 px-2 py-1">{v.note ?? ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-gray-400 print:hidden">거래처와 기간을 선택한 뒤 조회해 주세요.</div>
        )}
      </div>
    </div>
  );
};
