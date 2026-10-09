import React, { useEffect, useState } from 'react';
import { getPriceReference, type PriceReferenceCandidate, type PriceReferenceResult } from '../api/purchaseOrders.service';

export interface PriceReferenceValue {
  usd: number | null;
  source: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL' | null;
  note: string | null;
}

// PR-185 C: 발주 폼 "단가표 참고(USD)" 블록 — 브랜드 전용가 → 미도 단가표 순 후보를 보여주고,
// suggested가 있으면 미리 채우되 "확인 필요" 배지를 단다. 자동으로 저장하지 않는다(안전모드) —
// 사람이 후보를 고르거나 직접 입력(MANUAL)해야 실제 값이 확정된다. KRW unitPrice와는 완전히 별개.
export const PriceReferenceBlock: React.FC<{
  itemId: number | null;
  styleNo?: string | null;
  brandName?: string | null;
  lineUnit?: string | null;
  materialSubType?: string | null;
  value: PriceReferenceValue;
  onChange: (value: PriceReferenceValue) => void;
}> = ({ itemId, styleNo, brandName, lineUnit, materialSubType, value, onChange }) => {
  const [result, setResult] = useState<PriceReferenceResult | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setResult(null);
    setTouched(false);
    if (!itemId) return;
    let cancelled = false;
    getPriceReference({
      itemId,
      styleNo: styleNo ?? undefined,
      brandName: brandName ?? undefined,
      lineUnit: lineUnit ?? undefined,
      materialSubType: materialSubType ?? undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        if (res.suggested) {
          onChange({ usd: res.suggested.priceUsd, source: res.suggested.source, note: res.suggested.note ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, styleNo, brandName, lineUnit, materialSubType]);

  if (!itemId) return null;

  const useCandidate = (c: PriceReferenceCandidate) => {
    setTouched(true);
    onChange({ usd: c.priceUsd, source: c.source, note: c.note ?? c.label });
  };

  const krwText = result?.krw
    ? `≈ ₩${result.krw.approxUnitPriceKrw.toLocaleString('ko-KR')} (관세청 수출환율 ${result.krw.rate.toLocaleString('ko-KR')}, ${result.krw.validFrom}~${result.krw.validTo} 적용, 참고)`
    : '환율 미등록 — 주간 환율에서 등록하세요';

  return (
    <div className="border border-gray-200 rounded p-2 bg-white space-y-2" data-testid="price-reference-block">
      <div className="text-sm font-medium text-gray-700">단가표 참고(USD)</div>
      {result?.suggested && !touched && (
        <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">단가표 제안 — 확인 필요 ({result.suggested.label})</p>
      )}
      {result && result.candidates.length > 1 && (
        <ul className="text-xs space-y-1">
          {result.candidates.map((c, i) => (
            <li key={i} className="flex items-center justify-between border rounded px-2 py-1">
              <span>
                {c.label} — ${c.priceUsd}{c.priceUsdMax != null ? `~$${c.priceUsdMax}` : ''}/{c.unit}
                {c.source === 'BRAND_RULE' && <span className="ml-1 text-indigo-600">(브랜드 전용가)</span>}
              </span>
              <button type="button" className="text-blue-600 border border-blue-300 rounded px-2 py-0.5 ml-2 shrink-0 hover:bg-blue-50" onClick={() => useCandidate(c)}>이 값 사용</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          min={0}
          className="border rounded px-2 py-1 w-28"
          aria-label="단가표 참고단가(USD)"
          placeholder="USD"
          value={value.usd ?? ''}
          onChange={(e) => {
            setTouched(true);
            const usd = e.target.value === '' ? null : Number(e.target.value);
            onChange({ usd, source: usd == null ? null : 'MANUAL', note: null });
          }}
        />
        <span className="text-xs text-gray-400">{value.source === 'MANUAL' ? '수동 입력' : value.source ? `출처: ${value.source}` : ''}</span>
      </div>
      {result?.unitMismatchWarning && <p className="text-xs text-red-600">{result.unitMismatchWarning}</p>}
      {value.usd != null && <p className="text-xs text-gray-400">{krwText}</p>}
    </div>
  );
};
