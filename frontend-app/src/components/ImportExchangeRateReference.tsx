import React, { useEffect, useState } from 'react';
import { lookupCustomsExchangeRate, type ExchangeRateLookupResult } from '../api/customsExchangeRates.service';
import { formatRateRange } from '../utils/customsExchangeRates';

// PR-184: 수입통관 화면 참고 표시 — 계산·저장은 하지 않는다. 신고일 필드가 ImportShipment에
// 없어 invoiceDate(없으면 etd)를 임시 기준으로 쓴다(완료 보고에 명시).
export const ImportExchangeRateReference: React.FC<{ date?: string | null }> = ({ date }) => {
  const [lookup, setLookup] = useState<ExchangeRateLookupResult | null>(null);

  useEffect(() => {
    if (!date) {
      setLookup(null);
      return;
    }
    let alive = true;
    lookupCustomsExchangeRate({ rateType: 'IMPORT', currency: 'USD', date: date.slice(0, 10) })
      .then((res) => {
        if (alive) setLookup(res);
      })
      .catch(() => {
        if (alive) setLookup(null);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  if (!date) return null;
  if (!lookup) return null;

  return lookup.found ? (
    <div className="text-xs text-gray-500">
      참고: 해당 주 수입 환율 {formatRateRange({ rate: lookup.rate!, validFrom: lookup.validFrom!, validTo: lookup.validTo! })}
    </div>
  ) : (
    <div className="text-xs text-yellow-700">
      수입 환율 미등록 — 주간 환율 화면에서 등록하세요.
    </div>
  );
};
