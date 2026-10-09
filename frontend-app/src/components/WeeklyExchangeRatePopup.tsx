import React from 'react';
import { ExchangeRateEntryForm } from './ExchangeRateEntryForm';
import { formatRateRange, markPopupDismissedThisSession } from '../utils/customsExchangeRates';
import type { ExchangeRateStatus } from '../api/customsExchangeRates.service';

const todayStr = () => new Date().toISOString().slice(0, 10);

// PR-184: 로그인 직후(또는 토큰 복원 시) 이번 주 관세청 환율이 비어 있으면 뜨는 팝업.
// 업무를 막지 않는 일반 모달이며, 입력 폼은 "주간 환율" 화면과 같은 컴포넌트를 재사용한다.
export const WeeklyExchangeRatePopup: React.FC<{
  status: ExchangeRateStatus;
  onClose: () => void;
  onSaved: () => void;
}> = ({ status, onClose, onSaved }) => {
  const handleDismiss = () => {
    markPopupDismissedThisSession();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-full max-w-2xl">
        <h3 className="text-xl font-bold mb-2">이번 주 관세청 환율이 등록되지 않았습니다</h3>
        <p className="text-sm text-gray-500 mb-4">
          관세청 UNI-PASS 주간환율 화면을 보고 수출/수입 환율을 입력하세요. 시스템이 자동으로 가져오지 않습니다.
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">수출 환율</div>
            {status.EXPORT.found ? (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                등록됨: {formatRateRange({ rate: status.EXPORT.rate!, validFrom: status.EXPORT.validFrom!, validTo: status.EXPORT.validTo! })}
              </div>
            ) : (
              <ExchangeRateEntryForm rateType="EXPORT" today={todayStr()} previousLookup={status.EXPORT} onSaved={onSaved} />
            )}
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">수입 환율</div>
            {status.IMPORT.found ? (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                등록됨: {formatRateRange({ rate: status.IMPORT.rate!, validFrom: status.IMPORT.validFrom!, validTo: status.IMPORT.validTo! })}
              </div>
            ) : (
              <ExchangeRateEntryForm rateType="IMPORT" today={todayStr()} previousLookup={status.IMPORT} onSaved={onSaved} />
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={handleDismiss} className="bg-gray-500 text-white px-4 py-2 rounded">나중에</button>
        </div>
      </div>
    </div>
  );
};

// USER(쓰기 권한 없음)에게 보여줄 닫을 수 있는 상단 안내.
export const WeeklyExchangeRateBanner: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm px-4 py-2 flex items-center justify-between">
    <span>이번 주 관세청 환율이 아직 등록되지 않았습니다 — 관리자에게 등록을 요청하세요.</span>
    <button type="button" onClick={onClose} className="text-yellow-700 font-medium ml-4">닫기</button>
  </div>
);
