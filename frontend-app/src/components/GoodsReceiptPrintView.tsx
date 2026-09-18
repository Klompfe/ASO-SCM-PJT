import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getGoodsReceipt, type GoodsReceipt } from '../api/goodsReceipts.service';
import { getErrorMessage } from '../utils/errorMessage';

// PR-108: 우리 회사(공급자) 고정정보 — PDF 라이브러리를 새로 들이는 대신 브라우저
// 인쇄(Ctrl+P → PDF로 저장)를 쓰기로 했으므로 화면에 값을 그대로 박아 넣는다.
// LoginPage.tsx 등 기존 화면에서 이미 "태일무역"을 회사명으로 써 왔던 것과 통일했다.
const COMPANY_INFO = {
  name: '태일무역',
  addressLine: '대한민국',
};

interface GoodsReceiptPrintViewProps {
  goodsReceiptId: number;
  onClose: () => void;
}

// 화면 상단 조작 버튼(인쇄/닫기)은 print:hidden으로 인쇄 시 숨기고, 문서 내용만
// 출력되도록 한다 — 모달 배경(고정 오버레이)도 인쇄 시엔 static/투명으로 되돌린다.
export const GoodsReceiptPrintView: React.FC<GoodsReceiptPrintViewProps> = ({ goodsReceiptId, onClose }) => {
  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getGoodsReceipt(goodsReceiptId);
        setReceipt(res);
      } catch (err: any) {
        toast.error(getErrorMessage(err, '입고증을 불러오는 데 실패했습니다.'));
        onClose();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsReceiptId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:static print:bg-white print:block">
      <div className="bg-white w-[800px] max-w-full max-h-[90vh] overflow-y-auto rounded-lg print:rounded-none print:max-h-none print:w-full print:overflow-visible">
        <div className="flex justify-end gap-2 p-3 border-b border-gray-200 print:hidden">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
          >
            인쇄
          </button>
          <button onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-300">
            닫기
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">불러오는 중...</div>
        ) : receipt ? (
          <div className="print-target p-10 space-y-6">
            <h1 className="text-2xl font-bold text-center">완제품입고증</h1>

            <div className="flex justify-between text-sm">
              <div>
                <p className="font-semibold">{COMPANY_INFO.name}</p>
                <p className="text-gray-500">{COMPANY_INFO.addressLine}</p>
              </div>
              <div className="text-right">
                <p>문서번호: <span className="font-mono">{receipt.receiptNo}</span></p>
                <p>발급일자: {receipt.issuedDate?.slice(0, 10)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm border-t border-b border-gray-200 py-3">
              <p>스타일번호: <span className="font-medium">{receipt.importShipment?.styleNo ?? '-'}</span></p>
              <p>INVOICE 번호: <span className="font-medium">{receipt.importShipment?.invoiceNo ?? '-'}</span></p>
              {receipt.remark && <p className="col-span-2">비고: {receipt.remark}</p>}
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 px-2 py-1">색상</th>
                  <th className="border border-gray-300 px-2 py-1">사이즈</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">원 수량</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">조정 수량</th>
                  <th className="border border-gray-300 px-2 py-1">조정 사유</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => {
                  const isAdjusted = Number(line.adjustedQty) !== Number(line.originalQty);
                  return (
                    <tr key={line.id}>
                      <td className="border border-gray-300 px-2 py-1">{line.color}</td>
                      <td className="border border-gray-300 px-2 py-1">{line.size}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right">{line.originalQty}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right">{isAdjusted ? line.adjustedQty : ''}</td>
                      <td className="border border-gray-300 px-2 py-1">{isAdjusted ? line.adjustmentReason : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-right text-sm text-gray-400">위와 같이 완제품을 입고 처리하였음을 확인합니다.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
