import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getMasterStyles, getStyleColorSizeQuantities } from '../api/styles.service';
import { getBomByStyleNo, type BomItemRow } from '../api/boms.service';
import { getSuppliers } from '../api/suppliers.service';
import { getItem } from '../api/items.service';
import { getMaterialPackagingUnitRules, type MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';
import {
  getPurchaseOrders,
  createPurchaseOrdersBulk,
  getCombinedPurchaseOrderDocuments,
  type CombinedPurchaseOrderDocument,
} from '../api/purchaseOrders.service';
import { downloadBase64File } from '../utils/fileDownload';
import { getErrorMessage } from '../utils/errorMessage';
import { buildColorQtyMap, resolveAppliedQuantity } from '../utils/appliedQuantity';
import { formatBomItemQty } from '../utils/materialRequirementDisplay';
import { pickLatestOrderDefaults } from '../utils/purchaseOrderForm';
import {
  findExactSupplierMatch,
  pickSupplierPrefill,
  pickPricePrefill,
  SUPPLIER_SOURCE_LABEL,
  PRICE_SOURCE_LABEL,
} from '../utils/orderPrefill';
import {
  buildInitialDrafts,
  groupDraftsBySupplier,
  canCreateBulkOrders,
  summarizeBulkOrders,
  createOrdersBySupplier,
  type BulkOrderRowInput,
  type BulkOrderRowDraft,
  type BulkOrderType,
} from '../utils/bomBulkOrderGrouping';

interface BomBulkOrderPanelProps {
  styleNo: string;
  bomItemIds: number[];
  onClose: () => void;
}

interface SupplierResult {
  supplierId: number;
  supplierName: string;
  success: boolean;
  createdIds: number[];
  reason?: string;
}

// PR-238(사용자 요구): 자재명세에서 고른 자재들을 공급업체별로 묶어 발주서를 만든다.
// 새 백엔드는 없다 — PO 구조가 "품목 1개×스타일 1개=PO 1건"(createBulk)이라, 업체마다
// 기존 일괄발주 API(createPurchaseOrdersBulk)를 따로 호출해 "업체 내부는 전체 또는
// 전체 롤백, 업체 간은 서로 독립"을 만족시킨다. 발주서 생성(업체당 1장)도 기존
// getCombinedPurchaseOrderDocuments를 그대로 쓴다.
export function BomBulkOrderPanel({ styleNo, bomItemIds, onClose }: BomBulkOrderPanelProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<BulkOrderRowDraft[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [packagingRules, setPackagingRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [rowMeta, setRowMeta] = useState<Map<number, { threadType?: string | null; tapeType?: string | null; itemUnit: string | null }>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<SupplierResult[] | null>(null);
  const [documents, setDocuments] = useState<CombinedPurchaseOrderDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [bomRes, styleRes, colorQtyRes, rulesRes, supplierRes] = await Promise.all([
          getBomByStyleNo(styleNo),
          getMasterStyles({ styleNo }),
          getStyleColorSizeQuantities(styleNo).catch(() => ({ totalByColor: [] })),
          getMaterialPackagingUnitRules().catch(() => []),
          getSuppliers().catch(() => []),
        ]);
        if (cancelled) return;

        const allItems: BomItemRow[] = Array.isArray(bomRes?.items) ? bomRes.items : [];
        const idSet = new Set(bomItemIds);
        const rows = allItems.filter((it) => idSet.has(it.id));
        if (rows.length === 0) {
          setLoadError('선택한 자재를 더 이상 이 스타일의 자재명세에서 찾을 수 없습니다(이미 삭제되었을 수 있습니다).');
          setLoading(false);
          return;
        }

        const styleList = Array.isArray(styleRes) ? styleRes : (styleRes?.data ?? []);
        const totalQty = styleList.find((s: any) => s.styleNo === styleNo)?.overview?.totalQty ?? null;
        const colorQtyMap = buildColorQtyMap((colorQtyRes as any)?.totalByColor ?? []);
        const rulesList: MaterialPackagingUnitRule[] = Array.isArray(rulesRes) ? rulesRes : ((rulesRes as any)?.data ?? []);
        const supplierList = Array.isArray(supplierRes) ? supplierRes : ((supplierRes as any)?.data ?? []);
        setPackagingRules(rulesList);
        setSuppliers(supplierList);

        // PR-194와 같은 패턴: 품목별 발주 이력에서 공급업체 후보(정확히 1곳일 때만)를
        // 뽑고, 같은 스타일의 취소되지 않은 발주 건수를 "이미 발주됨" 배지에 쓴다.
        // PR-240: 이 "후보"는 공급업체 우선순위의 3순위(최근 발주)로 쓰고, 그 공급업체의
        // 최근 발주 단가도 함께 뽑아 둔다(같은 자재+같은 공급사 조건).
        const itemIds = [...new Set(rows.map((r) => r.material?.id).filter((v): v is number => v != null))];
        const [histories, vendorInfos] = await Promise.all([
          Promise.all(itemIds.map((id) => getPurchaseOrders({ itemId: id }).catch(() => []))),
          Promise.all(itemIds.map((id) => getItem(id).catch(() => null))),
        ]);
        const alreadyOrderedByItem = new Map<number, number>();
        const recentOrderSupplierByItem = new Map<number, { id: number; name: string } | null>();
        const recentOrderPriceByItem = new Map<number, number | null>();
        const vendorNameByItem = new Map<number, string | null>();
        itemIds.forEach((id, i) => {
          const list: any[] = Array.isArray(histories[i]) ? histories[i] : ((histories[i] as any)?.data ?? []);
          const supplierIds: number[] = [...new Set(list.filter((o: any) => o.supplier).map((o: any) => Number(o.supplier.id)))];
          const candidateSupplierId = supplierIds.length === 1 ? supplierIds[0] : null;
          const sameStyleActive = list.filter((o: any) => o.styleNo === styleNo && o.status !== 'CANCELLED');
          alreadyOrderedByItem.set(id, sameStyleActive.length);
          const latest = pickLatestOrderDefaults(list);
          recentOrderSupplierByItem.set(id, candidateSupplierId != null ? (latest?.supplier ?? null) : null);
          // "같은 자재+같은 공급사"만 믿는다 — 최근 발주가 다른 공급사 건이면 단가를 쓰지 않는다.
          recentOrderPriceByItem.set(id, latest && candidateSupplierId != null && latest.supplier.id === candidateSupplierId ? latest.unitPrice : null);
          vendorNameByItem.set(id, vendorInfos[i]?.vendor ?? null);
        });

        // BOM 행 공급사/품목 마스터 vendor 이름을 실제 공급업체와 매칭한다(정확히 일치할
        // 때만, 추측 매칭 금지) — 이미 불러온 공급업체 목록(suppliers 검색 결과)으로 끝낸다.
        const bomSupplierMatchByBomItemId = new Map<number, { id: number; name: string } | null>();
        const vendorMatchByItemId = new Map<number, { id: number; name: string } | null>();
        for (const it of rows) {
          bomSupplierMatchByBomItemId.set(it.id, findExactSupplierMatch(it.supplier, supplierList));
        }
        for (const id of itemIds) {
          vendorMatchByItemId.set(id, findExactSupplierMatch(vendorNameByItem.get(id), supplierList));
        }

        const meta = new Map<number, { threadType?: string | null; tapeType?: string | null; itemUnit: string | null }>();
        const inputs: BulkOrderRowInput[] = rows.map((it) => {
          const applied = resolveAppliedQuantity({
            consumption: it.consumption,
            totalQty,
            sheetQty: it.sheetQty ?? null,
            sheetQtyUnit: it.sheetQtyUnit ?? null,
            itemUnit: it.material?.unit ?? null,
            colorCode: it.colorCode,
            colorQtyMap,
            manualRequiredQty: it.manualRequiredQty ?? null,
            manualRequiredQtyNote: it.manualRequiredQtyNote ?? null,
          });
          meta.set(it.id, { threadType: it.threadType, tapeType: it.tapeType, itemUnit: it.material?.unit ?? null });
          // 근거 없음(unknown)이거나 극단 불일치면 수량을 비워 둔다 — 사람이 직접
          // 입력해야 생성 가능(기존 포장단위/경고 규칙 그대로, 새 계산 없음).
          const suggestedQuantity = applied.basis === 'unknown' || applied.extremeConsumptionMismatch ? null : applied.qty;
          const itemId = it.material?.id ?? 0;
          // PR-240: 포장 규칙이 있는 행(N콘/N롤)은 BOM 확정 단가(길이 기준)를 그대로 쓰면
          // 금액이 틀릴 수 있어(자동 환산 금지) 최근 발주 단가만 후보로 쓴다.
          const packagingApplies = !!(it.threadType || it.tapeType);
          const supplierPick = pickSupplierPrefill({
            bom: bomSupplierMatchByBomItemId.get(it.id) ?? null,
            vendor: vendorMatchByItemId.get(itemId) ?? null,
            recentOrder: recentOrderSupplierByItem.get(itemId) ?? null,
          });
          const pricePick = pickPricePrefill({
            bomUnitPrice: it.unitPrice,
            recentOrderUnitPrice: recentOrderPriceByItem.get(itemId) ?? null,
            packagingApplies,
          });
          return {
            bomItemId: it.id,
            itemId,
            itemName: it.material?.name ?? '',
            category: it.category,
            colorCode: it.colorCode,
            unit: it.material?.unit ?? null,
            candidateSupplierId: supplierPick?.supplier.id ?? null,
            candidateSupplierSource: supplierPick?.source ?? null,
            alreadyOrderedCount: itemId ? (alreadyOrderedByItem.get(itemId) ?? 0) : 0,
            suggestedQuantity,
            suggestedUnitPrice: pricePick?.unitPrice ?? null,
            priceSource: pricePick?.source ?? null,
          };
        });

        setRowMeta(meta);
        setDrafts(buildInitialDrafts(inputs));
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, '자재명세를 불러오는 데 실패했습니다.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleNo, bomItemIds.join(',')]);

  const updateDraft = (bomItemId: number, patch: Partial<BulkOrderRowDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.bomItemId === bomItemId ? { ...d, ...patch } : d)));

  const { groups, unassigned } = useMemo(() => groupDraftsBySupplier(drafts), [drafts]);
  const summary = summarizeBulkOrders(drafts);
  const canCreate = canCreateBulkOrders(drafts) && unassigned.length === 0;

  const supplierName = (id: number) => suppliers.find((s) => s.id === id)?.name ?? `업체 #${id}`;

  const packagingText = (bomItemId: number, qty: number | null): string => {
    if (qty == null) return '-';
    const meta = rowMeta.get(bomItemId);
    const subtype = meta?.threadType ?? meta?.tapeType ?? null;
    const draft = drafts.find((d) => d.bomItemId === bomItemId);
    const display = formatBomItemQty(qty, { subtype, itemName: draft?.itemName, itemUnit: meta?.itemUnit }, packagingRules);
    return display.text;
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    const { groups: finalGroups } = groupDraftsBySupplier(drafts);
    const proceed = window.confirm(`업체 ${finalGroups.length}곳 · 총 ${summary.totalCount}건의 발주서를 생성합니다. 계속할까요?`);
    if (!proceed) return;

    setSubmitting(true);
    const rawResults = await createOrdersBySupplier(finalGroups, styleNo, async (payload) => {
      try {
        const created = await createPurchaseOrdersBulk(payload);
        return Array.isArray(created) ? created : ((created as any)?.data ?? []);
      } catch (err) {
        // 서버가 돌려주는 한글 오류 문구를 그대로 보존(getErrorMessage가 axios
        // 응답 본문을 풀어주므로, Error.message로 한 번 감싸 createOrdersBySupplier에 전달).
        throw new Error(getErrorMessage(err, '알 수 없는 오류'));
      }
    });
    const nextResults: SupplierResult[] = rawResults.map((r) => ({
      supplierId: r.supplierId,
      supplierName: supplierName(r.supplierId),
      success: r.success,
      createdIds: r.createdIds,
      reason: r.reason,
    }));
    setResults(nextResults);

    const succeededIds = nextResults.filter((r) => r.success).flatMap((r) => r.createdIds);
    if (succeededIds.length > 0) {
      try {
        const files = await getCombinedPurchaseOrderDocuments(succeededIds);
        setDocuments(files);
      } catch {
        toast.error('발주는 생성됐지만 발주서 생성에 실패했습니다 — 발주 목록에서 다시 시도해 주세요.');
      }
      // 성공한 업체의 행만 화면에서 뺀다 — 실패한 업체는 그대로 남겨 수정 후 재시도.
      const succeededSupplierIds = new Set(nextResults.filter((r) => r.success).map((r) => r.supplierId));
      setDrafts((prev) => prev.filter((d) => d.supplierId == null || !succeededSupplierIds.has(d.supplierId)));
      toast.success(`${succeededSupplierIds.size}개 업체 발주서 생성 완료`);
    }
    if (nextResults.some((r) => !r.success)) {
      toast.error('일부 업체의 발주 생성에 실패했습니다 — 아래 결과를 확인해 주세요.');
    }
    setSubmitting(false);
  };

  if (loading) return <div className="p-4 text-gray-500">불러오는 중...</div>;
  if (loadError) return <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg">{loadError}</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">한 품번 일괄 발주 — {styleNo}</h3>
          <button type="button" className="text-sm text-gray-500 hover:underline" onClick={onClose}>발주 목록에서 보기</button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          선택 자재 {drafts.length}건 · 공급사 {summary.supplierCount}곳
        </p>
      </div>

      {unassigned.length > 0 && (
        <div className="bg-white border border-amber-300 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-amber-800">공급사 미지정 ({unassigned.length}건) — 먼저 공급사를 골라야 생성할 수 있습니다</h4>
          <table className="w-full text-sm">
            <tbody>
              {unassigned.map((d) => (
                <tr key={d.bomItemId} className="border-t">
                  <td className="p-2">{d.itemName} <span className="text-xs text-gray-400">{d.colorCode}</span></td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1 w-44"
                      aria-label={`${d.itemName} 공급업체 선택`}
                      value=""
                      onChange={(e) => updateDraft(d.bomItemId, { supplierId: e.target.value ? Number(e.target.value) : null, supplierSource: null })}
                    >
                      <option value="">공급업체 선택</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.supplierId} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-gray-800">{supplierName(group.supplierId)}</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">자재</th>
                <th className="p-2 text-left">색상/구분</th>
                <th className="p-2 text-left">단위</th>
                <th className="p-2 text-right">필요수량(적용)</th>
                <th className="p-2 text-right">포장단위</th>
                <th className="p-2 text-right">발주수량</th>
                <th className="p-2 text-left">구분</th>
                <th className="p-2 text-right">단가</th>
                <th className="p-2 text-left">제외</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((d) => (
                <tr key={d.bomItemId} className="border-t">
                  <td className="p-2">
                    {d.itemName}
                    {d.supplierSource && (
                      <span className="block text-xs text-gray-400" data-testid="bulk-supplier-source">
                        {SUPPLIER_SOURCE_LABEL[d.supplierSource]}
                      </span>
                    )}
                    {d.alreadyOrderedCount > 0 && (
                      <div className="text-xs text-amber-700">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={d.alreadyOrderedConfirmed}
                            onChange={(e) => updateDraft(d.bomItemId, { alreadyOrderedConfirmed: e.target.checked })}
                          />
                          이 스타일에서 이미 {d.alreadyOrderedCount}건 발주됨 — 중복 발주일 수 있습니다, 확인했습니다
                        </label>
                      </div>
                    )}
                  </td>
                  <td className="p-2">{d.colorCode} / {d.category}</td>
                  <td className="p-2">{d.unit ?? '-'}</td>
                  <td className="p-2 text-right">{d.quantity ?? <span className="text-red-600">직접 입력 필요</span>}</td>
                  <td className="p-2 text-right">{packagingText(d.bomItemId, d.quantity)}</td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="border rounded px-2 py-1 w-24 text-right"
                      aria-label={`${d.itemName} 발주수량`}
                      value={d.quantity ?? ''}
                      onChange={(e) => updateDraft(d.bomItemId, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1 w-28"
                      aria-label={`${d.itemName} 구분`}
                      value={d.orderType ?? ''}
                      onChange={(e) => updateDraft(d.bomItemId, { orderType: e.target.value === '' ? null : (e.target.value as BulkOrderType) })}
                    >
                      <option value="">구분 선택</option>
                      <option value="FIRM">실발주(FOB)</option>
                      <option value="PROVISIONAL">가발주(CMT)</option>
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="border rounded px-2 py-1 w-24 text-right"
                      aria-label={`${d.itemName} 단가`}
                      placeholder={d.orderType === 'PROVISIONAL' ? '선택 입력' : '필수'}
                      value={d.unitPrice ?? ''}
                      onChange={(e) => updateDraft(d.bomItemId, { unitPrice: e.target.value === '' ? null : Number(e.target.value), priceSource: null })}
                    />
                    {d.unitPrice != null && (
                      <span className="block text-xs text-gray-400" data-testid="bulk-price-source">
                        {d.priceSource ? PRICE_SOURCE_LABEL[d.priceSource] : '직접 입력'}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`${d.itemName} 이 화면에서 제외`}
                      checked={d.excluded}
                      onChange={(e) => updateDraft(d.bomItemId, { excluded: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">업체 {summary.supplierCount}곳 · 총 {summary.totalCount}건</span>
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={!canCreate || submitting}
          onClick={handleCreate}
        >{submitting ? '생성 중...' : '업체별 발주서 생성'}</button>
      </div>

      {results && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-gray-800">생성 결과</h4>
          <ul className="text-sm space-y-1">
            {results.map((r) => (
              <li key={r.supplierId} className={r.success ? 'text-green-700' : 'text-red-700'}>
                {r.supplierName}: {r.success ? `${r.createdIds.length}건 생성됨` : `실패 — ${r.reason}`}
              </li>
            ))}
          </ul>
          {documents.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {documents.map((f) => (
                <button
                  key={f.supplierId}
                  type="button"
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm"
                  onClick={() => downloadBase64File(f.base64, f.filename)}
                >{f.supplierName} 발주서 다운로드</button>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 pt-2">
            자재명세 탭으로 돌아가면 새로고침해야 "발주 N건" 배지가 갱신됩니다(자동 갱신 아님).
          </p>
        </div>
      )}
    </div>
  );
}
