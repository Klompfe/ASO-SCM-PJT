import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getExportShipments,
  getExportShipment,
  generateExportShipment,
  updateExportShipmentStatus,
  updateExportShipmentLine,
  type ExportShipment,
  type GenerateExportShipment,
} from '../api/exportShipments.service';
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchaseOrders.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
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

  useEffect(() => {
    loadPurchaseOrders();
    loadShipments();
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, [loadPurchaseOrders, loadShipments]);

  const togglePo = (id: number) => {
    setSelectedPoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    if (selectedPoIds.length === 0) {
      toast.error('발주를 최소 1개 이상 선택해 주세요.');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateExportShipment(selectedPoIds, header);
      toast.success('수출선적서류 초안이 생성되었습니다.');
      setSelectedPoIds([]);
      setHeader(emptyHeader);
      await loadShipments();
      setSelected(res);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수출선적서류 생성에 실패했습니다.'));
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = async (id: number) => {
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
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Sheet No.</th>
              <th className="px-4 py-2 text-left">스타일</th>
              <th className="px-4 py-2 text-left">상태</th>
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
