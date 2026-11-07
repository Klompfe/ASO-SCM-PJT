import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getStyleRequirements, type StyleRequirements } from '../api/workOrders.service';
import { getMasterStyles } from '../api/styles.service';
import { getErrorMessage } from '../utils/errorMessage';
import { requirementEmptyMessage, type MaterialRequirementRow } from '../utils/bomRequirementReport';
import { sortForShortage, filterOrdersByStyleNo, countOtherStylePendingByItem, buildEditableOrderByItem } from '../utils/purchaseOrderForm';
import { formatRequirementQty, formatCountOrQty } from '../utils/materialRequirementDisplay';
import { SearchSelectField } from './SearchSelectField';
import { BulkOrderPreviewModal } from './BulkOrderPreviewModal';
import type { PurchaseOrder } from '../api/purchaseOrders.service';

interface StyleOption { styleNo: string; overview?: { styleName?: string | null; totalQty?: number | string | null } | null }

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

// PR-177: 자재별 미입고 발주(수정 대상). 있으면 버튼이 "수정하기"가 된다.
export type EditableOrderMap = Map<number, { order: PurchaseOrder; pendingCount: number }>;

interface ShortageTableProps {
  rows: MaterialRequirementRow[];
  onPick: (row: MaterialRequirementRow) => void;
  // PR-185 B: 미연결 발주 수량이 있으면 "발주 목록에서 스타일을 연결하세요" 안내를 보여줄 때 쓴다.
  onGoToList?: () => void;
  editable?: EditableOrderMap;
  onEdit?: (order: PurchaseOrder, pendingCount: number) => void;
  // PR-179: 일괄발주용 체크박스(선택 상태는 호출하는 쪽이 가진다).
  selected?: Set<number>;
  onToggle?: (itemId: number) => void;
  // PR-191: 다른 스타일(또는 미연결)의 미입고 발주 건수 — "수정하기" 대상은 아니지만
  // 참고로만 알려준다(버튼 아님). 미연결은 이미 unlinkedOrderedQty 쪽 안내가 있어 여기 포함하지 않는다.
  otherStylePendingCountByItem?: Map<number, number>;
}

// 부족 자재 표(표시 전용). 부족 수량이 있는 행이 위에 오고 강조된다(정렬은 호출하는 쪽의 sortForShortage).
export const ShortageTable: React.FC<ShortageTableProps> = ({ rows, onPick, editable, onEdit, selected, onToggle, onGoToList, otherStylePendingCountByItem }) => {
  const th = 'px-2 py-1 text-left text-xs bg-gray-100 border border-gray-200';
  const td = 'px-2 py-1 text-sm border border-gray-200';
  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="overflow-x-auto">
      <table className="border-collapse" data-testid="shortage-table">
        <thead className="sticky top-0">
          <tr>
            {/* PR-191: 체크박스 <td>가 각 행의 맨 앞에 렌더링되므로 머리글도 맨 앞에 둔다
                (예전에는 맨 뒤 "일괄" 머리글이라 onToggle이 있을 때 모든 머리글이 한 칸씩 밀렸다). */}
            {onToggle && <th className={th}>선택</th>}
            <th className={th}>자재</th>
            <th className={th}>카테고리</th>
            <th className={`${th} text-right`}>필요 총수량</th>
            <th className={`${th} text-right`}>발주(스타일 연결)</th>
            <th className={`${th} text-right`}>발주(미연결, 참고)</th>
            <th className={`${th} text-right`}>부족 수량</th>
            <th className={th}>발주</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className={r.shortageQty > 0 ? 'bg-red-50' : ''} data-testid={`shortage-row-${r.itemId}`}>
              {onToggle && (
                <td className={td}>
                  <input type="checkbox" checked={selected?.has(r.itemId) ?? false} onChange={() => onToggle(r.itemId)} aria-label={`${r.itemName} 일괄발주 선택`} />
                </td>
              )}
              <td className={td}>
                {r.itemName}{r.itemCode && <span className="block text-xs text-gray-400">{r.itemCode}</span>}
                {/* PR-220: 필요량이 작지 수량(출고량)을 썼는지 — 계산값(요척×기획수량)과
                    다른 "자체 계산"이 아니라 작업지시서에 인쇄된 값을 썼음을 알린다. */}
                {r.basis === 'sheet' && (
                  <span className="block text-xs text-emerald-700" data-testid={`basis-sheet-${r.itemId}`}>작지 수량 기준</span>
                )}
                {r.basis === 'mixed' && (
                  <span className="block text-xs text-emerald-700" data-testid={`basis-mixed-${r.itemId}`}>일부 작지 수량 기준</span>
                )}
                {/* PR-231: 수동 지정 — basis가 'manual'(전부 수동)이든 'mixed'(일부만 수동)든
                    hasManualOverride만 보고 배지를 보여준다(불일치/오독/비정상 요척 경고는
                    수동 지정 행이 집계에서 빠지므로 자연히 뜨지 않는다 — material-requirements.util.ts 참고). */}
                {r.hasManualOverride && (
                  <span className="block text-xs px-1 rounded bg-purple-100 text-purple-700 w-fit" data-testid={`manual-override-${r.itemId}`}>수동 지정 포함</span>
                )}
                {r.mismatch && (
                  <span className="block text-xs text-amber-700" data-testid={`sheet-mismatch-${r.itemId}`}>
                    ⚠ 작지 수량({fmt(r.sheetQty ?? 0)})과 계산값(요척×기획수량, {fmt(r.computedQty ?? 0)})이 달라 확인이 필요합니다
                    {/* PR-226 추가(사용자 확인): 작지 값이 스타일 총수량과 정확히 같으면
                        출고량 칸이 아니라 다른 칸(총수량 등)을 읽었을 가능성이 크다는
                        안내를 덧붙인다 — 적용값은 그대로 계산값(위 mismatch 로직 불변). */}
                    {r.sheetQtyLooksLikeTotalQtyMisread && (
                      <span className="block" data-testid={`sheet-looks-like-total-qty-${r.itemId}`}>
                        작지 값이 총수량과 같습니다 — 출고량 칸이 아닌 수량을 읽었을 수 있습니다
                        {/* PR-228: 단위를 개수/길이로 판별할 수 없을 때만(개수 단위면 이 경고 자체가
                            뜨지 않는다) "단위를 확인해 주세요"를 덧붙인다. */}
                        {r.quantityUnitKind === 'unknown' && ' — 단위를 확인해 주세요'}
                      </span>
                    )}
                  </span>
                )}
                {/* PR-228: 계산값과 작지 값의 비율이 10배 초과/1·10 미만이면 ±5% mismatch와
                    별도로 강한 경고 — 요척 자체가 틀렸을 가능성이 크다는 사용자 보고
                    사례(요척에 수량이 잘못 들어가 249,001처럼 부풀려진 값). */}
                {r.extremeConsumptionMismatch && (
                  <span
                    className="block text-xs text-red-700 font-medium"
                    data-testid={`extreme-consumption-mismatch-${r.itemId}`}
                    title="자재·BOM 조회 > 해당 행 수정 > 단위소요량에서 고치세요."
                  >
                    ⚠ 요척이 비정상적으로 보입니다(계산값 {fmt(r.computedQty ?? 0)} / 작지 값 {fmt(r.sheetQty ?? 0)}) — 요척을 확인해 주세요
                  </span>
                )}
                {r.packaging && <span className="block text-xs text-amber-700">{r.packaging.conversionFormula}</span>}
                {r.conversionWarning && <span className="block text-xs text-amber-700" data-testid={`conversion-warning-${r.itemId}`}>⚠ {r.conversionWarning}</span>}
                {/* PR-219: 종류 미지정이라 packaging이 비어 있어도, 자재명 키워드로 추천된
                    종류가 있으면 "참고"로 환산값을 보여준다(아래 필요/발주/부족 칸) —
                    그 환산 근거(추천 종류·신뢰도)는 여기서 함께 밝힌다. */}
                {r.suggestedPackaging && (
                  <span className="block text-xs text-indigo-600" data-testid={`suggested-packaging-${r.itemId}`}>
                    참고: {r.suggestedPackaging.displayName} 추천({r.suggestedPackaging.reason})
                    {r.suggestedPackaging.conflict && <span className="text-amber-700"> — {r.suggestedPackaging.conflictReason}</span>}
                  </span>
                )}
                {(otherStylePendingCountByItem?.get(r.itemId) ?? 0) > 0 && (
                  <span className="block text-xs text-gray-400" data-testid={`other-style-pending-${r.itemId}`}>
                    참고: 다른 스타일 미입고 발주 {otherStylePendingCountByItem!.get(r.itemId)}건 있음
                    {onGoToList && <button type="button" className="ml-1 text-blue-600 underline" onClick={onGoToList}>(발주 목록에서 확인)</button>}
                  </span>
                )}
              </td>
              <td className={td}>{r.categories.join(', ') || '-'}</td>
              <td className={`${td} text-right`}>
                {r.needsColorQty ? <span className="text-amber-700 text-xs" data-testid={`needs-color-qty-${r.itemId}`}>색상별 수량 확인 필요</span>
                  : r.packaging ? `${fmt(r.requiredQty)}m (${formatRequirementQty(r.requiredQty, r.packaging)})`
                  : r.suggestedPackaging ? `${fmt(r.requiredQty)}m (참고 ${formatRequirementQty(r.requiredQty, r.suggestedPackaging)})`
                  : r.conversionWarning ? `${fmt(r.requiredQty)}m`
                  : formatRequirementQty(r.requiredQty, r.packaging)}
              </td>
              <td className={`${td} text-right`}>
                {r.needsColorQty ? <span className="text-amber-700 text-xs">색상별 수량 확인 필요</span>
                  : r.packaging ? formatCountOrQty(r.orderedQty, r.orderedQty, r.packaging.packagingUnitLabel)
                  : r.suggestedPackaging ? `참고 ${formatCountOrQty(r.orderedQty, r.orderedQty, r.suggestedPackaging.packagingUnitLabel)}`
                  : r.conversionWarning ? '종류 확인 필요'
                  : formatCountOrQty(r.orderedQty, undefined, undefined)}
              </td>
              <td className={`${td} text-right text-gray-400`} data-testid={`unlinked-ordered-${r.itemId}`}>
                {(r.unlinkedOrderedQty ?? 0) > 0 ? (
                  <>
                    {formatCountOrQty(r.unlinkedOrderedQty ?? 0, r.packaging ? r.unlinkedOrderedQty : undefined, r.packaging?.packagingUnitLabel)}
                    <button type="button" className="block text-xs text-blue-600 underline ml-auto" onClick={onGoToList}>
                      미연결 발주 — 스타일을 연결하세요
                    </button>
                  </>
                ) : '-'}
              </td>
              {/* PR-219: [A]의 단위 불일치 버그 — 종류 미지정 실/테이프는 미터 필요량에서
                  콘/롤 수를 그대로 빼지 않는다. 추천 종류가 있으면 그 종류 기준 "참고"
                  부족(콘/롤)을, 추천도 없으면 숫자 대신 "종류 확인 필요"를 보여준다.
                  종류가 지정된 행(r.packaging)의 기존 동작은 바꾸지 않는다(PR-216/218 회귀 없음). */}
              <td className={`${td} text-right font-semibold ${r.shortageQty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {r.needsColorQty ? <span className="text-amber-700 font-normal" data-testid={`shortage-unknown-${r.itemId}`}>색상별 수량 확인 필요</span>
                  : r.packaging ? formatCountOrQty(r.shortageQty, r.packaging.shortagePackages, r.packaging.packagingUnitLabel)
                  : r.suggestedPackaging ? <span className="text-indigo-600">참고 {r.suggestedPackaging.shortagePackages}{r.suggestedPackaging.packagingUnitLabel}</span>
                  : r.conversionWarning ? <span className="text-amber-700" data-testid={`shortage-unknown-${r.itemId}`}>종류 확인 필요</span>
                  : formatCountOrQty(r.shortageQty, undefined, undefined)}
              </td>
              <td className={td}>
                {/* PR-220b: needsColorQty 행은 [B] 기본 수량을 비운다(스타일 전체 수량으로
                    대체하지 않음) — onPick 호출 자체는 유지하고, 수량 공백 처리는
                    PurchaseOrdersManager.handlePickMaterial/suggestUnlinkedQuantity·
                    suggestStyleLinkedQuantity 쪽에서 needsColorQty를 보고 판단한다. */}
                {editable?.has(r.itemId) && onEdit ? (
                  <button type="button" className="bg-amber-600 text-white px-2 py-1 rounded text-xs hover:bg-amber-700 whitespace-nowrap" onClick={() => { const e = editable.get(r.itemId)!; onEdit(e.order, e.pendingCount); }}>수정하기</button>
                ) : (
                  <button type="button" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 whitespace-nowrap" onClick={() => onPick(r)}>이 자재로 발주하기</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

// 발주 화면은 자재(Item) 단위라 PurchaseOrder에는 스타일번호가 없다(여러 스타일이 같은 자재를 함께 쓸 수 있음). 이 패널은 발주 데이터를
// 바꾸지 않는 "보조 검색"이다: 스타일을 고르면 그 스타일의 활성 BOM으로 필요 자재/이미 발주/부족을 보여주고(PR-120 소요명세서와
// 같은 서버 계산), 부족한 자재를 골라 발주 폼으로 넘긴다.
export const StyleShortagePanel: React.FC<{
  // PR-230: 스타일명도 같이 넘겨 [B]에 "연결됨: 스타일번호 (스타일명)"으로 보여줄 수
  // 있게 한다(없으면 undefined — 번호만 보여줘도 된다).
  onPickMaterial: (row: MaterialRequirementRow, styleNo: string, styleName?: string | null) => void;
  // PR-185 B: "미연결 발주 N개" 안내를 눌렀을 때 발주 목록 화면으로 이동.
  onGoToList?: () => void;
  refreshKey?: number;
  // PR-191: editable(자재 기준 맵) 대신 전체 미입고 발주 배열을 받아, 패널 안에서
  // 지금 고른 스타일로 필터링한 뒤 buildEditableOrderByItem에 넘긴다 — 그래야 "이
  // 스타일에 연결된" 미입고 발주만 "수정하기"로 판정된다(다른 스타일/미연결 발주
  // 때문에 공용 자재가 엉뚱하게 "이미 발주"로 보이던 문제 수정).
  pendingOrders?: PurchaseOrder[];
  onEdit?: (order: PurchaseOrder, pendingCount: number) => void;
  // PR-179: 일괄발주 완료 후 호출(발주 목록/미입고 발주 새로고침용).
  onBulkDone?: () => void;
}> = ({ onPickMaterial, onGoToList, refreshKey = 0, pendingOrders = [], onEdit, onBulkDone }) => {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [style, setStyle] = useState<StyleOption | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [data, setData] = useState<StyleRequirements | null>(null);
  const [loading, setLoading] = useState(false);

  const searchStyles = async (keyword: string): Promise<StyleOption[]> => {
    const res = await getMasterStyles(keyword ? { styleNo: keyword } : undefined);
    const list: StyleOption[] = Array.isArray(res) ? res : (res?.items ?? []);
    return list.slice(0, 30);
  };

  // 스타일을 고르면 수량은 서버가 정한 기본값(오더개요 총 수량)으로 다시 채운다.
  useEffect(() => {
    if (!style) { setData(null); setQuantityInput(''); return; }
    let cancelled = false;
    setLoading(true);
    getStyleRequirements(style.styleNo)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setQuantityInput(res.quantity > 0 ? String(res.quantity) : '');
      })
      .catch((err) => { if (!cancelled) { toast.error(getErrorMessage(err, '필요 자재를 불러오는 데 실패했습니다.')); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [style]);

  // 발주를 만든 뒤에는 "이미 발주" 수량이 바뀌므로, 지금 입력된 수량 그대로 다시 계산한다.
  useEffect(() => {
    if (refreshKey === 0 || !style) return;
    const q = Number(quantityInput);
    if (!(q > 0)) return;
    getStyleRequirements(style.styleNo, q).then(setData).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const recalc = async () => {
    if (!style) return;
    const q = Number(quantityInput);
    if (!(q > 0)) { toast.error('수량은 0보다 커야 합니다.'); return; }
    setLoading(true);
    try {
      setData(await getStyleRequirements(style.styleNo, q));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '필요 자재를 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  const rows = data ? sortForShortage(data.rows) : [];
  const emptyMessage = data ? requirementEmptyMessage(data.reason) : null;
  // PR-191: "수정하기"는 이 스타일에 연결된 미입고 발주일 때만 — 다른 스타일/미연결
  // 미입고 발주는 참고 안내로만 보여준다(countOtherStylePendingByItem).
  const editable: EditableOrderMap = style ? buildEditableOrderByItem(filterOrdersByStyleNo(pendingOrders, style.styleNo)) : new Map();
  const otherStylePendingCountByItem = style ? countOtherStylePendingByItem(pendingOrders, style.styleNo) : new Map<number, number>();

  return (
    <details className="bg-white border border-gray-200 rounded-lg" open>
      <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700">스타일번호로 필요 자재 찾기 <span className="text-xs font-normal text-gray-400">(클릭하면 스타일번호로 조회해 필요한 자재 목록을 볼 수 있습니다 — 발주할 자재를 고르는 보조 도구)</span></summary>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일번호</label>
            <SearchSelectField<StyleOption>
              value={style}
              onChange={setStyle}
              search={searchStyles}
              getKey={(s) => s.styleNo}
              getLabel={(s) => s.styleNo}
              renderRow={(s) => (
                <span><span className="font-mono">{s.styleNo}</span>{s.overview?.styleName ? <span className="text-gray-500 text-sm ml-2">{s.overview.styleName}</span> : null}</span>
              )}
              ariaLabel="스타일번호"
              placeholder="스타일번호 검색"
              title="스타일번호 검색"
              allowClear
              className="w-64"
            />
          </div>
          {style && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-600 mb-1">생산 수량 {data?.quantitySource === 'STYLE_TOTAL_QTY' && <span className="text-xs text-gray-400">(오더 총수량)</span>}</label>
                <input type="number" min={1} className="border border-gray-300 rounded px-3 py-2 w-32" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} aria-label="생산 수량" />
              </div>
              <button type="button" onClick={recalc} className="bg-gray-700 text-white px-3 py-2 rounded text-sm hover:bg-gray-800">다시 계산</button>
            </div>
          )}
        </div>

        {!style && <p className="text-sm text-gray-500">스타일번호를 검색해 고르면 그 스타일의 BOM 기준으로 필요/이미 발주/부족 수량이 계산됩니다.</p>}
        {style && loading && <p className="text-sm text-gray-500">계산 중...</p>}
        {style && !loading && data && emptyMessage && (
          <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded p-3 text-sm" data-testid="shortage-empty">{emptyMessage}</div>
        )}
        {style && !loading && data && !emptyMessage && (
          <>
            {!(data.quantity > 0) ? (
              <p className="text-sm text-yellow-700" data-testid="shortage-need-qty">이 스타일에는 오더 총수량이 없습니다. 생산 수량을 입력하고 &quot;다시 계산&quot;을 눌러 주세요.</p>
            ) : (
              <p className="text-xs text-gray-500" data-testid="shortage-summary">
                BOM {data.bom?.bomNo} · 생산 수량 {fmt(data.quantity)} 기준 · 자재 {data.totals.materialCount}종 중 <b className="text-red-600">부족 {data.totals.shortageMaterialCount}종</b>
              </p>
            )}
            {rows.length > 0 && (
              <p className="text-xs text-gray-400">&quot;이 자재로 발주하기&quot;를 누르면 아래 발주 폼에 자동으로 채워집니다.</p>
            )}
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2">
                <button type="button" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700" onClick={() => setBulkOpen(true)}>
                  선택 자재 일괄발주 ({selectedItems.size})
                </button>
                <button type="button" className="text-sm text-gray-500 hover:underline" onClick={() => setSelectedItems(new Set())}>선택 해제</button>
              </div>
            )}
            <ShortageTable
              rows={rows}
              onPick={(row) => onPickMaterial(row, style!.styleNo, style!.overview?.styleName ?? null)}
              onGoToList={onGoToList}
              editable={editable}
              onEdit={onEdit}
              selected={selectedItems}
              onToggle={(itemId) => setSelectedItems((prev) => {
                const next = new Set(prev);
                if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
                return next;
              })}
              otherStylePendingCountByItem={otherStylePendingCountByItem}
            />
          </>
        )}
      </div>
      {bulkOpen && (
        <BulkOrderPreviewModal
          sources={rows
            .filter((r) => selectedItems.has(r.itemId))
            .map((r) => ({
              itemId: r.itemId,
              itemName: r.itemName,
              itemCode: r.itemCode,
              shortageQty: r.shortageQty,
              hasEditablePending: editable?.has(r.itemId) ?? false,
              // PR-185 B-2: 실/테이프는 부족분을 콘/롤 단위로 제안한다.
              packagingShortagePackages: r.packaging?.shortagePackages,
              packagingUnitLabel: r.packaging?.packagingUnitLabel,
            }))}
          styleNo={style!.styleNo}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); setSelectedItems(new Set()); onBulkDone?.(); }}
        />
      )}
    </details>
  );
};
