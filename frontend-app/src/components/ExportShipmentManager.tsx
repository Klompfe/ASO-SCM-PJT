import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getExportShipments,
  getExportShipment,
  generateExportShipment,
  updateExportShipmentStatus,
  updateExportShipmentLine,
  updateExportShipmentExchangeRate,
  confirmExportShipmentLinePrice,
  importExportShipmentFromFile,
  type ExportShipment,
  type ExportShipmentLine,
  type GenerateExportShipment,
} from '../api/exportShipments.service';
import { findMidoPriceCandidates, type MidoPriceItem, type MeterPriceConversionOption } from '../api/midoPriceTable.service';
import { selectRawCandidate, selectConvertedOption, clearSelection, resolveSource } from '../utils/invoiceLinePriceEditor';
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
import { getExportShipmentDefaults } from '../api/exportShipmentDefaults.service';
import { lookupCustomsExchangeRate, type ExchangeRateType, type ExchangeRateLookupResult } from '../api/customsExchangeRates.service';
import { buildInvoiceRateBadge, sourceLabel } from '../utils/customsExchangeRates';
import { getErrorMessage } from '../utils/errorMessage';

const STATUS_LABELS: Record<string, string> = { DRAFT: '초안', REVIEWED: '검토완료', FINALIZED: '확정' };
const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REVIEWED: 'bg-yellow-100 text-yellow-800',
  FINALIZED: 'bg-green-100 text-green-800',
};

const emptyHeader: GenerateExportShipment = {
  sheetNo: '', invoiceDate: '', shipperInfo: '', consigneeInfo: '', portOfLoading: '', finalDestination: '', carrier: '', sailingDate: '',
};

// PR-075: PackingReceipt(PR-074)+BomItem.composition/hsCode(PR-073)를 집계해 만든
// INVOICE/Packing List 초안(ExportShipment)을 조회/생성/상태전이/단가입력한다.
export const ExportShipmentManager: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoIds, setSelectedPoIds] = useState<number[]>([]);
  const [header, setHeader] = useState<GenerateExportShipment>(emptyHeader);
  const [generating, setGenerating] = useState(false);
  // PR-157: 환율(USD/KRW) 수동 입력 — unipass.customs.go.kr 크롤링은 robots.txt로
  // 막혀 있어(/csp/ 전체 차단) 구현하지 않았다. 문자열로 따로 관리하는 이유는
  // GenerateExportShipment.exchangeRateUsdKrw가 number라 빈 입력을 그대로 두기 위함.
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  // PR-184: Invoice Date가 입력되고 환율 칸이 비어 있을 때 관세청 주간환율을 추천값으로
  // 미리 채운다. 사용자가 직접 고치면(터치) 더 이상 덮어쓰지 않는다.
  const [createRateType, setCreateRateType] = useState<ExchangeRateType>('EXPORT');
  const [createRateTouched, setCreateRateTouched] = useState(false);
  const [createRateLookup, setCreateRateLookup] = useState<ExchangeRateLookupResult | null>(null);
  useEffect(() => {
    if (!header.invoiceDate) {
      setCreateRateLookup(null);
      return;
    }
    lookupCustomsExchangeRate({ rateType: createRateType, currency: 'USD', date: header.invoiceDate })
      .then((res) => {
        setCreateRateLookup(res);
        if (!createRateTouched && exchangeRateInput.trim() === '' && res.found) {
          setExchangeRateInput(String(res.rate));
        }
      })
      .catch(() => setCreateRateLookup(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.invoiceDate, createRateType]);
  const createRateBadge = buildInvoiceRateBadge(createRateLookup, createRateType, createRateTouched);

  const [shipments, setShipments] = useState<ExportShipment[]>([]);
  const [selected, setSelected] = useState<ExportShipment | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const canFinalize = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';

  // PR-102: 목록 검색 — 스타일번호/자재명/선적건번호, 모두 조합 가능.
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [searchMaterialName, setSearchMaterialName] = useState('');
  const [searchSheetNo, setSearchSheetNo] = useState('');

  // PR-080: 기 작성된 INVOICE/Packing List 엑셀을 그대로 가져오는 흐름 — "발주 선택 →
  // 생성" 흐름과 나란히 별도 섹션으로 둔다.
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // PR-086: qty는 여전히 실제 포장수량 기준으로 계산되지만(설계 변경 없음), 발주수량과
  // 다르면 조용히 넘어가지 않고 경고로 보여준다 — importWarnings와 동일한 표시 방식 재사용.
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);

  const loadPurchaseOrders = useCallback(async () => {
    try {
      const res = await getPurchaseOrders();
      setPurchaseOrders(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '발주 목록을 불러오는 데 실패했습니다.'));
    }
  }, []);

  const loadShipments = useCallback(async (filter?: { styleNo?: string; materialName?: string; sheetNo?: string }) => {
    try {
      const res = await getExportShipments(filter);
      setShipments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수출선적서류 목록을 불러오는 데 실패했습니다.'));
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadShipments({
      styleNo: searchStyleNo || undefined,
      materialName: searchMaterialName || undefined,
      sheetNo: searchSheetNo || undefined,
    });
  };

  const handleSearchReset = () => {
    setSearchStyleNo('');
    setSearchMaterialName('');
    setSearchSheetNo('');
    loadShipments();
  };

  // PR-079: 기본값이 설정되어 있으면 생성 폼을 미리 채워둔다 — 미설정(null)이면 빈
  // 폼 그대로 둔다(에러 아님). 건별로 필요하면 그대로 덮어써서 수정할 수 있다.
  const applyDefaultsToHeader = useCallback(async () => {
    try {
      const defaults = await getExportShipmentDefaults();
      if (!defaults) return;
      setHeader((prev) => ({
        ...prev,
        shipperInfo: defaults.shipperInfo ?? prev.shipperInfo,
        consigneeInfo: defaults.consigneeInfo ?? prev.consigneeInfo,
        portOfLoading: defaults.portOfLoading ?? prev.portOfLoading,
        finalDestination: defaults.finalDestination ?? prev.finalDestination,
        carrier: defaults.carrier ?? prev.carrier,
      }));
    } catch {
      // 기본값을 못 불러와도 생성 폼 자체는 빈 채로 계속 쓸 수 있어야 하므로 무시한다.
    }
  }, []);

  useEffect(() => {
    loadPurchaseOrders();
    loadShipments();
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    applyDefaultsToHeader();
  }, [loadPurchaseOrders, loadShipments, applyDefaultsToHeader]);

  const togglePo = (id: number) => {
    setSelectedPoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    if (selectedPoIds.length === 0) {
      toast.error('발주를 최소 1개 이상 선택해 주세요.');
      return;
    }
    setGenerating(true);
    setGenerateWarnings([]);
    try {
      // 빈 문자열로 둔 선택 필드(예: 미입력 Sailing Date/Invoice Date)를 그대로 보내면
      // @IsDateString 등 백엔드 검증에서 400이 난다 — 빈 값은 아예 제외하고 보낸다.
      const payload = Object.fromEntries(
        Object.entries(header).filter(([, v]) => v !== ''),
      ) as GenerateExportShipment;
      if (exchangeRateInput.trim() !== '') payload.exchangeRateUsdKrw = Number(exchangeRateInput);
      const res = await generateExportShipment(selectedPoIds, payload);
      const warnings: string[] = res.warnings ?? [];
      setGenerateWarnings(warnings);
      toast.success(
        warnings.length > 0
          ? `수출선적서류 초안이 생성되었습니다 (경고 ${warnings.length}건 — 아래 목록을 확인해 주세요)`
          : '수출선적서류 초안이 생성되었습니다.',
      );
      setSelectedPoIds([]);
      setHeader(emptyHeader);
      setExchangeRateInput('');
      setCreateRateTouched(false);
      setCreateRateLookup(null);
      applyDefaultsToHeader();
      await loadShipments();
      setSelected(res);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수출선적서류 생성에 실패했습니다.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('업로드할 엑셀 파일을 선택해 주세요.');
      return;
    }
    setImporting(true);
    setImportWarnings([]);
    try {
      const res = await importExportShipmentFromFile(importFile);
      const warnings: string[] = res.warnings ?? [];
      setImportWarnings(warnings);
      toast.success(
        warnings.length > 0
          ? `가져오기 완료 (경고 ${warnings.length}건 — 아래 목록을 확인해 주세요)`
          : '수출선적서류를 파일 그대로 가져왔습니다.',
      );
      setImportFile(null);
      await loadShipments();
      setSelected(res);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '엑셀 가져오기에 실패했습니다. 지원하지 않는 양식일 수 있습니다.'));
    } finally {
      setImporting(false);
    }
  };

  const openDetail = async (id: number) => {
    setImportWarnings([]);
    try {
      const res = await getExportShipment(id);
      setSelected(res);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상세 조회에 실패했습니다.'));
    }
  };

  const handleStatusChange = async (status: 'REVIEWED' | 'FINALIZED') => {
    if (!selected) return;
    if (status === 'FINALIZED' && !window.confirm('FINALIZED로 확정하면 이후 라인을 수정할 수 없습니다. 계속할까요?')) return;
    try {
      const res = await updateExportShipmentStatus(selected.id, status);
      toast.success(`상태가 ${STATUS_LABELS[status]}(으)로 변경되었습니다.`);
      setSelected(res);
      loadShipments();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상태 변경에 실패했습니다.'));
    }
  };

  const handleUnitPriceChange = async (lineId: number, value: string) => {
    if (!selected) return;
    const unitPrice = value === '' ? null : Number(value);
    try {
      await updateExportShipmentLine(selected.id, lineId, unitPrice);
      const refreshed = await getExportShipment(selected.id);
      setSelected(refreshed);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '단가 수정에 실패했습니다.'));
    }
  };

  // PR-157: 문서 상세에서도 환율을 나중에 입력/수정할 수 있다 — PurchaseOrder 기준
  // 자동계산 라인만 새 환율로 재계산되고, 이미 확정(MANUAL/MIDO_PRICE_TABLE)한 라인은 유지된다.
  const [detailExchangeRateInput, setDetailExchangeRateInput] = useState('');
  const [detailRateType, setDetailRateType] = useState<ExchangeRateType>('EXPORT');
  const [detailRateTouched, setDetailRateTouched] = useState(false);
  const [detailRateLookup, setDetailRateLookup] = useState<ExchangeRateLookupResult | null>(null);
  // 문서를 바꿔서 열면(selected.id 변경) 입력칸/추천 상태를 새로 시작한다.
  useEffect(() => {
    setDetailExchangeRateInput('');
    setDetailRateTouched(false);
    setDetailRateLookup(null);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected?.invoiceDate) {
      setDetailRateLookup(null);
      return;
    }
    lookupCustomsExchangeRate({ rateType: detailRateType, currency: 'USD', date: selected.invoiceDate.slice(0, 10) })
      .then((res) => {
        setDetailRateLookup(res);
        if (!detailRateTouched && detailExchangeRateInput.trim() === '' && res.found) {
          setDetailExchangeRateInput(String(res.rate));
        }
      })
      .catch(() => setDetailRateLookup(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.invoiceDate, detailRateType]);
  const detailRateBadge = buildInvoiceRateBadge(detailRateLookup, detailRateType, detailRateTouched);
  const handleUpdateExchangeRate = async () => {
    if (!selected || detailExchangeRateInput.trim() === '') return;
    try {
      const res = await updateExportShipmentExchangeRate(selected.id, Number(detailExchangeRateInput));
      toast.success('환율이 저장되었습니다.');
      setSelected(res);
      setDetailExchangeRateInput('');
      setDetailRateTouched(false);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '환율 저장에 실패했습니다.'));
    }
  };

  // PurchaseOrder 단가가 없는 라인의 USD 단가를 사람이 확정한다. 미도 단가표 후보는
  // 참고용으로 보여주기만 하고(범위값/실 콘가격은 담당자가 직접 계산해 최종 숫자를
  // 입력), 서버는 그 숫자를 그대로 저장한다 — 자동으로 하나를 고르지 않는다.
  const [priceEditingLineId, setPriceEditingLineId] = useState<number | null>(null);
  const [priceCandidates, setPriceCandidates] = useState<MidoPriceItem[]>([]);
  const [manualUsdInput, setManualUsdInput] = useState('');
  // 버그 수정: 예전엔 후보가 하나라도 있으면 사용자가 실제로 어떤 값을 썼든 무조건
  // priceCandidates[0]을 "미도단가표 출처"로 저장했다 — 감사 추적(어떤 근거로 이
  // 단가를 썼는지)이 실제와 다르게 남는 문제였다. 이제 후보의 "이 값 사용" 버튼을
  // 눌렀을 때만 그 후보 id를 출처로 기록하고, 입력값을 직접 고치면 선택이 풀려서
  // MANUAL로 저장된다 — 실제로 쓴 값과 출처가 항상 일치한다.
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  // PR-182: 미터단가 → 콘/롤단가 환산이 적용된 경우의 근거 식(검산용) — 환산 옵션을
  // 고르면 채워지고, 원시 후보를 쓰거나 직접 입력하면 비운다(실제로 쓴 값과 근거가 항상 일치).
  const [priceBasisNoteInput, setPriceBasisNoteInput] = useState<string | null>(null);
  // PR-185 D: 라인의 발주(PurchaseOrder)에 단가표 참고단가가 있으면(KRW로 계산 안 된 라인만)
  // 기존 미도 후보 맨 위에 추가로 보여준다 — 자동 확정은 안 하고 사람이 "이 값 사용"을 눌러야 한다.
  const [poReferencePrice, setPoReferencePrice] = useState<ExportShipmentLine['purchaseOrderReferencePrice']>(null);
  const openPriceEditor = async (line: ExportShipmentLine) => {
    setPriceEditingLineId(line.id);
    setManualUsdInput('');
    setSelectedCandidateId(null);
    setPriceBasisNoteInput(null);
    setPoReferencePrice(line.purchaseOrderReferencePrice ?? null);
    try {
      setPriceCandidates(await findMidoPriceCandidates(line.description, { lineUnit: line.unit, materialSubType: line.materialSubType }));
    } catch {
      setPriceCandidates([]);
    }
  };
  const usePoReferenceValue = () => {
    if (!poReferencePrice) return;
    setManualUsdInput(String(poReferencePrice.unitPriceUsd));
    setSelectedCandidateId(null); // 미도 후보 id가 아니므로 확정 시 MANUAL로 저장된다.
    setPriceBasisNoteInput(`발주서 참고단가 $${poReferencePrice.unitPriceUsd}(${poReferencePrice.source ?? '출처 미기록'}${poReferencePrice.note ? `, ${poReferencePrice.note}` : ''})`);
  };

  const useCandidateValue = (c: MidoPriceItem) => {
    const sel = selectRawCandidate(c.priceUsdMin, c.id);
    setManualUsdInput(sel.unitPriceUsdInput);
    setSelectedCandidateId(sel.candidateId);
    setPriceBasisNoteInput(sel.priceBasisNote);
  };

  // PR-182: 콘/롤단가 환산 옵션(실/테이프 종류별)을 골랐을 때 — 환산값과 검산용 근거
  // 식을 함께 채운다. 서버는 이 숫자를 재계산하지 않고 그대로 저장한다(안전모드).
  const useConvertedOption = (c: MidoPriceItem, opt: MeterPriceConversionOption) => {
    const sel = selectConvertedOption(c.id, opt);
    setManualUsdInput(sel.unitPriceUsdInput);
    setSelectedCandidateId(sel.candidateId);
    setPriceBasisNoteInput(sel.priceBasisNote);
  };

  const handleManualUsdInputChange = (value: string) => {
    const sel = clearSelection(value);
    setManualUsdInput(sel.unitPriceUsdInput);
    setSelectedCandidateId(sel.candidateId);
    setPriceBasisNoteInput(sel.priceBasisNote);
  };

  const handleConfirmLinePrice = async () => {
    if (!selected || priceEditingLineId == null || manualUsdInput.trim() === '') {
      toast.error('USD 단가를 입력해 주세요.');
      return;
    }
    const source = resolveSource(selectedCandidateId);
    try {
      const res = await confirmExportShipmentLinePrice(selected.id, priceEditingLineId, {
        source,
        unitPriceUsd: Number(manualUsdInput),
        midoPriceItemId: selectedCandidateId ?? undefined,
        priceBasisNote: priceBasisNoteInput ?? undefined,
      });
      toast.success('USD 단가가 확정되었습니다.');
      setSelected(res.exportShipmentId ? await getExportShipment(res.exportShipmentId) : selected);
      setPriceEditingLineId(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'USD 단가 확정에 실패했습니다.'));
    }
  };

  // 미도 단가표(USD) 후보를 현재 환율로 원화 환산해 보여준다 — 환율을 거꾸로 적용해
  // 담당자가 "이 USD 범위가 원화로 얼마인지" 바로 판단할 수 있게 한다.
  const krwEquivalent = (usd: number): string | null => {
    const rate = selected?.exchangeRateUsdKrw;
    if (!rate || rate <= 0) return null;
    return Math.round(usd * rate).toLocaleString('ko-KR');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">수출선적서류 (INVOICE / Packing List)</h2>

      <div className="bg-gray-50 p-4 rounded-lg space-y-3">
        <h3 className="font-semibold text-gray-700">발주 선택 → 생성</h3>
        <div className="max-h-40 overflow-y-auto border rounded bg-white">
          {purchaseOrders.map((po) => (
            <label key={po.id} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selectedPoIds.includes(po.id)} onChange={() => togglePo(po.id)} />
              발주 #{po.id} — {po.item?.name ?? `품목#${po.itemId}`} ({po.supplier?.name ?? '-'}, 수량 {po.quantity})
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <textarea className="border p-2 rounded text-sm" rows={2} placeholder="Shipper / Exporter" value={header.shipperInfo} onChange={(e) => setHeader({ ...header, shipperInfo: e.target.value })} />
          <textarea className="border p-2 rounded text-sm" rows={2} placeholder="Consignee" value={header.consigneeInfo} onChange={(e) => setHeader({ ...header, consigneeInfo: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-2 rounded text-sm" placeholder="Sheet No. (예: TY-260704K)" value={header.sheetNo} onChange={(e) => setHeader({ ...header, sheetNo: e.target.value })} />
          <input className="border p-2 rounded text-sm" placeholder="Port of Loading" value={header.portOfLoading} onChange={(e) => setHeader({ ...header, portOfLoading: e.target.value })} />
          <input className="border p-2 rounded text-sm" placeholder="Final Destination" value={header.finalDestination} onChange={(e) => setHeader({ ...header, finalDestination: e.target.value })} />
          <input className="border p-2 rounded text-sm" placeholder="Carrier" value={header.carrier} onChange={(e) => setHeader({ ...header, carrier: e.target.value })} />
          <input type="date" className="border p-2 rounded text-sm" placeholder="Sailing Date" value={header.sailingDate} onChange={(e) => setHeader({ ...header, sailingDate: e.target.value })} />
          <input type="date" className="border p-2 rounded text-sm" placeholder="Invoice Date" value={header.invoiceDate} onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })} />
          <select
            className="border p-2 rounded text-sm"
            aria-label="추천받을 환율 구분"
            value={createRateType}
            onChange={(e) => { setCreateRateType(e.target.value as ExchangeRateType); setCreateRateTouched(false); }}
          >
            <option value="EXPORT">수출(기본)</option>
            <option value="IMPORT">수입</option>
          </select>
          <input
            type="number"
            step="0.01"
            className="border p-2 rounded text-sm"
            placeholder="환율(USD/KRW, 수동 입력)"
            aria-label="환율(USD/KRW)"
            value={exchangeRateInput}
            onChange={(e) => { setExchangeRateInput(e.target.value); setCreateRateTouched(true); }}
          />
        </div>
        {createRateBadge.kind === 'suggested' && (
          <div className="text-xs text-blue-700 bg-blue-50 rounded p-2">
            관세청 주간환율({createRateBadge.rateType === 'EXPORT' ? '수출' : '수입'}) {createRateBadge.validFrom}~{createRateBadge.validTo} 적용 — 확인 필요
          </div>
        )}
        {createRateBadge.kind === 'manual' && (
          <div className="text-xs text-gray-500">수동 수정</div>
        )}
        {createRateBadge.kind === 'not_found' && (
          <div className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
            이 INVOICE 작성일이 속한 주의 {createRateType === 'EXPORT' ? '수출' : '수입'} 환율이 등록되지 않았습니다 — 주간 환율 화면에서 등록하세요.
            {createRateBadge.previous && <span className="block text-gray-400 mt-0.5">직전 등록 주: {createRateBadge.previous} (참고)</span>}
          </div>
        )}
        <button onClick={handleGenerate} disabled={generating} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {generating ? '생성 중...' : '수출선적서류 생성'}
        </button>
        {generateWarnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded p-2 space-y-1">
            <div className="font-medium">생성 경고 {generateWarnings.length}건 — 조용히 무시하지 않고 그대로 알려드립니다:</div>
            <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {generateWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-4 rounded-lg space-y-3">
        <h3 className="font-semibold text-gray-700">기존 파일 업로드 (INVOICE/Packing List 엑셀을 그대로 가져오기)</h3>
        <p className="text-xs text-gray-500">
          이미 완성되어 있는 INVOICE/Packing List 엑셀(요약 시트 2개 포함)을 업로드하면 발주/BOM 없이 재계산 없이 그대로 DRAFT로 등록합니다.
        </p>
        <div className="flex items-center gap-2">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} className="border p-2 rounded text-sm" />
          <button onClick={handleImport} disabled={importing} className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50">
            {importing ? '가져오는 중...' : '파일 업로드'}
          </button>
        </div>
        {importWarnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded p-2 space-y-1">
            <div className="font-medium">가져오기 경고 {importWarnings.length}건 — 조용히 무시하지 않고 그대로 알려드립니다:</div>
            <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {importWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* PR-102: 스타일번호/자재명/선적건번호 검색 — 모두 조합 가능. */}
      <form onSubmit={handleSearchSubmit} className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="스타일번호 검색"
          value={searchStyleNo}
          onChange={(e) => setSearchStyleNo(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="자재명 검색"
          value={searchMaterialName}
          onChange={(e) => setSearchMaterialName(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="선적건번호(Sheet No.) 검색"
          value={searchSheetNo}
          onChange={(e) => setSearchSheetNo(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleSearchReset} className="bg-gray-200 text-gray-700 px-4 py-2 rounded font-medium hover:bg-gray-300">초기화</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table>
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Sheet No.</th>
              <th className="px-4 py-2 text-left">스타일</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">출처</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shipments.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">#{s.id}</td>
                <td className="px-4 py-2">{s.sheetNo ?? '-'}</td>
                <td className="px-4 py-2">{(s.styleNos ?? []).join(', ')}</td>
                <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[s.status]}`}>{STATUS_LABELS[s.status]}</span></td>
                <td className="px-4 py-2 text-xs text-gray-500">{s.source === 'IMPORTED' ? '가져옴' : '생성됨'}</td>
                <td className="px-4 py-2">
                  <button className="text-blue-600" onClick={() => openDetail(s.id)}>상세보기</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded w-4/5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xl font-bold">#{selected.id} {selected.sheetNo ?? ''}</h3>
              <span className={`px-2 py-1 rounded text-sm font-medium ${STATUS_CLASSES[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
            </div>
            <div className="text-xs text-gray-500 mb-4">
              Invoice Date: {selected.invoiceDate ? selected.invoiceDate.slice(0, 10) : '-'} · Sailing Date: {selected.sailingDate ? selected.sailingDate.slice(0, 10) : '-'}
            </div>

            <div className="flex flex-col gap-1 mb-4 bg-gray-50 p-2 rounded text-sm">
              <div className="flex items-end gap-2">
                <div>
                  환율(USD/KRW): <b>{selected.exchangeRateUsdKrw ?? '미입력'}</b>
                  {selected.exchangeRateDate && <span className="text-gray-400"> ({selected.exchangeRateDate.slice(0, 10)} 기준)</span>}
                  <span className="text-gray-400 text-xs ml-1">({sourceLabel(selected.exchangeRateSource)})</span>
                </div>
                {selected.status !== 'FINALIZED' && (
                  <>
                    <select
                      className="border p-1 rounded text-xs"
                      aria-label="상세 추천 환율 구분"
                      value={detailRateType}
                      onChange={(e) => { setDetailRateType(e.target.value as ExchangeRateType); setDetailRateTouched(false); }}
                    >
                      <option value="EXPORT">수출(기본)</option>
                      <option value="IMPORT">수입</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="환율 수정"
                      className="border p-1 rounded w-28"
                      placeholder="새 환율"
                      value={detailExchangeRateInput}
                      onChange={(e) => { setDetailExchangeRateInput(e.target.value); setDetailRateTouched(true); }}
                    />
                    <button onClick={handleUpdateExchangeRate} className="bg-gray-700 text-white px-2 py-1 rounded text-xs hover:bg-gray-800">환율 저장</button>
                  </>
                )}
              </div>
              {detailRateBadge.kind === 'suggested' && (
                <div className="text-xs text-blue-700">
                  관세청 주간환율({detailRateBadge.rateType === 'EXPORT' ? '수출' : '수입'}) {detailRateBadge.validFrom}~{detailRateBadge.validTo} 적용 — 확인 필요
                </div>
              )}
              {detailRateBadge.kind === 'not_found' && (
                <div className="text-xs text-yellow-700">
                  이 INVOICE 작성일이 속한 주의 {detailRateType === 'EXPORT' ? '수출' : '수입'} 환율이 등록되지 않았습니다 — 주간 환율 화면에서 등록하세요.
                  {detailRateBadge.previous && <span className="text-gray-400 ml-1">직전 등록 주: {detailRateBadge.previous} (참고)</span>}
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              {selected.status === 'DRAFT' && (
                <button onClick={() => handleStatusChange('REVIEWED')} className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">검토완료로 전환</button>
              )}
              {selected.status === 'REVIEWED' && canFinalize && (
                <button onClick={() => handleStatusChange('FINALIZED')} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">FINALIZED로 확정</button>
              )}
              {selected.status === 'REVIEWED' && !canFinalize && (
                <span className="text-xs text-gray-500 self-center">FINALIZED 확정은 관리자만 가능합니다.</span>
              )}
            </div>

            <table className="text-sm mb-4">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-2">스타일</th>
                  <th className="p-2">색상</th>
                  <th className="p-2">DESCRIPTION</th>
                  <th className="p-2">HS코드</th>
                  <th className="p-2 text-right">수량</th>
                  <th className="p-2">단위</th>
                  <th className="p-2 text-right">단가</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-right">USD 단가</th>
                  <th className="p-2 text-right">USD 금액</th>
                  <th className="p-2 text-right">N.W(KG)</th>
                  <th className="p-2 text-right">G.W(KG)</th>
                  <th className="p-2 text-right">CBM</th>
                  <th className="p-2">포장</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selected.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-2">{l.styleNo}</td>
                    <td className="p-2">{l.color ?? '-'}</td>
                    <td className="p-2">{l.description}</td>
                    <td className="p-2">{l.hsCode ?? '-'}</td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2">{l.unit}</td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="any"
                        className="border rounded px-2 py-1 w-24 text-right disabled:bg-gray-100"
                        defaultValue={l.unitPrice ?? ''}
                        disabled={selected.status === 'FINALIZED'}
                        onBlur={(e) => handleUnitPriceChange(l.id, e.target.value)}
                        placeholder="미정"
                      />
                    </td>
                    <td className="p-2 text-right">{l.amount != null ? Number(l.amount).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">
                      {l.unitPriceUsd != null ? (
                        <span>
                          {Number(l.unitPriceUsd).toFixed(4)}
                          <span className="block text-xs text-gray-400">{l.priceSource === 'PURCHASE_ORDER' ? '발주단가+환율' : l.priceSource === 'MIDO_PRICE_TABLE' ? '미도단가표' : '수동입력'}</span>
                        </span>
                      ) : selected.status !== 'FINALIZED' ? (
                        <button onClick={() => openPriceEditor(l)} className="text-blue-600 text-xs underline" data-testid={`confirm-usd-price-${l.id}`}>
                          USD단가 확정
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 text-right">{l.amountUsd != null ? Number(l.amountUsd).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{l.netWeight != null ? Number(l.netWeight).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{l.grossWeight != null ? Number(l.grossWeight).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{l.cbm != null ? Number(l.cbm).toFixed(2) : '-'}</td>
                    <td className="p-2">{l.packageCount ?? '-'} {l.packageType ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={() => setSelected(null)} className="bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}

      {priceEditingLineId != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" role="dialog" aria-label="USD 단가 확정">
          <div className="bg-white p-5 rounded w-full max-w-lg">
            <h4 className="font-semibold mb-2">USD 단가 확정</h4>
            <p className="text-xs text-gray-500 mb-3">
              아래는 미도 단가표에서 찾은 참고 후보입니다(범위값/실(THREAD)은 콘길이를 곱해 직접 계산해 주세요 —
              코아사 2500M, 오바사·스쿠이사 4000M, 폴리지누이도 500M 콘 기준). 서버는 자동으로 하나를 고르지 않으니
              최종 숫자를 아래 입력란에 직접 넣어 확정해 주세요.
            </p>
            {poReferencePrice && (
              <div className="border border-indigo-200 bg-indigo-50 rounded px-2 py-1 mb-2 flex items-center justify-between text-sm" data-testid="po-reference-price-candidate">
                <span>발주서 참고단가 ${poReferencePrice.unitPriceUsd} ({poReferencePrice.source ?? '출처 미기록'}{poReferencePrice.note ? `, ${poReferencePrice.note}` : ''})</span>
                <button type="button" onClick={usePoReferenceValue} className="text-xs border rounded px-2 py-0.5 ml-2 shrink-0 text-indigo-700 border-indigo-300 hover:bg-indigo-100">이 값 사용</button>
              </div>
            )}
            {priceCandidates.length > 0 ? (
              <ul className="text-sm mb-3 space-y-1 max-h-56 overflow-y-auto">
                {priceCandidates.map((c) => {
                  const minKrw = krwEquivalent(c.priceUsdMin);
                  const maxKrw = c.priceUsdMax !== c.priceUsdMin ? krwEquivalent(c.priceUsdMax) : null;
                  return (
                    <li key={c.id} className="border rounded px-2 py-1" data-testid={`price-candidate-${c.id}`}>
                      <div className="flex items-center justify-between">
                        <span>
                          {c.itemName} — ${c.priceUsdMin}{c.priceUsdMax !== c.priceUsdMin ? `~$${c.priceUsdMax}` : ''} / {c.unit}{c.note ? ` (${c.note})` : ''}
                          {minKrw && <span className="text-gray-400"> (약 {minKrw}{maxKrw ? `~${maxKrw}` : ''}원)</span>}
                        </span>
                        {/* PR-182: 콘/롤 환산이 적용되는 후보는 "이 값 사용"이 미터단가를 그대로 쓰는
                            버튼이라 오해를 사지 않도록 숨기고, 아래 환산 옵션에서만 고르게 한다. */}
                        {!c.conversion && (
                          <button
                            type="button"
                            onClick={() => useCandidateValue(c)}
                            className={`text-xs border rounded px-2 py-0.5 ml-2 shrink-0 ${selectedCandidateId === c.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'text-blue-600 border-blue-300 hover:bg-blue-50'}`}
                          >이 값 사용</button>
                        )}
                      </div>
                      {/* PR-182: 미터단가 → 콘/롤단가 환산 후보 — 담당자가 검산할 수 있도록 미터단가/단위길이/식을 함께 보여준다. */}
                      {c.conversion && (
                        <div className="mt-1 pl-2 border-l-2 border-amber-200 space-y-1">
                          {c.conversion.options.map((opt) => {
                            const picked = selectedCandidateId === c.id && manualUsdInput === String(opt.unitPriceUsd);
                            return (
                              <div key={opt.materialSubType} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">
                                  {opt.displayName}({opt.packagingUnitLabel}, {opt.unitLengthM}m): {opt.formula}
                                  {opt.unitPriceUsdMax != null && <span className="text-gray-400"> ~ {opt.formulaMax}</span>}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => useConvertedOption(c, opt)}
                                  className={`border rounded px-2 py-0.5 ml-2 shrink-0 ${picked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'text-blue-600 border-blue-300 hover:bg-blue-50'}`}
                                >이 값 사용(환산)</button>
                              </div>
                            );
                          })}
                          {c.conversion.warning && (
                            <p className="text-xs text-amber-700" data-testid={`conversion-warning-${c.id}`}>⚠ {c.conversion.warning}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 mb-3">일치하는 단가표 후보가 없습니다 — 직접 입력해 주세요.</p>
            )}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                step="any"
                aria-label="확정 USD 단가"
                className="border p-2 rounded flex-1"
                placeholder="확정할 USD 단가"
                value={manualUsdInput}
                onChange={(e) => handleManualUsdInputChange(e.target.value)}
              />
            </div>
            {priceBasisNoteInput && (
              <p className="text-xs text-gray-500 mb-2" data-testid="price-basis-note">근거: {priceBasisNoteInput}</p>
            )}
            <p className="text-xs text-gray-400 mb-3">
              출처: {selectedCandidateId != null ? '미도단가표(후보 선택됨)' : '직접입력'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPriceEditingLineId(null)} className="px-3 py-2 rounded border">취소</button>
              <button
                onClick={handleConfirmLinePrice}
                className="bg-blue-600 text-white px-3 py-2 rounded"
              >
                확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
