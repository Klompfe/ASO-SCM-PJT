import React, { useState } from 'react';
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
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded" disabled={!file || loading}>AI 분석 시작</button>
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
