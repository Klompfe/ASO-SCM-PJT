import React, { useState, useEffect } from 'react';
import { commitMapping } from '../api/mapping.service';
import { APPROVE_LABEL, BADGE_ALREADY_REGISTERED, REAPPROVE_LABEL, REAPPROVE_NOTICE_POINTS, REAPPROVE_NOTICE_TITLE } from '../utils/mappingApproval';
import { extractNotices, type CommitNotice } from '../utils/commitNotices';
import { getErrorMessage } from '../utils/errorMessage';
import { CommitResultPanel } from './CommitResultPanel';

interface MappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  alreadyExists?: boolean;
  onRefresh: () => void;
}

export interface CommitOutcome {
  styleNo: string;
  notices: CommitNotice[];
}

interface ViewProps {
  data: any;
  alreadyExists?: boolean;
  styleOverview: any;
  bomItems: any[];
  saving: boolean;
  // 승인 결과. 있으면 "확인"을 눌러야만 모달이 닫힌다(경고를 놓치지 않게 — 예전엔 alert('저장 성공!')가 그 역할을 어설프게 했다).
  result: CommitOutcome | null;
  error: string | null;
  onCommit: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

// 표시 전용(상태 없음) — 결과 유무에 따른 화면/버튼을 그대로 테스트할 수 있다.
export const MappingPreviewModalView: React.FC<ViewProps> = ({ data, alreadyExists, styleOverview, bomItems, saving, result, error, onCommit, onClose, onConfirm }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
    <div className="p-6 overflow-y-auto flex-1 min-h-0">

      {result && (
        <div className="mb-6 border rounded-lg p-4 bg-white shadow-sm" data-testid="commit-result-section">
          <CommitResultPanel styleNo={result.styleNo} notices={result.notices} />
        </div>
      )}
      {error && (
        <div className="mb-4 border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm" data-testid="commit-error" role="alert">{error}</div>
      )}

      {/* Style Overview Card */}
      <div className="bg-gray-50 p-4 rounded border mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold">Style: {data?.styleNo || 'N/A'}</h3>
          {alreadyExists && (
            <span className="px-2 py-1 rounded text-sm font-bold bg-yellow-100 text-yellow-800">
              {BADGE_ALREADY_REGISTERED}
            </span>
          )}
        </div>
        {alreadyExists && !result && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 p-2 rounded mb-2 text-sm text-left space-y-1" data-testid="reapprove-notice">
            <p className="font-medium">{REAPPROVE_NOTICE_TITLE}</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {REAPPROVE_NOTICE_POINTS.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div><strong>공장:</strong> {styleOverview.factory}</div>
          <div><strong>총 생산수량:</strong> {styleOverview.totalQty}</div>
          <div><strong>바이어:</strong> {styleOverview.buyer}</div>
          <div><strong>선적일:</strong> {styleOverview.shipDate}</div>
        </div>
      </div>

      {/* BOM Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">카테고리</th>
              <th className="border p-2">자재명</th>
              <th className="border p-2">요척</th>
              <th className="border p-2">필요량</th>
            </tr>
          </thead>
          <tbody>
            {bomItems.map((item, index) => (
              <tr key={index}>
                <td className="border p-2">{item.category}</td>
                <td className="border p-2">{item.itemName}</td>
                <td className="border p-2">{item.consumption}</td>
                <td className="border p-2">{item.requiredQty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
      {result ? (
        <button onClick={onConfirm} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">확인</button>
      ) : (
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
          <button
            onClick={onCommit}
            disabled={saving}
            className={`px-4 py-2 text-white rounded disabled:bg-gray-400 ${alreadyExists ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {alreadyExists ? REAPPROVE_LABEL : APPROVE_LABEL}
          </button>
        </>
      )}
    </div>
    </div>
  </div>
);

export const MappingPreviewModal: React.FC<MappingPreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  alreadyExists,
  onRefresh,
}) => {
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [styleOverview, setStyleOverview] = useState<any>(data?.overview || {});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CommitOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBomItems(data?.bomItems || []);
    setStyleOverview(data?.overview || {});
    setResult(null);
    setError(null);
  }, [data, isOpen]);

  const handleCommit = async () => {
    const styleNo = data?.styleNo || 'UNKNOWN';
    const payload = {
      styleNo,
      overviewData: styleOverview,
      bomItems: bomItems
    };
    setSaving(true);
    setError(null);
    try {
      const res = await commitMapping(payload);
      // PR-132: alert('저장 성공!') 대신 서버가 돌려준 알림(자동 반영 안 됨 / 자동 적용됨)을 모달 안에 보여주고 "확인"으로 닫는다.
      setResult({ styleNo, notices: extractNotices(res) });
      // 목록 뒤의 "이미 등록됨" 배지 등은 바로 갱신한다(모달은 사용자가 확인을 누를 때까지 그대로 둔다).
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <MappingPreviewModalView
      data={data}
      alreadyExists={alreadyExists}
      styleOverview={styleOverview}
      bomItems={bomItems}
      saving={saving}
      result={result}
      error={error}
      onCommit={handleCommit}
      onClose={onClose}
      onConfirm={() => { setResult(null); onClose(); }}
    />
  );
};
