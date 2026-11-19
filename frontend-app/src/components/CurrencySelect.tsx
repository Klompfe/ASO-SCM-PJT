import React, { useState } from 'react';
import { CURRENCIES, CURRENCY_CHANGE_NOTICE, normalizeCurrency, type Currency } from '../utils/currency';

// PR-244b: 단가 옆 통화 선택(KRW/USD). 값이 NULL/빈 값이면 KRW 로 보인다. 통화를 바꿔도 단가 숫자는
// 부모가 그대로 둔다(자동 환산 없음) — 바꾸면 입력칸 아래에 알림을 보여 줄 뿐 막지 않는다.
export const CurrencySelect: React.FC<{
  value: string | null | undefined;
  onChange: (c: Currency) => void;
  ariaLabel: string;
  className?: string;
  // 알림을 칸 안에서 보이지 않게 하고 싶을 때(표 셀 등) 부모가 직접 CurrencyChangeNotice 를 둔다.
  hideNotice?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, ariaLabel, className, hideNotice, disabled }) => {
  const [changed, setChanged] = useState(false);
  return (
    <>
      <select
        aria-label={ariaLabel}
        className={className ?? 'border border-gray-300 rounded px-2 py-1 text-sm'}
        value={normalizeCurrency(value)}
        disabled={disabled}
        onChange={(e) => { setChanged(true); onChange(e.target.value as Currency); }}
      >
        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {changed && !hideNotice && <CurrencyChangeNotice />}
    </>
  );
};

export const CurrencyChangeNotice: React.FC = () => (
  <p className="text-xs text-amber-700 mt-1 max-w-[260px]" data-testid="currency-change-notice">{CURRENCY_CHANGE_NOTICE}</p>
);
