import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getCustomsExchangeRates,
  deleteCustomsExchangeRate,
  lookupCustomsExchangeRate,
  type CustomsExchangeRate,
  type ExchangeRateType,
  type ExchangeRateLookupResult,
} from '../api/customsExchangeRates.service';
import { ExchangeRateEntryForm } from './ExchangeRateEntryForm';
import { formatRateRange } from '../utils/customsExchangeRates';
import { getErrorMessage } from '../utils/errorMessage';

const todayStr = () => new Date().toISOString().slice(0, 10);

// PR-184: 관세청 주간환율(수출/수입) 입력 화면. 유니패스를 자동으로 가져오지 않으므로
// 담당자가 매주 직접 입력한다 — 자동 확정/크롤링은 하지 않는다.
export const CustomsExchangeRatesManager: React.FC = () => {
  const [tab, setTab] = useState<ExchangeRateType>('EXPORT');
  const [rates, setRates] = useState<CustomsExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [previousLookup, setPreviousLookup] = useState<ExchangeRateLookupResult | null>(null);

  const load = useCallback(async (rateType: ExchangeRateType) => {
    setLoading(true);
    try {
      const res = await getCustomsExchangeRates({ rateType, currency: 'USD' });
      setRates(Array.isArray(res) ? res : (res?.items ?? []));
      const prev = await lookupCustomsExchangeRate({ rateType, currency: 'USD', date: todayStr() }).catch(() => null);
      setPreviousLookup(prev);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '주간 환율 목록을 불러오는 데 실패했습니다.'));
      setRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [load, tab]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 환율 행을 삭제하시겠습니까?')) return;
    try {
      await deleteCustomsExchangeRate(id);
      toast.success('삭제되었습니다.');
      await load(tab);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">주간 환율</h2>
      <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
        관세청 UNI-PASS의 주간환율 화면(관세환율)을 보고 수출/수입 환율을 각각 입력하세요. 시스템이 자동으로 가져오지 않습니다.
      </p>

      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'EXPORT' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          onClick={() => setTab('EXPORT')}
        >
          수출
        </button>
        <button
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'IMPORT' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          onClick={() => setTab('IMPORT')}
        >
          수입
        </button>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <ExchangeRateEntryForm rateType={tab} today={todayStr()} previousLookup={previousLookup} onSaved={() => load(tab)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">적용 시작일</th>
              <th className="px-4 py-2 text-left">적용 종료일</th>
              <th className="px-4 py-2 text-left">환율</th>
              <th className="px-4 py-2 text-left">메모</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && rates.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400">불러오는 중...</td></tr>
            )}
            {!loading && rates.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400">등록된 {tab === 'EXPORT' ? '수출' : '수입'} 환율이 없습니다.</td></tr>
            )}
            {rates.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{r.validFrom}</td>
                <td className="px-4 py-2">{r.validTo}</td>
                <td className="px-4 py-2">{formatRateRange(r).split(' (')[0]}</td>
                <td className="px-4 py-2 text-gray-500">{r.note ?? '-'}</td>
                <td className="px-4 py-2">
                  <button className="text-red-600" onClick={() => handleDelete(r.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
