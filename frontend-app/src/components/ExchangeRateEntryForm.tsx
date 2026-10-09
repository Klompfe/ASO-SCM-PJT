import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { createCustomsExchangeRate, type ExchangeRateType, type ExchangeRateLookupResult } from '../api/customsExchangeRates.service';
import { suggestValidTo, suggestValidFrom, formatPreviousHint } from '../utils/customsExchangeRates';
import { getErrorMessage } from '../utils/errorMessage';

// PR-184: 주간 환율 한 건 입력 폼 — "주간 환율" 관리 화면(CustomsExchangeRatesManager)과
// 로그인 직후 팝업(WeeklyExchangeRatePopup)이 이 하나의 컴포넌트/검증을 함께 쓴다(중복 구현 금지).
export const ExchangeRateEntryForm: React.FC<{
  rateType: ExchangeRateType;
  today: string;
  previousLookup?: ExchangeRateLookupResult | null;
  onSaved: () => void;
}> = ({ rateType, today, previousLookup, onSaved }) => {
  const [validFrom, setValidFrom] = useState(() => suggestValidFrom(previousLookup?.previous ?? null, today));
  const [validTo, setValidTo] = useState(() => suggestValidTo(suggestValidFrom(previousLookup?.previous ?? null, today)));
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleValidFromChange = (value: string) => {
    setValidFrom(value);
    setValidTo(suggestValidTo(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!rate || Number(rate) <= 0) {
      setError('환율은 양수로 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await createCustomsExchangeRate({ rateType, currency: 'USD', validFrom, validTo, rate: Number(rate), note: note || undefined });
      toast.success(`${rateType === 'EXPORT' ? '수출' : '수입'} 환율이 등록되었습니다.`);
      onSaved();
    } catch (err: any) {
      setError(getErrorMessage(err, '환율 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const previousHint = formatPreviousHint(previousLookup ?? null);

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end" aria-label={`${rateType === 'EXPORT' ? '수출' : '수입'} 환율 입력`}>
      {error && <div className="w-full text-sm text-red-700 bg-red-100 rounded p-2">{error}</div>}
      <div className="flex flex-col">
        <label className="text-xs text-gray-600 mb-1">적용 시작일</label>
        <input type="date" className="border rounded px-2 py-1" value={validFrom} onChange={(e) => handleValidFromChange(e.target.value)} />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-gray-600 mb-1">적용 종료일</label>
        <input type="date" className="border rounded px-2 py-1" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-gray-600 mb-1">환율(USD/KRW)</label>
        <input type="number" step="0.0001" className="border rounded px-2 py-1 w-28" aria-label={`${rateType === 'EXPORT' ? '수출' : '수입'} 환율 입력칸`} value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <div className="flex flex-col flex-1 min-w-[10rem]">
        <label className="text-xs text-gray-600 mb-1">메모(선택)</label>
        <input className="border rounded px-2 py-1" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {previousHint && <span className="text-xs text-gray-400">{previousHint}</span>}
      <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
        {submitting ? '저장 중...' : '저장'}
      </button>
    </form>
  );
};
