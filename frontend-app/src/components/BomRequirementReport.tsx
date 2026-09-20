import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SearchSelectField } from './SearchSelectField';
import { searchMasterStyles, searchWorkOrders, type StyleOption } from '../utils/searchFetchers';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import { requirementColumns, parsePlanQuantity, type RequirementMode, type RequirementView } from '../utils/bomRequirementReport';
import { fetchStyleRequirementView, fetchWorkOrderRequirementView } from '../utils/bomRequirementFetch';

interface WoOption { id: number; targetQuantity: number; status: string; item?: { name: string; styleNo?: string } }

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
const td = 'border border-gray-300 px-2 py-1';

// 기존 <option> 문구 그대로: #ID · 스타일번호 · 품목명 · 물량
const workOrderLabel = (w: WoOption) =>
  `#${w.id} · ${w.item?.styleNo ?? '스타일번호 없음'} · ${w.item?.name ?? ''} · ${fmt(Number(w.targetQuantity))}`;

// PR-120: BOM 소요명세서 — BOM을 전개해 자재별 필요 총수량과, 이미 발주한 수량 대비 부족 수량을 보여준다(구매 계획용).
// PR-129: 구매 계획은 작업지시가 만들어지기 전에 "이 스타일을 이만큼 만들면 자재가 얼마나 부족한가"를 보는 용도라, 기본 경로는
// 작업지시가 아니라 "스타일(자재명세) 선택 + 계획수량"이다(GET /work-orders/style-requirements — 작업지시가 0건이어도 동작).
// 이미 만들어진 작업지시의 확정 물량 기준으로 다시 확인하고 싶을 때를 위해 "작업지시 기준"은 보조 경로로 남겼다.
export const BomRequirementReport: React.FC = () => {
  const [mode, setMode] = useState<RequirementMode>('STYLE');

  // 스타일 기준(기본)
  const [style, setStyle] = useState<StyleOption | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  // 서버에 실제로 보낸 계획수량(undefined = 비움 → 서버가 스타일 총 생산수량 사용). 입력 중에는 조회하지 않고 "계산"을 눌러야 반영된다.
  const [appliedQty, setAppliedQty] = useState<number | undefined>(undefined);
  const [refreshTick, setRefreshTick] = useState(0);

  // 작업지시 기준(보조) — PR-127: 서버 검색 선택
  const [workOrder, setWorkOrder] = useState<WoOption | null>(null);

  const [view, setView] = useState<RequirementView | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let load: (() => Promise<RequirementView>) | null = null;
    if (mode === 'STYLE' && style) load = () => fetchStyleRequirementView(style.styleNo, appliedQty);
    else if (mode === 'WORK_ORDER' && workOrder) load = () => fetchWorkOrderRequirementView(workOrder.id);
    if (!load) { setView(null); return; }
    let cancelled = false;
    setLoading(true);
    load()
      .then((res) => { if (!cancelled) setView(res); })
      .catch((err) => { if (!cancelled) { toast.error(getErrorMessage(err, '소요명세서를 불러오는 데 실패했습니다.')); setView(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, style, appliedQty, workOrder, refreshTick]);

  const applyQuantity = (): boolean => {
    const parsed = parsePlanQuantity(quantityInput);
    if (!parsed.ok) { toast.error(parsed.message); return false; }
    setAppliedQty(parsed.quantity);
    setRefreshTick((t) => t + 1);
    return true;
  };

  const pickStyle = (picked: StyleOption | null) => {
    setStyle(picked);
    // 이미 입력해 둔 계획수량은 다른 스타일을 골라도 그대로 적용한다(잘못된 입력이면 비운 것으로 본다).
    const parsed = parsePlanQuantity(quantityInput);
    setAppliedQty(parsed.ok ? parsed.quantity : undefined);
  };

  const hasSelection = mode === 'STYLE' ? !!style : !!workOrder;
  const shown = view && view.mode === mode ? view : null;
  const toggleBtn = (m: RequirementMode, text: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={`px-3 py-1.5 text-sm rounded border ${mode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
    >{text}</button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="소요명세서 기준">
        {toggleBtn('STYLE', '스타일(자재명세) 기준')}
        {toggleBtn('WORK_ORDER', '특정 작업지시 기준')}
      </div>

      {mode === 'STYLE' ? (
        <form
          className="flex flex-wrap items-end gap-3 mb-4"
          onSubmit={(e) => { e.preventDefault(); applyQuantity(); }}
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">스타일번호 선택</label>
            <SearchSelectField<StyleOption>
              value={style}
              onChange={pickStyle}
              search={searchMasterStyles}
              getKey={(s) => s.styleNo}
              getLabel={(s) => s.styleNo}
              renderRow={(s) => (
                <span><span className="font-mono">{s.styleNo}</span>{s.overview?.styleName ? <span className="text-gray-500 text-sm ml-2">{s.overview.styleName}</span> : null}</span>
              )}
              ariaLabel="스타일번호 선택"
              placeholder="스타일번호 검색"
              title="스타일번호 검색"
              allowClear
              className="min-w-[280px]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">계획수량 (선택)</label>
            <input
              aria-label="계획수량"
              inputMode="numeric"
              className="border border-gray-300 rounded px-3 py-2 w-40"
              placeholder="비우면 총 생산수량"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
            />
          </div>
          <button type="submit" disabled={!style || loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">계산</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">작업지시 선택</label>
            <SearchSelectField<WoOption>
              value={workOrder}
              onChange={setWorkOrder}
              search={searchWorkOrders}
              getKey={(w) => w.id}
              getLabel={workOrderLabel}
              ariaLabel="작업지시 선택"
              placeholder="작업지시 검색 (스타일번호/품목명)"
              title="작업지시 검색"
              className="min-w-[320px]"
            />
          </div>
        </div>
      )}

      {!hasSelection && (
        <p className="text-sm text-gray-500" data-testid="req-hint">
          {mode === 'STYLE'
            ? '스타일번호를 선택하면 계획수량 기준 자재 소요량이 계산됩니다. 작업지시가 없어도 볼 수 있습니다.'
            : '작업지시를 선택하면 물량 기준 자재 소요량이 계산됩니다.'}
        </p>
      )}
      {hasSelection && loading && <div className="p-4 text-gray-500">계산 중...</div>}
      {hasSelection && !loading && shown?.quantityNote && <p className="text-xs text-gray-500 mb-2" data-testid="req-quantity-note">{shown.quantityNote}</p>}
      {hasSelection && !loading && shown && shown.notice && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded p-4 text-sm" data-testid="req-empty">
          {shown.notice}
        </div>
      )}
      {hasSelection && !loading && shown && !shown.notice && (
        <PrintableReport
          title="BOM 소요명세서"
          subtitle={shown.subtitle}
          columns={requirementColumns}
          rows={shown.rows}
          fileName={shown.fileName}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-testid="req-summary">
            {[
              [shown.quantityLabel, fmt(shown.quantity)],
              ['자재 종류', `${shown.totals.materialCount}종`],
              ['부족 자재', `${shown.totals.shortageMaterialCount}종`],
              ['스타일', shown.styleNo ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold mt-1 text-gray-900 break-words">{value}</p>
              </div>
            ))}
          </div>
          <table className="w-full text-sm border-collapse" data-testid="req-table">
            <thead>
              <tr>
                <th className={th}>자재명</th>
                <th className={th}>카테고리</th>
                <th className={`${th} text-right`}>제품 1개당 소요량</th>
                <th className={`${th} text-right`}>필요 총수량</th>
                <th className={`${th} text-right`}>이미 발주 수량</th>
                <th className={`${th} text-right`}>부족 수량</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={6}>BOM에 자재 항목이 없습니다.</td></tr>}
              {shown.rows.map((r) => (
                <tr key={r.itemId} className="break-inside-avoid">
                  <td className={td}>
                    {r.itemName}
                    {r.itemCode && <span className="block text-xs text-gray-400">{r.itemCode}</span>}
                  </td>
                  <td className={td}>{r.categories.join(', ') || '-'}</td>
                  <td className={`${td} text-right`}>{fmt(r.consumptionPerUnit)}</td>
                  <td className={`${td} text-right`}>{fmt(r.requiredQty)}</td>
                  <td className={`${td} text-right`}>{fmt(r.orderedQty)}</td>
                  <td className={`${td} text-right font-semibold ${r.shortageQty > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(r.shortageQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-3">
            필요 총수량 = 제품 1개당 소요량 × {shown.quantityLabel}. 이미 발주 수량은 해당 자재의 전체 발주 합계(취소 제외, 스타일/작업지시와 무관하게 합산)이며
            부족 수량은 필요 총수량에서 뺀 값(음수는 0)입니다.
          </p>
        </PrintableReport>
      )}
    </div>
  );
};
