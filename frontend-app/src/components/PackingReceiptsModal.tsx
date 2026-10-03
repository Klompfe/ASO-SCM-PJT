import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getPackingReceipts,
  createPackingReceipt,
  uploadPackingReceipt,
  getPackingReceiptTemplate,
  previewPackingReceiptTemplateUpload,
  type PackingReceipt,
  type PackingMaterialCategory,
  type CreatePackingReceiptRoll,
  type CreatePackingReceiptCarton,
  type PackingReceiptTemplatePreview,
} from '../api/packingReceipts.service';
import { getErrorMessage } from '../utils/errorMessage';

// base64로 내려온 표준양식 엑셀을 그대로 파일 다운로드로 띄운다(Bearer 인증이 필요해
// <a href> 직접 다운로드를 쓸 수 없다 — ShipmentsManager.tsx의 Blob 다운로드 패턴과 동일).
function downloadBase64File(base64: string, filename: string): void {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const emptyRoll: CreatePackingReceiptRoll = { rollNo: '', color: '', widthCm: undefined, widthInch: undefined, grossWeight: undefined, netWeight: undefined, thickness: undefined, lengthYd: undefined };
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
  // PR-157: 공급업체 제공 CBM(수동 입력) — 없는 업체는 비워둔다.
  const [cbm, setCbm] = useState('');
  const [rolls, setRolls] = useState<CreatePackingReceiptRoll[]>([{ ...emptyRoll }]);
  const [cartons, setCartons] = useState<CreatePackingReceiptCarton[]>([{ ...emptyCarton }]);
  const [submitting, setSubmitting] = useState(false);

  const [uploadCategory, setUploadCategory] = useState<PackingMaterialCategory>('FABRIC');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // PR-169: 표준양식 다운로드/업로드 — 업로드는 먼저 미리보기만 하고(저장 안 함),
  // 사용자가 확인을 눌러야 기존 createPackingReceipt로 실제 커밋된다.
  const [templateCategory, setTemplateCategory] = useState<PackingMaterialCategory>('FABRIC');
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PackingReceiptTemplatePreview | null>(null);
  const [committingPreview, setCommittingPreview] = useState(false);

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
    setCbm('');
    setRolls([{ ...emptyRoll }]);
    setCartons([{ ...emptyCarton }]);
  };

  const handleSubmitDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cbmValue = cbm.trim() === '' ? undefined : Number(cbm);
      const payload =
        category === 'FABRIC'
          ? { materialCategory: category, receivedDate: receivedDate || undefined, remark: remark || undefined, cbm: cbmValue, rolls: rolls.filter((r) => r.rollNo.trim() !== '') }
          : { materialCategory: category, receivedDate: receivedDate || undefined, remark: remark || undefined, cbm: cbmValue, cartons: cartons.filter((c) => c.cartonNo.trim() !== '') };
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

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await getPackingReceiptTemplate(purchaseOrderId, templateCategory);
      downloadBase64File(res.base64, res.filename);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '표준양식 다운로드에 실패했습니다.'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handlePreviewTemplateUpload = async () => {
    if (!templateFile) {
      toast.error('미리볼 엑셀 파일을 선택해 주세요.');
      return;
    }
    setPreviewing(true);
    try {
      const res = await previewPackingReceiptTemplateUpload(purchaseOrderId, templateFile, templateCategory);
      setPreview(res);
      if (res.warnings?.length) {
        res.warnings.forEach((w: string) => toast.error(w));
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '양식 미리보기에 실패했습니다.'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmPreview = async () => {
    if (!preview) return;
    setCommittingPreview(true);
    try {
      await createPackingReceipt(purchaseOrderId, {
        materialCategory: preview.materialCategory,
        cbm: preview.cbm,
        remark: preview.remark,
        rolls: preview.rolls,
        cartons: preview.cartons,
      });
      toast.success('포장내역이 등록되었습니다.');
      setPreview(null);
      setTemplateFile(null);
      loadReceipts();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '포장내역 등록에 실패했습니다.'));
    } finally {
      setCommittingPreview(false);
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
                  <div>롤 {r.totals.rollCount}개 · 길이 {r.totals.totalLengthYd ? `${r.totals.totalLengthYd.toFixed(2)}YD` : '미입력'} · GROSS {r.totals.totalGrossWeight?.toFixed(2)} · NET {r.totals.totalNetWeight?.toFixed(2)} · CBM {r.cbm ?? '-'}</div>
                ) : (
                  <div>카톤 {r.totals.cartonCount}개({r.totals.lineCount}라인) · 수량 {r.totals.totalQty} · 중량 {r.totals.totalWeightKg?.toFixed(2) ?? '-'}kg · CBM {r.cbm ?? '-'}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <h4 className="font-semibold mb-2">표준양식 다운로드/업로드</h4>
        <div className="bg-gray-50 p-3 rounded mb-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">구분</label>
              <select
                className="border p-2 rounded"
                value={templateCategory}
                onChange={(e) => { setTemplateCategory(e.target.value as PackingMaterialCategory); setPreview(null); }}
              >
                <option value="FABRIC">원단(롤 단위)</option>
                <option value="TRIM">부자재(카톤 단위)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {downloadingTemplate ? '다운로드 중...' : '양식 다운로드'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setTemplateFile(e.target.files?.[0] ?? null); setPreview(null); }}
              className="border p-2 rounded"
            />
            <button
              type="button"
              onClick={handlePreviewTemplateUpload}
              disabled={previewing}
              className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {previewing ? '확인 중...' : '업로드 미리보기'}
            </button>
          </div>

          {preview && (
            <div className="border border-yellow-300 bg-yellow-50 rounded p-3 text-sm space-y-2">
              <p className="font-medium">
                {preview.materialCategory === 'FABRIC' ? `롤 ${preview.rolls?.length ?? 0}건` : `카톤 ${preview.cartons?.length ?? 0}건`}이 인식되었습니다 — 저장 전 확인해 주세요.
              </p>
              <p>CBM: {preview.cbm ?? '-'} · 포장형태: {preview.remark ?? '-'} · 공급업체 기재 포장수: {preview.declaredPackageCount ?? '-'}</p>
              {preview.warnings.length > 0 && (
                <ul className="text-red-600 list-disc pl-4">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmPreview}
                  disabled={committingPreview}
                  className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {committingPreview ? '저장 중...' : '확인하고 저장'}
                </button>
                <button type="button" onClick={() => setPreview(null)} className="bg-gray-400 text-white px-4 py-2 rounded">취소</button>
              </div>
            </div>
          )}
        </div>

        <h4 className="font-semibold mb-2">엑셀 업로드 (기존 BEANPOLE_TTL형/MATERIAL PACKING LIST형)</h4>
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
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">CBM (공급업체 제공값, 없으면 비워둠)</label>
              <input type="number" step="0.01" placeholder="예: 12.5" className="border p-2 rounded w-28" value={cbm} onChange={(e) => setCbm(e.target.value)} />
            </div>
          </div>

          {category === 'FABRIC' ? (
            <div className="space-y-2">
              {rolls.map((r, idx) => (
                <div key={idx} className="grid grid-cols-8 gap-2">
                  <input placeholder="롤No" className="border p-1 rounded text-sm" value={r.rollNo} onChange={(e) => updateRoll(idx, 'rollNo', e.target.value)} />
                  <input placeholder="컬러" className="border p-1 rounded text-sm" value={r.color ?? ''} onChange={(e) => updateRoll(idx, 'color', e.target.value)} />
                  <input placeholder="폭(cm)" type="number" className="border p-1 rounded text-sm" value={r.widthCm ?? ''} onChange={(e) => updateRoll(idx, 'widthCm', e.target.value)} />
                  <input placeholder="폭(inch)" type="number" className="border p-1 rounded text-sm" value={r.widthInch ?? ''} onChange={(e) => updateRoll(idx, 'widthInch', e.target.value)} />
                  <input placeholder="Gross" type="number" className="border p-1 rounded text-sm" value={r.grossWeight ?? ''} onChange={(e) => updateRoll(idx, 'grossWeight', e.target.value)} />
                  <input placeholder="Net" type="number" className="border p-1 rounded text-sm" value={r.netWeight ?? ''} onChange={(e) => updateRoll(idx, 'netWeight', e.target.value)} />
                  <input placeholder="두께" type="number" className="border p-1 rounded text-sm" value={r.thickness ?? ''} onChange={(e) => updateRoll(idx, 'thickness', e.target.value)} />
                  <input placeholder="길이(YD)" aria-label="길이(YD)" type="number" className="border p-1 rounded text-sm" value={r.lengthYd ?? ''} onChange={(e) => updateRoll(idx, 'lengthYd', e.target.value)} />
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
