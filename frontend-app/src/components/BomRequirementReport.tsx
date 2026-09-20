import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getMaterialRequirements } from '../api/workOrders.service';
import { SearchSelectField } from './SearchSelectField';
import { searchWorkOrders } from '../utils/searchFetchers';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import {
  describeRequirement,
  requirementColumns,
  requirementEmptyMessage,
  type MaterialRequirements,
} from '../utils/bomRequirementReport';

interface WoOption { id: number; targetQuantity: number; status: string; item?: { name: string; styleNo?: string } }

// 기존 <option> 문구 그대로: #ID · 스타일번호 · 품목명 · 물량
const workOrderLabel = (w: WoOption) =>
  `#${w.id} · ${w.item?.styleNo ?? '스타일번호 없음'} · ${w.item?.name ?? ''} · ${fmt(Number(w.targetQuantity))}`;

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left';
const td = 'border border-gray-300 px-2 py-1';

// PR-120: BOM 소요명세서 — 작업지시를 고르면 그 물량으로 BOM을 전개해 자재별 필요 총수량과, 이미 발주한
// 수량 대비 부족 수량을 보여준다(구매 계획용). 계산은 서버(GET /work-orders/:id/material-requirements).
export const BomRequirementReport: React.FC = () => {
  // PR-127: 작업지시는 <select>(최신 100건만 불러와 그 밖의 작업지시는 선택 불가)가 아니라 서버 검색 선택이다.
  const [workOrder, setWorkOrder] = useState<WoOption | null>(null);
  const selectedId = workOrder ? String(workOrder.id) : '';
  const [data, setData] = useState<MaterialRequirements | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    getMaterialRequirements(Number(selectedId))
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) { toast.error(getErrorMessage(err, '소요명세서를 불러오는 데 실패했습니다.')); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const emptyMessage = data ? requirementEmptyMessage(data.reason) : null;

  return (
    <div>
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

      {!selectedId && <p className="text-sm text-gray-500">작업지시를 선택하면 물량 기준 자재 소요량이 계산됩니다.</p>}
      {selectedId && loading && <div className="p-4 text-gray-500">계산 중...</div>}
      {selectedId && !loading && data && emptyMessage && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded p-4 text-sm" data-testid="req-empty">
          {emptyMessage}
        </div>
      )}
      {selectedId && !loading && data && !emptyMessage && (
        <PrintableReport
          title="BOM 소요명세서"
          subtitle={describeRequirement(data)}
          columns={requirementColumns}
          rows={data.rows}
          fileName={`BOM_소요명세서_${data.styleNo ?? data.workOrder.id}`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-testid="req-summary">
            {[
              ['작업지시 물량', fmt(data.workOrder.targetQuantity)],
              ['자재 종류', `${data.totals.materialCount}종`],
              ['부족 자재', `${data.totals.shortageMaterialCount}종`],
              ['스타일', data.styleNo ?? '-'],
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
              {data.rows.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={6}>BOM에 자재 항목이 없습니다.</td></tr>}
              {data.rows.map((r) => (
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
            필요 총수량 = 제품 1개당 소요량 × 작업지시 물량. 이미 발주 수량은 해당 자재의 전체 발주 합계(취소 제외, 작업지시와 무관하게 합산)이며
            부족 수량은 필요 총수량에서 뺀 값(음수는 0)입니다.
          </p>
        </PrintableReport>
      )}
    </div>
  );
};
