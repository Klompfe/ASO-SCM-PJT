import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getMasterStyles, createMasterStyle, type MasterStyle, type CreateMasterStyle } from '../api/styles.service';
import {
  issueContract, getContractsByStyleNo, approveContract, rejectContract, deleteContract,
  type Contract, type ContractStatus,
} from '../api/contracts.service';
import {
  upsertProcessStage, getProcessStagesByStyle, getMaterialReadiness,
  createOrderShipment, updateOrderShipment, getOrderShipmentsByStyle, getShipmentSummary,
  type ProcessStageName, type OrderProcessStage, type MaterialReadiness, type OrderShipment, type ShippedQtySummary,
} from '../api/orderProgress.service';
import { getCurrentUser, type CurrentUser } from '../api/auth.service';
import { getErrorMessage } from '../utils/errorMessage';

// PR-066: 상태별 배지 색상 — 승인대기(노랑)/승인(초록)/거절(빨강)/대체됨(회색).
const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  PENDING_APPROVAL: '승인대기', APPROVED: '승인됨', REJECTED: '거절됨', SUPERSEDED: '대체됨',
};
const CONTRACT_STATUS_CLASSES: Record<ContractStatus, string> = {
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  SUPERSEDED: 'bg-gray-100 text-gray-600',
};

const initialFormData: CreateMasterStyle = {
  styleNo: '', factory: '', buyer: '', totalQty: 0, brand: '', itemType: '',
  productionType: 'FOB', targetRdd: '', cmtPrice: 0, fobPrice: 0,
};

// 재단/봉제/포장 3단계 — PR-063 설계: 자재입고는 PO/재고에서 자동 파생, 검사(QC)는 추후.
const PROCESS_STAGES: ProcessStageName[] = ['CUTTING', 'SEWING', 'PACKING'];
const STAGE_LABELS: Record<ProcessStageName, string> = { CUTTING: '재단', SEWING: '봉제', PACKING: '포장' };

interface StageFormValue {
  startDate: string;
  finishDate: string;
  targetQty: string;
  completedQty: string;
  lineOrTeam: string;
}
const emptyStageForm: StageFormValue = { startDate: '', finishDate: '', targetQty: '', completedQty: '', lineOrTeam: '' };

const toDateInputValue = (v: string | null | undefined): string => (v ? v.slice(0, 10) : '');

// 발주량 대비 누적출고량으로 납기상태를 판정한다 — 잔량<=0이면 정상납품, 남았는데
// 납기가 지났으면 납기지연, 그 외엔 진행중. 목록 화면과 상세 모달이 동일 로직을 쓴다.
// 발주량이 0/미입력이면(데이터 이상) "잔량 0 이하 = 정상납품"이 성립해버려 오해를 부르므로
// 별도로 "-"(판단 불가)를 반환한다.
const computeDeliveryStatus = (orderQty: number, shippedQty: number, targetRdd: string | null | undefined) => {
  const remainingQty = orderQty - shippedQty;
  if (orderQty <= 0) {
    return { label: '-', colorClass: 'text-gray-400', remainingQty };
  }
  const isPastDue = targetRdd ? new Date(targetRdd).getTime() < Date.now() : false;
  const label = remainingQty <= 0 ? '정상납품' : isPastDue ? '납기지연' : '진행중';
  const colorClass = label === '납기지연' ? 'text-red-600' : label === '정상납품' ? 'text-green-600' : 'text-gray-600';
  return { label, colorClass, remainingQty };
};

export const StylesManager: React.FC = () => {
  const [formData, setFormData] = useState<CreateMasterStyle>(initialFormData);
  const [styles, setStyles] = useState<MasterStyle[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<MasterStyle | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractNotes, setContractNotes] = useState('');

  const [processStages, setProcessStages] = useState<OrderProcessStage[]>([]);
  const [materialReadiness, setMaterialReadiness] = useState<MaterialReadiness | null>(null);
  const [stageForms, setStageForms] = useState<Record<ProcessStageName, StageFormValue>>({
    CUTTING: emptyStageForm, SEWING: emptyStageForm, PACKING: emptyStageForm,
  });
  const [savingStage, setSavingStage] = useState<ProcessStageName | null>(null);

  const [shipments, setShipments] = useState<OrderShipment[]>([]);
  const [shipmentForm, setShipmentForm] = useState({ plannedShipDate: '', quantity: '', remark: '' });
  const [creatingShipment, setCreatingShipment] = useState(false);

  const [shippedQtyByStyle, setShippedQtyByStyle] = useState<Record<string, number>>({});

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const canApprove = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';
  const [contractActionId, setContractActionId] = useState<number | null>(null);

  const loadStyles = useCallback(async () => {
    try {
      const res = await getMasterStyles();
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setStyles(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 목록을 불러오는 데 실패했습니다.'));
      setStyles([]);
    }
  }, []);

  const loadShipmentSummary = useCallback(async () => {
    try {
      const res = await getShipmentSummary();
      const rows: ShippedQtySummary[] = Array.isArray(res) ? res : [];
      setShippedQtyByStyle(Object.fromEntries(rows.map((r) => [r.styleNo, r.shippedQty])));
    } catch {
      setShippedQtyByStyle({});
    }
  }, []);

  useEffect(() => {
    loadStyles();
    loadShipmentSummary();
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, [loadStyles, loadShipmentSummary]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMasterStyle(formData);
      toast.success('스타일이 등록되었습니다.');
      loadStyles();
      setFormData(initialFormData);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 등록에 실패했습니다.'));
    }
  };

  const calculateDDay = (rdd: string | null | undefined): number | null => {
    if (!rdd) return null;
    const diff = new Date(rdd).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const loadContracts = async (styleNo: string) => {
    try {
      const res = await getContractsByStyleNo(styleNo);
      setContracts(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약 이력을 불러오는 데 실패했습니다.'));
      setContracts([]);
    }
  };

  const loadProcessStages = async (styleNo: string) => {
    try {
      const res = await getProcessStagesByStyle(styleNo);
      const stages: OrderProcessStage[] = Array.isArray(res) ? res : [];
      setProcessStages(stages);
      const forms: Record<ProcessStageName, StageFormValue> = { CUTTING: emptyStageForm, SEWING: emptyStageForm, PACKING: emptyStageForm };
      for (const s of stages) {
        forms[s.stage] = {
          startDate: toDateInputValue(s.startDate),
          finishDate: toDateInputValue(s.finishDate),
          targetQty: s.targetQty != null ? String(s.targetQty) : '',
          completedQty: String(s.completedQty ?? 0),
          lineOrTeam: s.lineOrTeam ?? '',
        };
      }
      setStageForms(forms);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '공정 진행현황을 불러오는 데 실패했습니다.'));
      setProcessStages([]);
    }
  };

  const loadMaterialReadiness = async (styleNo: string) => {
    try {
      const res = await getMaterialReadiness(styleNo);
      setMaterialReadiness(res ?? null);
    } catch {
      setMaterialReadiness(null);
    }
  };

  const loadShipments = async (styleNo: string) => {
    try {
      const res = await getOrderShipmentsByStyle(styleNo);
      setShipments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '출고 이력을 불러오는 데 실패했습니다.'));
      setShipments([]);
    }
  };

  const handleSelectStyle = (s: MasterStyle) => {
    setSelectedStyle(s);
    setContractNotes('');
    setShipmentForm({ plannedShipDate: '', quantity: '', remark: '' });
    loadContracts(s.styleNo);
    loadProcessStages(s.styleNo);
    loadMaterialReadiness(s.styleNo);
    loadShipments(s.styleNo);
  };

  const handleIssueContract = async () => {
    if (!selectedStyle) return;
    try {
      await issueContract(selectedStyle.styleNo, contractNotes || undefined);
      toast.success('계약서가 발행되었습니다.');
      setContractNotes('');
      loadContracts(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약서 발행에 실패했습니다.'));
    }
  };

  const handleApproveContract = async (contract: Contract) => {
    if (!selectedStyle) return;
    setContractActionId(contract.id);
    try {
      await approveContract(contract.id);
      toast.success('계약이 승인되었습니다.');
      loadContracts(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약 승인에 실패했습니다.'));
    } finally {
      setContractActionId(null);
    }
  };

  const handleRejectContract = async (contract: Contract) => {
    if (!selectedStyle) return;
    if (!window.confirm(`${contract.styleNo} 계약(#${contract.id})을 거절하시겠습니까?`)) return;
    setContractActionId(contract.id);
    try {
      await rejectContract(contract.id);
      toast.success('계약이 거절되었습니다.');
      loadContracts(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약 거절에 실패했습니다.'));
    } finally {
      setContractActionId(null);
    }
  };

  const handleDeleteContract = async (contract: Contract) => {
    if (!selectedStyle) return;
    if (!window.confirm(`${contract.styleNo} 계약(#${contract.id})을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setContractActionId(contract.id);
    try {
      await deleteContract(contract.id);
      toast.success('계약이 삭제되었습니다.');
      loadContracts(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약 삭제에 실패했습니다.'));
    } finally {
      setContractActionId(null);
    }
  };

  const handleSaveStage = async (stage: ProcessStageName) => {
    if (!selectedStyle) return;
    const form = stageForms[stage];
    setSavingStage(stage);
    try {
      await upsertProcessStage({
        styleNo: selectedStyle.styleNo,
        stage,
        startDate: form.startDate || undefined,
        finishDate: form.finishDate || undefined,
        targetQty: form.targetQty !== '' ? Number(form.targetQty) : undefined,
        completedQty: form.completedQty !== '' ? Number(form.completedQty) : undefined,
        lineOrTeam: form.lineOrTeam || undefined,
      });
      toast.success(`${STAGE_LABELS[stage]} 단계가 저장되었습니다.`);
      loadProcessStages(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '공정 단계 저장에 실패했습니다.'));
    } finally {
      setSavingStage(null);
    }
  };

  const handleCreateShipment = async () => {
    if (!selectedStyle) return;
    if (!shipmentForm.plannedShipDate || !shipmentForm.quantity) {
      toast.error('계획출고일과 수량은 필수입니다.');
      return;
    }
    setCreatingShipment(true);
    try {
      await createOrderShipment({
        styleNo: selectedStyle.styleNo,
        plannedShipDate: shipmentForm.plannedShipDate,
        quantity: Number(shipmentForm.quantity),
        remark: shipmentForm.remark || undefined,
      });
      toast.success('출고가 등록되었습니다.');
      setShipmentForm({ plannedShipDate: '', quantity: '', remark: '' });
      loadShipments(selectedStyle.styleNo);
      loadShipmentSummary();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '출고 등록에 실패했습니다.'));
    } finally {
      setCreatingShipment(false);
    }
  };

  const handleConfirmShipment = async (shipment: OrderShipment) => {
    const today = new Date().toISOString().slice(0, 10);
    const actualDate = window.prompt('실제 출고일 (YYYY-MM-DD)', today);
    if (!actualDate || !selectedStyle) return;
    try {
      await updateOrderShipment(shipment.id, { actualShipDate: actualDate });
      toast.success('출고가 확정되었습니다.');
      loadShipments(selectedStyle.styleNo);
      loadShipmentSummary();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '출고 확정에 실패했습니다.'));
    }
  };

  // 발주량(totalQty) - 누적출고량(실제출고일이 있는 건만) = 잔량. 음수(초과출고)도 그대로 허용.
  const shippedQty = shipments.filter((s) => s.actualShipDate).reduce((sum, s) => sum + Number(s.quantity), 0);
  const orderQty = Number(selectedStyle?.overview?.totalQty ?? 0);
  const { label: deliveryStatus, colorClass: deliveryStatusColor, remainingQty } =
    computeDeliveryStatus(orderQty, shippedQty, selectedStyle?.overview?.targetRdd);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">오더관리 (Order Management)</h2>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow mb-6">
        <div className="grid grid-cols-4 gap-4 mb-4">
          <input className="border p-2" placeholder="Style No" value={formData.styleNo} onChange={e => setFormData({...formData, styleNo: e.target.value})} required />
          <input className="border p-2" placeholder="Brand" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} required />
          <input className="border p-2" placeholder="Item Type" value={formData.itemType} onChange={e => setFormData({...formData, itemType: e.target.value})} required />
          <input className="border p-2" type="date" aria-label="Target RDD" value={formData.targetRdd} onChange={e => setFormData({...formData, targetRdd: e.target.value})} required />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <input className="border p-2" placeholder="Factory (공장)" value={formData.factory} onChange={e => setFormData({...formData, factory: e.target.value})} required />
          <input className="border p-2" placeholder="Buyer (바이어)" value={formData.buyer} onChange={e => setFormData({...formData, buyer: e.target.value})} required />
          <input className="border p-2" placeholder="Total Qty" type="number" value={formData.totalQty} onChange={e => setFormData({...formData, totalQty: Number(e.target.value)})} required />
        </div>
        <div className="mb-4">
          <label className="mr-4"><input type="radio" value="FOB" checked={formData.productionType === 'FOB'} onChange={() => setFormData({...formData, productionType: 'FOB'})} /> FOB</label>
          <label><input type="radio" value="CMT" checked={formData.productionType === 'CMT'} onChange={() => setFormData({...formData, productionType: 'CMT'})} /> CMT</label>
        </div>
        {formData.productionType === 'CMT' && <input className="border p-2 mb-4 w-full" placeholder="CMT Price" type="number" step="0.01" value={formData.cmtPrice} onChange={e => setFormData({...formData, cmtPrice: Number(e.target.value)})} />}
        {formData.productionType === 'FOB' && <input className="border p-2 mb-4 w-full" placeholder="FOB Price" type="number" step="0.01" value={formData.fobPrice} onChange={e => setFormData({...formData, fobPrice: Number(e.target.value)})} />}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">스타일 등록</button>
      </form>

      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th>Style</th><th>Brand</th><th>Type</th><th>Factory</th><th>Buyer</th><th>RDD</th><th>D-Day</th><th>상태</th><th>출고율</th><th>납기상태</th>
          </tr>
        </thead>
        <tbody>
          {styles.map(s => {
            const dday = calculateDDay(s.overview?.targetRdd);
            const orderQty = Number(s.overview?.totalQty ?? 0);
            const shippedQty = shippedQtyByStyle[s.styleNo] ?? 0;
            const shipRate = orderQty > 0 ? Math.min(100, Math.round((shippedQty / orderQty) * 100)) : null;
            const { label: deliveryStatus, colorClass } = computeDeliveryStatus(orderQty, shippedQty, s.overview?.targetRdd);
            return (
              <tr key={s.styleNo} onClick={() => handleSelectStyle(s)} className="cursor-pointer hover:bg-gray-50">
                <td>{s.styleNo}</td>
                <td>{s.overview?.brand ?? '-'}</td>
                <td>{s.overview?.productionType ?? '-'}</td>
                <td>{s.overview?.factory ?? '-'}</td>
                <td>{s.overview?.buyer ?? '-'}</td>
                <td>{s.overview?.targetRdd ?? '-'}</td>
                <td className={dday !== null && dday <= 7 ? 'text-red-500' : ''}>{dday ?? '-'}</td>
                <td>{s.overview?.status ?? '-'}</td>
                <td>{shipRate !== null ? `${shipRate}% (${shippedQty}/${orderQty})` : '-'}</td>
                <td className={colorClass}>{deliveryStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedStyle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-1/2 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">{selectedStyle.styleNo} 상세</h3>

            <div className="grid grid-cols-2 gap-2 text-sm mb-6">
              <div><span className="text-gray-500">브랜드:</span> {selectedStyle.overview?.brand ?? '-'}</div>
              <div><span className="text-gray-500">생산유형:</span> {selectedStyle.overview?.productionType ?? '-'}</div>
              <div><span className="text-gray-500">공장:</span> {selectedStyle.overview?.factory ?? '-'}</div>
              <div><span className="text-gray-500">바이어:</span> {selectedStyle.overview?.buyer ?? '-'}</div>
              <div><span className="text-gray-500">총수량:</span> {selectedStyle.overview?.totalQty ?? '-'}</div>
              <div><span className="text-gray-500">목표출고일:</span> {selectedStyle.overview?.targetRdd ?? '-'}</div>
              <div><span className="text-gray-500">FOB 단가:</span> {selectedStyle.overview?.fobPrice ?? '-'}</div>
              <div><span className="text-gray-500">CMT 단가:</span> {selectedStyle.overview?.cmtPrice ?? '-'}</div>
              <div><span className="text-gray-500">상태:</span> {selectedStyle.overview?.status ?? '-'}</div>
            </div>

            <h4 className="font-semibold mb-2">계약서 발행 이력</h4>
            {contracts.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">발행된 계약서가 없습니다.</p>
            ) : (
              <ul className="mb-4 space-y-2 text-sm">
                {contracts.map((c) => (
                  <li key={c.id} className="border-b border-gray-100 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${CONTRACT_STATUS_CLASSES[c.status]}`}>
                          {CONTRACT_STATUS_LABELS[c.status]}
                        </span>
                        {new Date(c.issuedAt).toLocaleString()} {c.notes ? `— ${c.notes}` : ''}
                        {c.totalQty != null && <span className="text-gray-500"> (수량 {c.totalQty}{c.targetRdd ? `, 납기 ${c.targetRdd}` : ''})</span>}
                      </div>
                      {canApprove && c.status === 'PENDING_APPROVAL' && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleApproveContract(c)}
                            disabled={contractActionId === c.id}
                            className="bg-green-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                          >승인</button>
                          <button
                            onClick={() => handleRejectContract(c)}
                            disabled={contractActionId === c.id}
                            className="bg-red-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                          >거절</button>
                        </div>
                      )}
                      {canApprove && (
                        <button
                          onClick={() => handleDeleteContract(c)}
                          disabled={contractActionId === c.id}
                          className="text-gray-400 hover:text-red-600 text-xs shrink-0"
                        >삭제</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 mb-6">
              <input
                className="border p-2 flex-1"
                placeholder="비고 (선택)"
                value={contractNotes}
                onChange={(e) => setContractNotes(e.target.value)}
              />
              <button onClick={handleIssueContract} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700">계약서 발행</button>
            </div>

            <h4 className="font-semibold mb-2">공정 진행현황</h4>
            <div className="text-sm mb-2">
              자재입고:{' '}
              {materialReadiness === null ? (
                <span className="text-gray-400">확인 불가</span>
              ) : materialReadiness.totalMaterials === 0 ? (
                <span className="text-gray-400">BOM 없음</span>
              ) : (
                <span className={materialReadiness.readyMaterials === materialReadiness.totalMaterials ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                  {materialReadiness.readyMaterials}/{materialReadiness.totalMaterials} 입고완료
                </span>
              )}
            </div>
            <div className="space-y-2 mb-6">
              {PROCESS_STAGES.map((stage) => {
                const form = stageForms[stage];
                const targetQty = Number(form.targetQty) || 0;
                const completedQty = Number(form.completedQty) || 0;
                const pct = targetQty > 0 ? Math.min(100, Math.round((completedQty / targetQty) * 100)) : null;
                const stageRecord = processStages.find((s) => s.stage === stage);
                return (
                  <div key={stage} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{STAGE_LABELS[stage]}</span>
                      <span className="text-xs text-gray-500">
                        {pct !== null && `${pct}% (${completedQty}/${targetQty})`}
                        {stageRecord && ` · 마지막 갱신: ${new Date(stageRecord.updatedAt).toLocaleString()}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-sm">
                      <input type="date" className="border p-1" aria-label={`${STAGE_LABELS[stage]} 시작일`} value={form.startDate}
                        onChange={(e) => setStageForms({ ...stageForms, [stage]: { ...form, startDate: e.target.value } })} />
                      <input type="date" className="border p-1" aria-label={`${STAGE_LABELS[stage]} 종료일`} value={form.finishDate}
                        onChange={(e) => setStageForms({ ...stageForms, [stage]: { ...form, finishDate: e.target.value } })} />
                      <input type="number" className="border p-1" placeholder="목표수량" value={form.targetQty}
                        onChange={(e) => setStageForms({ ...stageForms, [stage]: { ...form, targetQty: e.target.value } })} />
                      <input type="number" className="border p-1" placeholder="완료수량" value={form.completedQty}
                        onChange={(e) => setStageForms({ ...stageForms, [stage]: { ...form, completedQty: e.target.value } })} />
                      <input type="text" className="border p-1" placeholder="라인/담당" value={form.lineOrTeam}
                        onChange={(e) => setStageForms({ ...stageForms, [stage]: { ...form, lineOrTeam: e.target.value } })} />
                    </div>
                    <button
                      onClick={() => handleSaveStage(stage)}
                      disabled={savingStage === stage}
                      className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                    >
                      {savingStage === stage ? '저장 중...' : '저장'}
                    </button>
                  </div>
                );
              })}
            </div>

            <h4 className="font-semibold mb-2">출고/납품 현황</h4>
            <div className="grid grid-cols-4 gap-2 text-sm mb-3 bg-gray-50 p-2 rounded">
              <div><span className="text-gray-500">발주량:</span> {orderQty}</div>
              <div><span className="text-gray-500">누적출고량:</span> {shippedQty}</div>
              <div><span className="text-gray-500">잔량:</span> {remainingQty}</div>
              <div><span className="text-gray-500">납기상태:</span> <span className={deliveryStatusColor}>{deliveryStatus}</span></div>
            </div>
            {shipments.length === 0 ? (
              <p className="text-sm text-gray-500 mb-3">등록된 출고가 없습니다.</p>
            ) : (
              <table className="w-full text-sm mb-3 border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-1">차수</th><th className="p-1">계획일</th><th className="p-1">실제일</th><th className="p-1">수량</th><th className="p-1">메모</th><th className="p-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-1">{s.installmentNo}차</td>
                      <td className="p-1">{s.plannedShipDate}</td>
                      <td className="p-1">{s.actualShipDate ?? <span className="text-gray-400">계획</span>}</td>
                      <td className="p-1">{s.quantity}</td>
                      <td className="p-1">{s.remark ?? '-'}</td>
                      <td className="p-1">
                        {!s.actualShipDate && (
                          <button onClick={() => handleConfirmShipment(s)} className="text-blue-600 hover:underline text-xs">출고확정</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <input type="date" className="border p-2" aria-label="계획출고일" value={shipmentForm.plannedShipDate}
                onChange={(e) => setShipmentForm({ ...shipmentForm, plannedShipDate: e.target.value })} />
              <input type="number" className="border p-2" placeholder="수량" value={shipmentForm.quantity}
                onChange={(e) => setShipmentForm({ ...shipmentForm, quantity: e.target.value })} />
              <input type="text" className="border p-2" placeholder="메모 (선택)" value={shipmentForm.remark}
                onChange={(e) => setShipmentForm({ ...shipmentForm, remark: e.target.value })} />
              <button onClick={handleCreateShipment} disabled={creatingShipment} className="bg-purple-600 text-white px-3 py-2 rounded text-sm disabled:opacity-50">
                {creatingShipment ? '등록 중...' : '출고 등록'}
              </button>
            </div>

            <button onClick={() => setSelectedStyle(null)} className="bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};
