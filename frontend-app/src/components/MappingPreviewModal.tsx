import React, { useState, useEffect } from 'react';
import { commitMapping, getBomDiff, reconcileBom, type BomReconcileResult } from '../api/mapping.service';
import { getMaterialPackagingUnitRules, type MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';
import { APPROVE_LABEL, BADGE_ALREADY_REGISTERED, REAPPROVE_LABEL, REAPPROVE_NOTICE_POINTS, REAPPROVE_NOTICE_TITLE } from '../utils/mappingApproval';
import { extractNotices, type CommitNotice } from '../utils/commitNotices';
import { getErrorMessage } from '../utils/errorMessage';
import { computeRawRowPackaging } from '../utils/materialRequirementDisplay';
import { buildColorSizeQuantityTable } from '../utils/styleColorSizeQuantities';
import { CommitResultPanel } from './CommitResultPanel';
import {
  buildBomDiffDraftRows,
  buildDefaultDecisions,
  applyExcelBasedDefaults,
  summarizeBomDiff,
  buildReconcileActions,
  type BomDiffDraftRow,
  type BomDiffRowDecision,
} from '../utils/bomDiffReview';

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
  // PR-216: 실/테이프 포장단위 규칙 — 이 화면의 행(threadType/tapeType 없음)에서 자재명으로
  // 종류를 추론해 "123.456콘" 대신 "N콘/N롤"(정수)로 보여주는 데 쓴다. 선택(기존 테스트가
  // 이 prop 없이 호출해도 깨지지 않게) — 없으면 규칙 미로딩과 동일하게 취급한다.
  packagingRules?: MaterialPackagingUnitRule[];
  // PR-212: 색상×사이즈 수량(국내만) — 서버가 CLOOR/SIZE 블록에서 읽은 그대로. 비어 있으면
  // "수량표 없음"을 보여준다(파싱 실패가 아니라 정상적으로 없는 경우일 수 있음).
  colorSizeQuantities?: { color: string; size: string; qty: number }[];
  // PR-212: 파서가 수량 셀을 읽으며 낸 경고(예: 잘못된 셀, 색상 빈 칸, 중복 색상, 중국
  // 수량 무시) — 저장에는 영향 없음(해당 값들은 이미 저장 대상에서 제외됐다), 참고용.
  colorSizeQuantityWarnings?: string[];
  saving: boolean;
  // 승인 결과. 있으면 "확인"을 눌러야만 모달이 닫힌다(경고를 놓치지 않게 — 예전엔 alert('저장 성공!')가 그 역할을 어설프게 했다).
  result: CommitOutcome | null;
  error: string | null;
  onCommit: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

// 표시 전용(상태 없음) — 결과 유무에 따른 화면/버튼을 그대로 테스트할 수 있다.
export const MappingPreviewModalView: React.FC<ViewProps> = ({ data, alreadyExists, styleOverview, bomItems, packagingRules = [], colorSizeQuantities = [], colorSizeQuantityWarnings = [], saving, result, error, onCommit, onClose, onConfirm }) => {
  const quantityTable = buildColorSizeQuantityTable(colorSizeQuantities);
  return (
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
          {/* PR-211: QTY 칸을 못 읽으면 파서가 0을 만든다 — 그 0을 그대로 보여주면
              "진짜 수량 0"처럼 보여 혼동된다(재업로드 시 기존 값을 지우는 사고의
              화면쪽 짝). 기존 값이 있으면 저장 시 유지된다는 것을 알린다. */}
          <div>
            <strong>총 생산수량:</strong>{' '}
            {styleOverview.totalQty > 0
              ? styleOverview.totalQty
              : quantityTable.grandTotal > 0
                ? <>{quantityTable.grandTotal}<span className="block text-xs text-gray-400">(색상×사이즈 합계, QTY 칸 미기재)</span></>
                : '미기재 (기존 값이 있으면 유지됩니다)'}
          </div>
          <div><strong>바이어:</strong> {styleOverview.buyer}</div>
          <div><strong>선적일:</strong> {styleOverview.shipDate}</div>
        </div>
      </div>

      {/* PR-212: 색상×사이즈 수량표 — 행=색상, 열=사이즈. */}
      <div className="bg-gray-50 p-4 rounded border mb-6" data-testid="color-size-quantity-block">
        <h4 className="font-semibold mb-2 text-sm">색상×사이즈 수량</h4>
        {quantityTable.colors.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="color-size-quantity-empty">수량표 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border text-sm" data-testid="color-size-quantity-table">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">색상</th>
                  {quantityTable.sizes.map((size) => <th key={size} className="border p-2">{size}</th>)}
                  <th className="border p-2">합계</th>
                </tr>
              </thead>
              <tbody>
                {quantityTable.colors.map((color) => (
                  <tr key={color}>
                    <td className="border p-2">{color}</td>
                    {quantityTable.sizes.map((size) => (
                      <td key={size} className="border p-2 text-right">{quantityTable.cellQty(color, size) ?? '-'}</td>
                    ))}
                    <td className="border p-2 text-right font-semibold">{quantityTable.totalByColor[color]}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td className="border p-2">합계</td>
                  {quantityTable.sizes.map((size) => (
                    <td key={size} className="border p-2 text-right">{quantityTable.totalBySize[size]}</td>
                  ))}
                  <td className="border p-2 text-right">{quantityTable.grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {colorSizeQuantityWarnings.length > 0 && (
          <ul className="text-xs text-amber-700 mt-2 list-disc pl-5" data-testid="color-size-quantity-warnings">
            {colorSizeQuantityWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>

      {/* BOM Table */}
      <div className="overflow-x-auto">
        <table className="border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">카테고리</th>
              <th className="border p-2">자재명</th>
              <th className="border p-2">요척</th>
              <th className="border p-2">필요량</th>
            </tr>
          </thead>
          <tbody>
            {bomItems.map((item, index) => {
              // PR-216: 엑셀에서 막 파싱한 행이라 threadType/tapeType이 없다 — 자재명으로
              // 종류를 추론해 맞으면(하나로 확정) 정수+포장단위로, 아니면(실/테이프로는
              // 보이지만 종류를 하나로 못 정함) 경고만, 일반 자재는 기존처럼 그대로 보여준다.
              const packagingResult = computeRawRowPackaging(item.itemName, Number(item.requiredQty) || 0, packagingRules);
              return (
                <tr key={index}>
                  <td className="border p-2">{item.category}</td>
                  <td className="border p-2">{item.itemName}</td>
                  <td className="border p-2">{item.consumption}</td>
                  <td className="border p-2">
                    {packagingResult.status === 'DETERMINED' ? (
                      <>
                        {packagingResult.packages}{packagingResult.unitLabel}
                        <span className="block text-xs text-amber-700">{packagingResult.formula}</span>
                      </>
                    ) : (
                      <>
                        {item.requiredQty}
                        {packagingResult.status === 'AMBIGUOUS' && (
                          <span className="block text-xs text-amber-700" data-testid={`packaging-warning-${index}`}>⚠ {packagingResult.warning}</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
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
};

const ROW_TYPE_LABEL: Record<BomDiffDraftRow['type'], string> = {
  SAME: '같음',
  VALUE_DIFF: '값 다름',
  ONLY_NEW: '새 행(엑셀에만)',
  ONLY_EXISTING: '기존에만',
  SIMILAR: '유사 짝(제안)',
};

const DECISION_LABEL: Record<BomDiffRowDecision, string> = {
  SKIP: '건너뜀',
  OVERWRITE: '엑셀 값으로 덮어쓰기',
  ADD: '추가',
  KEEP: '그대로 두기',
  REMOVE: '제거',
  REPLACE: '교체(기존 행을 엑셀 이름으로)',
};

const DECISION_OPTIONS_BY_TYPE: Record<BomDiffDraftRow['type'], BomDiffRowDecision[]> = {
  SAME: ['SKIP'],
  VALUE_DIFF: ['SKIP', 'OVERWRITE'],
  ONLY_NEW: ['SKIP', 'ADD'],
  ONLY_EXISTING: ['KEEP', 'REMOVE'],
  SIMILAR: ['SKIP', 'REPLACE'],
};

interface BomDiffReviewViewProps {
  rows: BomDiffDraftRow[];
  decisions: Map<string, BomDiffRowDecision>;
  summary: { same: number; valueDiff: number; onlyNew: number; onlyExisting: number; similar: number };
  applying: boolean;
  applied: BomReconcileResult | null;
  error: string | null;
  onDecisionChange: (key: string, decision: BomDiffRowDecision) => void;
  onApplyExcelDefaults: () => void;
  onApply: () => void;
  onClose: () => void;
}

// PR-198: 저장 전 "기존 BOM과 비교" 화면 — 표시 전용(상태는 MappingPreviewModal이 들고 있다).
export const BomDiffReviewView: React.FC<BomDiffReviewViewProps> = ({
  rows, decisions, summary, applying, applied, error, onDecisionChange, onApplyExcelDefaults, onApply, onClose,
}) => (
  <div className="p-6 overflow-y-auto flex-1 min-h-0">
    <h3 className="text-lg font-bold mb-2">기존 자재명세와 비교</h3>
    <p className="text-sm text-gray-500 mb-3">
      같음 {summary.same} · 값 다름 {summary.valueDiff} · 새 행 {summary.onlyNew} · 기존에만 {summary.onlyExisting} · 유사 짝(제안) {summary.similar}
    </p>

    {applied && (
      <div className="mb-4 border border-green-300 bg-green-50 text-green-800 rounded p-3 text-sm" data-testid="reconcile-result">
        적용 완료 — 덮어쓰기 {applied.applied.overwritten}건, 추가 {applied.applied.added}건, 제거 {applied.applied.removed}건, 교체 {applied.applied.replaced}건.
        현재 자재명세 {applied.remainingBomItemCount}건.
        {applied.warnings.length > 0 && (
          <ul className="list-disc pl-5 mt-1">
            {applied.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
        <p className="mt-1">부족분 표에서 중복·틀린 요척이 사라졌는지 확인해 주세요.</p>
      </div>
    )}
    {error && (
      <div className="mb-4 border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm" role="alert">{error}</div>
    )}

    {!applied && (
      <>
        <button onClick={onApplyExcelDefaults} className="mb-3 px-3 py-1.5 bg-gray-700 text-white rounded text-sm">엑셀 기준으로 모두 맞추기</button>
        <div className="overflow-x-auto">
          <table className="border text-sm w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2">상태</th>
                <th className="border p-2">자재명(기존→새)</th>
                <th className="border p-2">요척(기존→새)</th>
                <th className="border p-2">색상</th>
                <th className="border p-2">규격</th>
                <th className="border p-2">연결 발주</th>
                <th className="border p-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.type === 'VALUE_DIFF' ? 'bg-orange-50' : undefined}>
                  <td className="border p-2">{ROW_TYPE_LABEL[row.type]}</td>
                  <td className="border p-2">
                    {row.existing?.itemName ?? '-'}{row.incoming && row.existing?.itemName !== row.incoming.itemName ? ` → ${row.incoming.itemName}` : ''}
                  </td>
                  <td className="border p-2">
                    {row.existing?.consumption ?? '-'}{row.incoming && row.existing?.consumption !== row.incoming.consumption ? ` → ${row.incoming.consumption ?? '-'}` : ''}
                  </td>
                  <td className="border p-2">{row.incoming?.colorCode ?? row.existing?.colorCode ?? '-'}</td>
                  <td className="border p-2">{row.incoming?.spec ?? row.existing?.spec ?? '-'}</td>
                  <td className="border p-2">
                    {row.existing && row.existing.linkedPoCount > 0 ? `⚠ ${row.existing.linkedPoCount}건` : '-'}
                  </td>
                  <td className="border p-2">
                    <select
                      className="border rounded px-1 py-0.5 text-xs"
                      value={decisions.get(row.key) ?? 'SKIP'}
                      onChange={(e) => onDecisionChange(row.key, e.target.value as BomDiffRowDecision)}
                    >
                      {DECISION_OPTIONS_BY_TYPE[row.type].map((opt) => (
                        <option key={opt} value={opt}>{DECISION_LABEL[opt]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}

    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">닫기</button>
      {!applied && (
        <button onClick={onApply} disabled={applying} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-gray-400">
          {applying ? '적용 중...' : '적용'}
        </button>
      )}
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
  const [packagingRules, setPackagingRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CommitOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  // PR-198: 저장 버튼을 누르면 먼저 bom-diff를 호출한다 — 기존 BOM이 없으면(diffMode=false)
  // 지금처럼 바로 commit, 있으면(diffMode=true) 비교 화면을 보여주고 commit을 호출하지 않는다.
  const [diffMode, setDiffMode] = useState(false);
  const [diffRows, setDiffRows] = useState<BomDiffDraftRow[]>([]);
  const [decisions, setDecisions] = useState<Map<string, BomDiffRowDecision>>(new Map());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<BomReconcileResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBomItems(data?.bomItems || []);
    setStyleOverview(data?.overview || {});
    setResult(null);
    setError(null);
    setDiffMode(false);
    setDiffRows([]);
    setDecisions(new Map());
    setApplied(null);
  }, [data, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    getMaterialPackagingUnitRules()
      .then((res) => setPackagingRules(Array.isArray(res) ? res : (res?.data ?? [])))
      .catch(() => setPackagingRules([]));
  }, [isOpen]);

  const doCommit = async () => {
    const styleNo = data?.styleNo || 'UNKNOWN';
    // PR-212: 색상×사이즈 수량(국내만) — 파서가 CLOOR/SIZE를 못 찾았으면 undefined로 보내
    // 기존 수량 행을 전혀 건드리지 않는다(서버의 "안 보냄 vs 빈 시트" 구분과 맞춤).
    const payload = {
      styleNo,
      overviewData: styleOverview,
      bomItems,
      colorSizeQuantities: data?.colorSizeQuantities?.rows,
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

  const handleCommit = async () => {
    const styleNo = data?.styleNo || 'UNKNOWN';
    setSaving(true);
    setError(null);
    try {
      const diff = await getBomDiff({ styleNo, bomItems });
      if (!diff.hasExistingBom) {
        await doCommit();
        return;
      }
      const rows = buildBomDiffDraftRows(diff.rows ?? [], diff.similarPairs ?? []);
      setDiffRows(rows);
      setDecisions(buildDefaultDecisions(rows));
      setDiffMode(true);
    } catch (e) {
      setError(getErrorMessage(e, '비교에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyExcelDefaults = () => setDecisions(applyExcelBasedDefaults(diffRows));

  const handleApply = async () => {
    const styleNo = data?.styleNo || 'UNKNOWN';
    setApplying(true);
    setError(null);
    try {
      const actions = buildReconcileActions(diffRows, decisions);
      const res = await reconcileBom({ styleNo, actions });
      setApplied(res);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, '적용에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  if (diffMode) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
          <BomDiffReviewView
            rows={diffRows}
            decisions={decisions}
            summary={summarizeBomDiff(diffRows)}
            applying={applying}
            applied={applied}
            error={error}
            onDecisionChange={(key, decision) => setDecisions((prev) => { const next = new Map(prev); next.set(key, decision); return next; })}
            onApplyExcelDefaults={handleApplyExcelDefaults}
            onApply={handleApply}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  return (
    <MappingPreviewModalView
      data={data}
      alreadyExists={alreadyExists}
      styleOverview={styleOverview}
      bomItems={bomItems}
      packagingRules={packagingRules}
      colorSizeQuantities={data?.colorSizeQuantities?.rows}
      colorSizeQuantityWarnings={data?.colorSizeQuantities?.warnings}
      saving={saving}
      result={result}
      error={error}
      onCommit={handleCommit}
      onClose={onClose}
      onConfirm={() => { setResult(null); onClose(); }}
    />
  );
};
