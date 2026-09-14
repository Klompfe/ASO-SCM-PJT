import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getExportShipments,
  getExportShipment,
  generateExportShipment,
  updateExportShipmentStatus,
  updateExportShipmentLine,
  importExportShipmentFromFile,
  type ExportShipment,
  type GenerateExportShipment,
} from '../api/exportShipments.service';
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
import { getExportShipmentDefaults } from '../api/exportShipmentDefaults.service';
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

  const [shipments, setShipments] = useState<ExportShipment[]>([]);
  const [selected, setSelected] = useState<ExportShipment | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const canFinalize = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';

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

  const loadShipments = useCallback(async () => {
    try {
      const res = await getExportShipments();
      setShipments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수출선적서류 목록을 불러오는 데 실패했습니다.'));
    }
  }, []);

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
      const res = await generateExportShipment(selectedPoIds, header);
      const warnings: string[] = res.warnings ?? [];
      setGenerateWarnings(warnings);
      toast.success(
        warnings.length > 0
          ? `수출선적서류 초안이 생성되었습니다 (경고 ${warnings.length}건 — 아래 목록을 확인해 주세요)`
          : '수출선적서류 초안이 생성되었습니다.',
      );
      setSelectedPoIds([]);
      setHeader(emptyHeader);
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
        </div>
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">#{selected.id} {selected.sheetNo ?? ''}</h3>
              <span className={`px-2 py-1 rounded text-sm font-medium ${STATUS_CLASSES[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
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

            <table className="w-full text-sm mb-4">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-2">스타일</th>
                  <th className="p-2">DESCRIPTION</th>
                  <th className="p-2">HS코드</th>
                  <th className="p-2 text-right">수량</th>
                  <th className="p-2">단위</th>
                  <th className="p-2 text-right">단가</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-right">N.W(KG)</th>
                  <th className="p-2 text-right">G.W(KG)</th>
                  <th className="p-2">포장</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selected.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-2">{l.styleNo}</td>
                    <td className="p-2">{l.description}</td>
                    <td className="p-2">{l.hsCode ?? '-'}</td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2">{l.unit}</td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-24 text-right disabled:bg-gray-100"
                        defaultValue={l.unitPrice ?? ''}
                        disabled={selected.status === 'FINALIZED'}
                        onBlur={(e) => handleUnitPriceChange(l.id, e.target.value)}
                        placeholder="미정"
                      />
                    </td>
                    <td className="p-2 text-right">{l.amount != null ? Number(l.amount).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{l.netWeight != null ? Number(l.netWeight).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{l.grossWeight != null ? Number(l.grossWeight).toFixed(2) : '-'}</td>
                    <td className="p-2">{l.packageCount ?? '-'} {l.packageType ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={() => setSelected(null)} className="bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};
