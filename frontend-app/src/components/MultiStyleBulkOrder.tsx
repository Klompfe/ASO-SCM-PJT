import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { SearchSelectField } from './SearchSelectField';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getMultiStyleRequirements } from '../api/workOrders.service';
import { getSuppliers } from '../api/suppliers.service';
import { getMaterialPackagingUnitRules } from '../api/materialPackagingUnitRules.service';
import { getPurchaseOrders, getOrderTypeSuggestion, createPurchaseOrdersBulk, getCombinedPurchaseOrderDocuments, type CombinedPurchaseOrderDocument } from '../api/purchaseOrders.service';
import { downloadBase64File } from '../utils/fileDownload';
import { getErrorMessage } from '../utils/errorMessage';
import { isBulkRowReady } from '../utils/purchaseOrderForm';
import { canCreateWithOrderType, type PurchaseOrderType } from '../utils/purchaseOrderType';
import {
  groupMultiStyleRequirements,
  buildEditableOrderByStyleItem,
  resolveGroupBulkSupplierId,
  exceedsBulkCreateLimit,
  BULK_CREATE_LIMIT_MESSAGE,
  mergePrefillStyleNos,
  type MultiStyleRequirementResult,
  type MultiStyleBulkCategoryGroup,
} from '../utils/multiStyleBulkOrder';

type StyleOption = MasterStyle;

interface RowDraft {
  styleNo: string;
  itemId: number;
  include: boolean;
  supplierId: number | null;
  candidateSupplierIds: number[];
  quantity: number;
  unitPrice: number | null;
  orderType: PurchaseOrderType | null;
  orderTypeReason: string | null;
}

const rowKey = (styleNo: string, itemId: number) => `${styleNo}\u0000${itemId}`;

interface MultiStyleBulkOrderProps {
  // PR-194 보완: 발주·입고·출고 현황에서 체크한 스타일번호를 미리 채워 넣는다
  // (poPrefillItemId/onPrefillConsumed와 동일한 consume-once 패턴). overview 등 나머지
  // 필드는 이 화면에서 선택 표시·목록 구성에만 쓰이므로 styleNo만 있어도 된다.
  prefillStyleNos?: string[] | null;
  onStyleNosPrefillConsumed?: () => void;
}

// PR-194: 여러 스타일을 골라 같은 품목군을 업체별로 묶어 한 번에 발주하고, 업체에는
// 업체별 발주서 1장으로 보낸다. 발주 1건=품목1×스타일1 구조(스타일별 부족분·입고 추적)는
// 그대로 두고, 이 화면은 "여러 스타일을 한 번에 다루는 입력/확인 UI + 업체별 서류"만 더한다.
export const MultiStyleBulkOrder: React.FC<MultiStyleBulkOrderProps> = ({ prefillStyleNos, onStyleNosPrefillConsumed }) => {
  const [selectedStyles, setSelectedStyles] = useState<StyleOption[]>([]);
  const [stylePick, setStylePick] = useState<StyleOption | null>(null);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [results, setResults] = useState<MultiStyleRequirementResult[] | null>(null);
  const [groups, setGroups] = useState<MultiStyleBulkCategoryGroup[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [drafts, setDrafts] = useState<Map<string, RowDraft>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [resultFiles, setResultFiles] = useState<CombinedPurchaseOrderDocument[] | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const searchStyles = async (keyword: string): Promise<StyleOption[]> => {
    const res = await getMasterStyles(keyword ? { styleNo: keyword } : undefined);
    const list: StyleOption[] = Array.isArray(res) ? res : (res?.items ?? []);
    return list.slice(0, 30);
  };

  const addStyle = () => {
    if (!stylePick) return;
    if (selectedStyles.some((s) => s.styleNo === stylePick.styleNo)) { setStylePick(null); return; }
    if (selectedStyles.length >= 30) { toast.error('스타일은 최대 30개까지 고를 수 있습니다.'); return; }
    setSelectedStyles((prev) => [...prev, stylePick]);
    setStylePick(null);
  };

  const removeStyle = (styleNo: string) => setSelectedStyles((prev) => prev.filter((s) => s.styleNo !== styleNo));

  // PR-194 보완: 점검표에서 넘어온 스타일번호를 한 번만 선택 목록에 채운다. overview는
  // 아직 몰라도 되므로(목록 구성·발주 요청은 styleNo만 사용) 최소 형태로 채워 넣는다.
  useEffect(() => {
    if (!prefillStyleNos || prefillStyleNos.length === 0) return;
    setSelectedStyles((prev) => mergePrefillStyleNos(prev, prefillStyleNos, (styleNo) => ({ styleNo } as StyleOption)));
    onStyleNosPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillStyleNos]);

  const loadRequirements = async () => {
    if (selectedStyles.length === 0) { toast.error('스타일을 1개 이상 골라 주세요.'); return; }
    setLoadingRequirements(true);
    setResultFiles(null);
    try {
      const styleNos = selectedStyles.map((s) => s.styleNo);
      const [reqRes, supRes, rulesRes] = await Promise.all([
        getMultiStyleRequirements(styleNos),
        getSuppliers(),
        getMaterialPackagingUnitRules(),
      ]);
      const reqList: MultiStyleRequirementResult[] = Array.isArray(reqRes) ? reqRes : ((reqRes as any)?.data ?? []);
      const supplierList = Array.isArray(supRes) ? supRes : (supRes?.data ?? []);
      const rulesList = Array.isArray(rulesRes) ? rulesRes : (rulesRes?.data ?? []);
      setSuppliers(supplierList);
      setResults(reqList);

      // 자재별 발주 이력(공급업체 후보)과 발주 구분 제안, "이미 미입고 발주 있음" 배지를
      // 한 번에 조회한다(itemId 기준 — BulkOrderPreviewModal과 같은 패턴).
      const itemIds = [...new Set(reqList.flatMap((r) => r.rows.map((row) => row.itemId)))];
      const [histories, suggestions, allPending] = await Promise.all([
        Promise.all(itemIds.map((id) => getPurchaseOrders({ itemId: id }).catch(() => []))),
        Promise.all(itemIds.map((id) => getOrderTypeSuggestion(id).catch(() => null))),
        getPurchaseOrders({ status: 'PENDING' }).catch(() => []),
      ]);
      const candidatesByItem = new Map<number, number[]>();
      const orderTypeByItem = new Map<number, { orderType: PurchaseOrderType | null; reason: string | null }>();
      itemIds.forEach((id, i) => {
        const orders = Array.isArray(histories[i]) ? histories[i] : ((histories[i] as any)?.data ?? []);
        candidatesByItem.set(id, [...new Set<number>(orders.filter((o: any) => o.supplier).map((o: any) => Number(o.supplier.id)))]);
        const s = suggestions[i] as any;
        orderTypeByItem.set(id, { orderType: s?.orderType ?? null, reason: s?.reason ?? null });
      });
      const pendingList = Array.isArray(allPending) ? allPending : ((allPending as any)?.data ?? []);
      const editableKeys = buildEditableOrderByStyleItem(pendingList);

      const builtGroups = groupMultiStyleRequirements(reqList, rulesList, editableKeys);
      setGroups(builtGroups);

      const nextDrafts = new Map<string, RowDraft>();
      for (const group of builtGroups) {
        for (const item of group.items) {
          const candidates = candidatesByItem.get(item.itemId) ?? [];
          const typeInfo = orderTypeByItem.get(item.itemId) ?? { orderType: null, reason: null };
          for (const row of item.rows) {
            const key = rowKey(row.styleNo, item.itemId);
            nextDrafts.set(key, {
              styleNo: row.styleNo,
              itemId: item.itemId,
              include: !row.hasEditablePending,
              supplierId: candidates.length === 1 ? candidates[0] : null,
              candidateSupplierIds: candidates,
              quantity: row.suggestion.quantity ?? 0,
              unitPrice: null,
              orderType: typeInfo.orderType,
              orderTypeReason: typeInfo.reason,
            });
          }
        }
      }
      setDrafts(nextDrafts);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '소요량을 불러오는 데 실패했습니다.'));
    } finally {
      setLoadingRequirements(false);
    }
  };

  const updateDraft = (key: string, patch: Partial<RowDraft>) =>
    setDrafts((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, ...patch });
      return next;
    });

  const applyGroupSupplier = (group: MultiStyleBulkCategoryGroup) => {
    const candidatesPerItem = group.items.map((item) => drafts.get(rowKey(item.rows[0]?.styleNo ?? '', item.itemId))?.candidateSupplierIds ?? []);
    const supplierId = resolveGroupBulkSupplierId(candidatesPerItem);
    if (supplierId == null) {
      toast.error('이 품목군은 이력상 후보 공급업체가 여럿이거나 없어 일괄 지정할 수 없습니다 — 직접 골라 주세요.');
      return;
    }
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const item of group.items) {
        for (const row of item.rows) {
          const key = rowKey(row.styleNo, item.itemId);
          const cur = next.get(key);
          if (cur) next.set(key, { ...cur, supplierId });
        }
      }
      return next;
    });
  };

  const includedRows = useMemo(() => [...drafts.values()].filter((d) => d.include), [drafts]);
  const problemRows = useMemo(
    () => includedRows.filter((d) => !isBulkRowReady({ supplierId: d.supplierId, quantity: d.quantity, unitPrice: d.unitPrice }, d.orderType !== 'PROVISIONAL') || !canCreateWithOrderType(d.orderType)),
    [includedRows],
  );
  const overLimit = exceedsBulkCreateLimit(includedRows.length);
  const canCreate = includedRows.length > 0 && problemRows.length === 0 && !overLimit;

  const commit = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      const created = await createPurchaseOrdersBulk(includedRows.map((d) => ({
        supplierId: d.supplierId as number,
        itemId: d.itemId,
        quantity: d.quantity,
        unitPrice: d.unitPrice ?? undefined,
        orderType: d.orderType as PurchaseOrderType,
        styleNo: d.styleNo,
      })));
      const createdList: { id: number }[] = Array.isArray(created) ? created : ((created as any)?.data ?? []);
      setCreatedCount(createdList.length);
      toast.success(`${createdList.length}건의 발주가 생성되었습니다.`);
      try {
        const files = await getCombinedPurchaseOrderDocuments(createdList.map((c) => c.id));
        setResultFiles(files);
      } catch {
        // 발주 생성은 끝났으니 발주서 생성 실패는 별도 안내만(재시도는 발주 목록에서 가능).
        toast.error('발주는 생성됐지만 합본 발주서 생성에 실패했습니다 — 발주 목록에서 다시 시도해 주세요.');
      }
      setDrafts(new Map());
      setGroups([]);
      setResults(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '일괄발주에 실패했습니다. 아무 발주도 생성되지 않았습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800">1) 스타일 선택 (최대 30개)</h3>
        <div className="flex items-end gap-2">
          <SearchSelectField<StyleOption>
            value={stylePick}
            onChange={setStylePick}
            search={searchStyles}
            getKey={(s) => s.styleNo}
            getLabel={(s) => s.styleNo}
            renderRow={(s) => (
              <span><span className="font-mono">{s.styleNo}</span>{s.overview?.styleName ? <span className="text-gray-500 text-sm ml-2">{s.overview.styleName}</span> : null}</span>
            )}
            ariaLabel="스타일번호 추가"
            placeholder="스타일번호 검색 후 추가"
            title="스타일번호 검색"
            allowClear
            className="w-64"
          />
          <button type="button" className="bg-gray-600 text-white px-3 py-2 rounded text-sm" onClick={addStyle} disabled={!stylePick}>추가</button>
        </div>
        {selectedStyles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedStyles.map((s) => (
              <span key={s.styleNo} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-sm">
                {s.styleNo}
                <button type="button" aria-label={`${s.styleNo} 제거`} onClick={() => removeStyle(s.styleNo)} className="text-indigo-400 hover:text-indigo-700">✕</button>
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={selectedStyles.length === 0 || loadingRequirements}
          onClick={loadRequirements}
        >{loadingRequirements ? '불러오는 중...' : '소요량 불러오기'}</button>
        {results && results.some((r) => r.error) && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 text-sm">
            {results.filter((r) => r.error).map((r) => <div key={r.styleNo}>{r.styleNo}: {r.error}</div>)}
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-gray-800">2) 품목군 묶음 — 업체 지정 후 확인</h3>
          {groups.map((group) => (
            <details key={group.key} open className="border border-gray-200 rounded">
              <summary className="px-3 py-2 bg-gray-50 cursor-pointer font-medium flex items-center justify-between">
                <span>{group.key}</span>
                <button
                  type="button"
                  className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
                  onClick={(e) => { e.preventDefault(); applyGroupSupplier(group); }}
                >품목군 전체 업체 일괄 지정</button>
              </summary>
              <div className="p-3 space-y-3">
                {group.items.map((item) => {
                  const itemCollapseKey = `${group.key}\u0000${item.itemId}`;
                  const isCollapsed = collapsed.has(itemCollapseKey);
                  return (
                    <div key={item.itemId} className="border border-gray-100 rounded">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 bg-gray-50 text-sm font-medium flex justify-between items-center"
                        onClick={() => toggleCollapsed(itemCollapseKey)}
                      >
                        <span>
                          {item.itemName} <span className="text-xs text-gray-400">{item.itemCode}</span>
                          {item.materialSubTypeLabel && <span className="text-xs text-indigo-600 ml-1">({item.materialSubTypeLabel})</span>}
                        </span>
                        <span className="text-xs text-gray-400">{isCollapsed ? '펼치기' : '접기'}</span>
                      </button>
                      {!isCollapsed && (
                        <table className="w-full text-sm">
                          <thead className="bg-white border-b">
                            <tr>
                              <th className="p-2 text-left">포함</th>
                              <th className="p-2 text-left">스타일</th>
                              <th className="p-2 text-right">필요/기발주/부족</th>
                              <th className="p-2 text-left">공급업체</th>
                              <th className="p-2 text-left">구분</th>
                              <th className="p-2 text-right">수량</th>
                              <th className="p-2 text-right">단가</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.rows.map((row) => {
                              const key = rowKey(row.styleNo, item.itemId);
                              const d = drafts.get(key);
                              if (!d) return null;
                              return (
                                <tr key={key} className="border-t">
                                  <td className="p-2">
                                    <input type="checkbox" checked={d.include} onChange={(e) => updateDraft(key, { include: e.target.checked })} aria-label={`${row.styleNo} ${item.itemName} 포함`} />
                                  </td>
                                  <td className="p-2">
                                    {row.styleNo}
                                    {row.hasEditablePending && <span className="block text-xs text-amber-700">이미 미입고 발주 있음</span>}
                                  </td>
                                  <td className="p-2 text-right text-xs text-gray-500">{row.suggestion.summary}</td>
                                  <td className="p-2">
                                    <select
                                      className="border rounded px-2 py-1 w-44"
                                      value={d.supplierId ?? ''}
                                      onChange={(e) => updateDraft(key, { supplierId: e.target.value ? Number(e.target.value) : null })}
                                      aria-label={`${row.styleNo} ${item.itemName} 공급업체`}
                                    >
                                      <option value="">(직접 선택)</option>
                                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{d.candidateSupplierIds.includes(s.id) ? ' · 이력' : ''}</option>)}
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    <select
                                      className="border rounded px-2 py-1 w-32"
                                      value={d.orderType ?? ''}
                                      onChange={(e) => updateDraft(key, { orderType: e.target.value === '' ? null : (e.target.value as PurchaseOrderType) })}
                                      aria-label={`${row.styleNo} ${item.itemName} 구분`}
                                    >
                                      <option value="">구분 선택</option>
                                      <option value="FIRM">실발주(FOB)</option>
                                      <option value="PROVISIONAL">가발주(CMT)</option>
                                    </select>
                                  </td>
                                  <td className="p-2 text-right">
                                    <input type="number" min={0} className="border rounded px-2 py-1 w-20 text-right" value={d.quantity} onChange={(e) => updateDraft(key, { quantity: Number(e.target.value) })} aria-label={`${row.styleNo} ${item.itemName} 수량`} />
                                  </td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      className="border rounded px-2 py-1 w-24 text-right"
                                      value={d.unitPrice ?? ''}
                                      placeholder={d.orderType === 'PROVISIONAL' ? '선택 입력' : '필수'}
                                      onChange={(e) => updateDraft(key, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })}
                                      aria-label={`${row.styleNo} ${item.itemName} 단가`}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-gray-600">
              포함 {includedRows.length}건
              {problemRows.length > 0 && <span className="text-red-600 ml-2">문제 {problemRows.length}건(업체 미지정/수량 0/단가 필요)</span>}
              {overLimit && <span className="text-red-600 ml-2">{BULK_CREATE_LIMIT_MESSAGE}</span>}
            </div>
            <button
              type="button"
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={!canCreate || submitting}
              onClick={commit}
            >{submitting ? '생성 중...' : `일괄 생성 (${includedRows.length}건)`}</button>
          </div>
        </div>
      )}

      {resultFiles && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-gray-800">3) 결과 — {createdCount}건 생성됨</h3>
          <div className="flex flex-wrap gap-2">
            {resultFiles.map((f) => (
              <button
                key={f.supplierId}
                type="button"
                className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm"
                onClick={() => downloadBase64File(f.base64, f.filename)}
              >{f.supplierName} 발주서 다운로드</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
