import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { uploadWorkOrderImage } from '../api/workOrders.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WorkOrderUploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      setAiResult(res);
      setStep(2);
    } catch (e) {
      toast.error('AI 분석 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    // 여기에 최종 DB 저장 로직 (DB에 AI 결과물 저장)
    toast.success('저장되었습니다.');
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
        <h3 className="text-xl font-bold mb-4">작업지시서 이미지 업로드</h3>
        
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

        {step === 2 && aiResult && (
          <div className="space-y-4">
            <h4 className="font-bold">AI 분석 결과</h4>
            <p>품목: {aiResult.itemType} ({aiResult.brand})</p>
            <table className="w-full border">
              <thead><tr className="bg-gray-100"><th>자재명</th><th>규격</th><th>수량</th></tr></thead>
              <tbody>
                {aiResult.bom.map((item: any, i: number) => (
                  <tr key={i}>
                    <td>{item.itemName}</td>
                    <td>{item.spec}</td>
                    <td>{item.requiredQuantity} {item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={handleConfirm} className="bg-green-600 text-white px-4 py-2 rounded">최종 저장</button>
          </div>
        )}
        <button onClick={onClose} className="mt-4 text-gray-500">닫기</button>
      </div>
    </div>
  );
};
