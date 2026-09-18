import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getPackingReceipts,
  createPackingReceipt,
  uploadPackingReceipt,
  type PackingReceipt,
  type PackingMaterialCategory,
  type CreatePackingReceiptRoll,
  type CreatePackingReceiptCarton,
} from '../api/packingReceipts.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyRoll: CreatePackingReceiptRoll = { rollNo: '', color: '', widthCm: undefined, widthInch: undefined, grossWeight: undefined, netWeight: undefined, thickness: undefined };
const emptyCarton: CreatePackingReceiptCarton = { cartonNo: '', color: '', size: '', lotNo: '', qty: 0, itemName: '', weightKg: undefined };

interface PackingReceiptsModalProps {
  purchaseOrderId: number;
  purchaseOrderLabel: string;
  onClose: () => void;
}

// PR-074: PurchaseOrder 하위 흐름인 포장내역(원단=롤 단위, 부자재=카톤 단위) 등록 —
// 직접입력(동적 행 추가)과 엑셀 업로드(BEANPOLE_TTL형/MATERIAL PACKING LIST형만 지원)
// 두 경로를 모두 제공한다.
export const PackingReceiptsModal: React.FC<PackingReceiptsModalProps> = ({ purchaseOrderId, purchaseOrderLabel, onClose }) => {
  const [receipts, setReceipts] = useState<PackingReceipt[]>([]);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState<PackingMaterialCategory>('FABRIC');
  const [receivedDate, setReceivedDate] = useState('');
  const [remark, setRemark] = useState('');
  const [rolls, setRolls] = useState<CreatePackingReceiptRoll[]>([{ ...emptyRoll }]);
  const [cartons, setCartons] = useState<CreatePackingReceiptCarton[]>([{ ...emptyCarton }]);
  const [submitting, setSubmitting] = useState(false);

  const [uploadCategory, setUploadCategory] = useState<PackingMaterialCategory>('FABRIC');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPackingReceipts(purchaseOrderId);
      setReceipts(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '포장내역을 불러오는 데 실패했습니다.'));
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const resetDirectInputForm = () => {
    setReceivedDate('');
    setRemark('');
    setRolls([{ ...emptyRoll }]);
    setCartons([{ ...emptyCarton }]);
  };

  const handleSubmitDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload =
        category === 'FABRIC'
          ? { materialCategory: category, receivedDate: receivedDate || undefined, remark: remark || undefined, rolls: rolls.filter((r) => r.rollNo.trim() !== '') }
          : { materialCategory: category, receivedDate: receivedDate || undefined, remark: remark || undefined, cartons: cartons.filter((c) => c.cartonNo.trim() !== '') };
      await createPackingReceipt(purchaseOrderId, payload);
      toast.success('포장내역이 등록되었습니다.');
      resetDirectInputForm();
      loadReceipts();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '포장내역 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('업로드할 엑셀 파일을 선택해 주세요.');
      return;
    }
    setUploading(true);
    try {
      await uploadPackingReceipt(purchaseOrderId, uploadFile, uploadCategory);
      toast.success('엑셀 포장내역이 등록되었습니다.');
      setUploadFile(null);
      loadReceipts();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '엑셀 업로드에 실패했습니다. 지원하지 않는 양식일 수 있습니다.'));
    } finally {
      setUploading(false);
    }
  };

  const updateRoll = (idx: number, field: keyof CreatePackingReceiptRoll, value: string) => {
    const next = [...rolls];
    next[idx] = { ...next[idx], [field]: field === 'rollNo' || field === 'color' ? value : (value === '' ? undefined : Number(value)) };
    setRolls(next);
  };
  const updateCarton = (idx: number, field: keyof CreatePackingReceiptCarton, value: string) => {
    const next = [...cartons];
    next[idx] = { ...next[idx], [field]: field === 'qty' || field === 'weightKg' ? (value === '' ? (field === 'qty' ? 0 : undefined) : Number(value)) : value };
    setCartons(next);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-3/4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">{purchaseOrderLabel} — 포장내역</h3>

        <h4 className="font-semibold mb-2">등록된 포장내역</h4>
        {loading ? (
          <p className="text-sm text-gray-500 mb-4">불러오는 중...</p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">등록된 포장내역이 없습니다.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {receipts.map((r) => (
              <div key={r.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.materialCategory === 'FABRIC' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                    {r.materialCategory === 'FABRIC' ? '원단' : '부자재'}
                  </span>
                  <span className="text-gray-500 text-xs">{r.receivedDate ?? '-'} {r.remark ? `· ${r.remark}` : ''}</span>
                </div>
                {r.materialCategory === 'FABRIC' ? (
                  <div>롤 {r.totals.rollCount}개 · GROSS {r.totals.totalGrossWeight?.toFixed(2)} · NET {r.totals.totalNetWeight?.toFixed(2)}</div>
                ) : (
                  <div>카톤 {r.totals.cartonCount}개({r.totals.lineCount}라인) · 수량 {r.totals.totalQty} · 중량 {r.totals.totalWeightKg?.toFixed(2) ?? '-'}kg</div>
                )}
              </div>
            ))}
          </div>
        )}

        <h4 className="font-semibold mb-2">엑셀 업로드</h4>
        <div className="flex flex-wrap gap-2 items-end bg-gray-50 p-3 rounded mb-6">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">구분</label>
            <select className="border p-2 rounded" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as PackingMaterialCategory)}>
              <option value="FABRIC">원단 (BEANPOLE_TTL형)</option>
              <option value="TRIM">부자재 (MATERIAL PACKING LIST형)</option>
            </select>
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="border p-2 rounded" />
          <button onClick={handleUpload} disabled={uploading} className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50">
            {uploading ? '업로드 중...' : '업로드'}
          </button>
        </div>

        <h4 className="font-semibold mb-2">직접입력</h4>
        <form onSubmit={handleSubmitDirect} className="bg-gray-50 p-3 rounded space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">구분</label>
              <select className="border p-2 rounded" value={category} onChange={(e) => setCategory(e.target.value as PackingMaterialCategory)}>
                <option value="FABRIC">원단(롤 단위)</option>
                <option value="TRIM">부자재(카톤 단위)</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">입고일</label>
              <input type="date" className="border p-2 rounded" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="flex flex-col flex-1">
              <label className="text-xs text-gray-600 mb-1">비고</label>
              <input type="text" className="border p-2 rounded w-full" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
          </div>

          {category === 'FABRIC' ? (
            <div className="space-y-2">
              {rolls.map((r, idx) => (
                <div key={idx} className="grid grid-cols-7 gap-2">
                  <input placeholder="롤No" className="border p-1 rounded text-sm" value={r.rollNo} onChange={(e) => updateRoll(idx, 'rollNo', e.target.value)} />
                  <input placeholder="컬러" className="border p-1 rounded text-sm" value={r.color ?? ''} onChange={(e) => updateRoll(idx, 'color', e.target.value)} />
                  <input placeholder="폭(cm)" type="number" className="border p-1 rounded text-sm" value={r.widthCm ?? ''} onChange={(e) => updateRoll(idx, 'widthCm', e.target.value)} />
                  <input placeholder="폭(inch)" type="number" className="border p-1 rounded text-sm" value={r.widthInch ?? ''} onChange={(e) => updateRoll(idx, 'widthInch', e.target.value)} />
                  <input placeholder="Gross" type="number" className="border p-1 rounded text-sm" value={r.grossWeight ?? ''} onChange={(e) => updateRoll(idx, 'grossWeight', e.target.value)} />
                  <input placeholder="Net" type="number" className="border p-1 rounded text-sm" value={r.netWeight ?? ''} onChange={(e) => updateRoll(idx, 'netWeight', e.target.value)} />
                  <input placeholder="두께" type="number" className="border p-1 rounded text-sm" value={r.thickness ?? ''} onChange={(e) => updateRoll(idx, 'thickness', e.target.value)} />
                </div>
              ))}
              <button type="button" onClick={() => setRolls([...rolls, { ...emptyRoll }])} className="text-blue-600 text-sm">+ 롤 추가</button>
            </div>
          ) : (
            <div className="space-y-2">
              {cartons.map((c, idx) => (
                <div key={idx} className="grid grid-cols-7 gap-2">
                  <input placeholder="카톤No" className="border p-1 rounded text-sm" value={c.cartonNo} onChange={(e) => updateCarton(idx, 'cartonNo', e.target.value)} />
                  <input placeholder="컬러" className="border p-1 rounded text-sm" value={c.color ?? ''} onChange={(e) => updateCarton(idx, 'color', e.target.value)} />
                  <input placeholder="사이즈" className="border p-1 rounded text-sm" value={c.size ?? ''} onChange={(e) => updateCarton(idx, 'size', e.target.value)} />
                  <input placeholder="LOT" className="border p-1 rounded text-sm" value={c.lotNo ?? ''} onChange={(e) => updateCarton(idx, 'lotNo', e.target.value)} />
                  <input placeholder="수량" type="number" className="border p-1 rounded text-sm" value={c.qty || ''} onChange={(e) => updateCarton(idx, 'qty', e.target.value)} />
                  <input placeholder="품목명" className="border p-1 rounded text-sm" value={c.itemName ?? ''} onChange={(e) => updateCarton(idx, 'itemName', e.target.value)} />
                  <input placeholder="중량(kg)" type="number" step="0.01" className="border p-1 rounded text-sm" value={c.weightKg ?? ''} onChange={(e) => updateCarton(idx, 'weightKg', e.target.value)} />
                </div>
              ))}
              <button type="button" onClick={() => setCartons([...cartons, { ...emptyCarton }])} className="text-blue-600 text-sm">+ 카톤 추가</button>
            </div>
          )}

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {submitting ? '등록 중...' : '포장내역 등록'}
          </button>
        </form>

        <button onClick={onClose} className="mt-6 bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
      </div>
    </div>
  );
};
