import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { uploadWorkOrderImage, commitWorkOrderAnalysis, getAiUsageSummary, type AiWorkOrderResult, type AiUsageSummary } from '../api/workOrders.service';
import { getErrorMessage } from '../utils/errorMessage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WorkOrderUploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<AiWorkOrderResult[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [lastChargeKrw, setLastChargeKrw] = useState<number | null>(null);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getAiUsageSummary()
      .then((res) => setUsageSummary(res))
      .catch(() => setUsageSummary(null));
  }, [isOpen]);

  // 파일을 브라우저 창에 드롭하면 기본 동작은 그 파일을 새 페이지로 여는 것이라
  // (드롭 영역 밖에서도) preventDefault로 항상 막아둔다 — 그렇지 않으면 드롭 영역을
  // 살짝 벗어나 드롭했을 때 파일이 새 탭에서 열려버린다.
  useEffect(() => {
    if (!isOpen) return;
    const preventDefault = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, [isOpen]);

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await uploadWorkOrderImage(file);
      const data: AiWorkOrderResult[] = Array.isArray(res?.results) ? res.results : [];
      const charge: number = typeof res?.chargedAmountKrw === 'number' ? res.chargedAmountKrw : 0;
      setResults(data);
      setLastChargeKrw(charge);
      setSavedIndexes(new Set());
      setStep(2);
      if (charge > 0) {
        toast.success(`AI 분석 완료 — ${charge.toLocaleString()}원 과금되었습니다.`);
        getAiUsageSummary().then((r) => setUsageSummary(r)).catch(() => {});
      }
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 분석 실패'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (index: number) => {
    const result = results[index];
    setSavingIndex(index);
    try {
      await commitWorkOrderAnalysis(result);
      toast.success(`${result.overview.styleNo ?? `#${index + 1}`} 저장되었습니다.`);
      setSavedIndexes((prev) => new Set(prev).add(index));
      onSuccess();
    } catch (e) {
      toast.error(getErrorMessage(e, '저장에 실패했습니다.'));
    } finally {
      setSavingIndex(null);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResults([]);
    setStep(1);
    setSavedIndexes(new Set());
    setLastChargeKrw(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-xl font-bold">작업지시서 이미지 업로드</h3>
            {usageSummary && (
              <span className="text-xs text-gray-400">
                누적 AI 분석 {usageSummary.totalCalls}건 · 누적 과금 {usageSummary.totalChargedKrw.toLocaleString()}원
              </span>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
              >
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <span className="text-gray-600">
                  {file ? file.name : '여기로 파일을 드래그하거나 클릭하여 선택하세요 (PDF, 이미지)'}
                </span>
              </label>
              <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={!file || loading}>
                {loading ? '분석 중...' : 'AI 분석 시작'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                {results.length}건 분석됨{lastChargeKrw != null && lastChargeKrw > 0 ? ` — 이번 분석 요금 ${lastChargeKrw.toLocaleString()}원` : ''} — 각 항목을 확인 후 개별 저장하세요.
              </p>
              {results.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold">
                      {index + 1}. {result.overview.styleNo ?? '(Style No. 인식 실패)'}
                      {result.overview.styleName ? ` — ${result.overview.styleName}` : ''}
                    </h4>
                    <button
                      onClick={() => handleSave(index)}
                      disabled={savingIndex === index || savedIndexes.has(index)}
                      className={`px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50 ${savedIndexes.has(index) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {savedIndexes.has(index) ? '저장됨' : savingIndex === index ? '저장 중...' : '저장'}
                    </button>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">1) 오더개요</h5>
                    <div className="grid grid-cols-4 gap-2 text-sm bg-gray-50 p-2 rounded">
                      <div><span className="text-gray-500">품목:</span> {result.overview.itemType ?? '-'}</div>
                      <div><span className="text-gray-500">브랜드:</span> {result.overview.brand ?? '-'}</div>
                      <div><span className="text-gray-500">생산유형:</span> {result.overview.productionType ?? '-'}</div>
                      <div><span className="text-gray-500">공장:</span> {result.overview.factory ?? '-'}</div>
                      <div><span className="text-gray-500">바이어:</span> {result.overview.buyer ?? '-'}</div>
                      <div><span className="text-gray-500">총수량:</span> {result.overview.totalQty ?? '-'}</div>
                      <div><span className="text-gray-500">납기:</span> {result.overview.targetRdd ?? '-'}</div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">2) 자재명세 ({result.bomItems.length}건)</h5>
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full border text-sm">
                        <thead className="bg-gray-100"><tr><th className="border p-1">구분</th><th className="border p-1">자재명</th><th className="border p-1">규격</th><th className="border p-1">소요량</th><th className="border p-1">비고</th></tr></thead>
                        <tbody>
                          {result.bomItems.map((item, i) => (
                            <tr key={i}>
                              <td className="border p-1">{item.category ?? '-'}</td>
                              <td className="border p-1">{item.itemName}</td>
                              <td className="border p-1">{item.spec ?? '-'}</td>
                              <td className="border p-1">{item.consumption ?? '-'}</td>
                              <td className="border p-1">{item.remarks ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">3) 작업명세</h5>
                    {result.sizeSpecs.length > 0 && (
                      <div className="overflow-x-auto max-h-40 overflow-y-auto mb-2">
                        <table className="w-full border text-sm">
                          <thead className="bg-gray-100"><tr><th className="border p-1">부위</th><th className="border p-1">사이즈</th><th className="border p-1">지시서</th><th className="border p-1">견본</th><th className="border p-1">완성</th></tr></thead>
                          <tbody>
                            {result.sizeSpecs.map((row, i) => (
                              <tr key={i}>
                                <td className="border p-1">{row.part}</td>
                                <td className="border p-1">{row.size}</td>
                                <td className="border p-1">{row.instructedValue ?? '-'}</td>
                                <td className="border p-1">{row.sampleValue ?? '-'}</td>
                                <td className="border p-1">{row.finalValue ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {result.workNotes && (
                      <p className="text-sm bg-yellow-50 border border-yellow-200 rounded p-2 whitespace-pre-line">{result.workNotes}</p>
                    )}
                    {result.sizeSpecs.length === 0 && !result.workNotes && (
                      <p className="text-sm text-gray-400">추출된 작업명세가 없습니다.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button onClick={handleClose} className="text-gray-500">닫기</button>
        </div>
      </div>
    </div>
  );
};
