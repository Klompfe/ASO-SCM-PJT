import { useMemo, useState } from 'react';
import type { AiSalesOrderResult, SalesOrderBomCompareRow } from '../api/salesOrders.service';
import {
  buildDraftRows,
  buildDefaultDecisions,
  summarizeDecisions,
  riskyDeleteRows,
  buildCommitDecisionsPayload,
  defaultExistingDecisionFor,
  type SalesOrderBomCompareDecisionMap,
  type IncomingDecision,
  type ExistingDecision,
} from '../utils/salesOrderBomCompareReview';

interface SalesOrderBomCompareStepProps {
  styleNo: string | null;
  rows: SalesOrderBomCompareRow[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (decisions: AiSalesOrderResult['decisions']) => void;
}

const TYPE_BADGE: Record<SalesOrderBomCompareRow['type'], { label: string; className: string }> = {
  same: { label: '동일 → 갱신', className: 'bg-gray-100 text-gray-700' },
  similar: { label: '비슷한 이름', className: 'bg-yellow-100 text-yellow-800' },
  new: { label: '새 자재', className: 'bg-blue-100 text-blue-800' },
  existingOnly: { label: '기존에만 있음', className: 'bg-red-100 text-red-800' },
};

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 자재명세와 비교" 화면. 기본 선택은
// "새 인식 우선"(사용자 확정 요구사항) — ① 새 인식에 없는 기존 행은 기본 삭제(단,
// 발주·입고 연결로 삭제 불가면 유지로 고정) ② 비슷한 이름 행은 기본 새 자재로 추가
// (합치기는 사람이 선택) ③ 정규화 일치(same)는 기본 갱신. 삭제가 기본값이라 안전장치를
// 그대로 둔다: 연결된 행은 선택 자체를 막고, 수동/확정값이 있는 행은 체크 확인 전에는
// 삭제가 적용되지 않는다.
export function SalesOrderBomCompareStep({ styleNo, rows, saving, onCancel, onConfirm }: SalesOrderBomCompareStepProps) {
  const draftRows = useMemo(() => buildDraftRows(rows), [rows]);
  const [decisions, setDecisions] = useState<SalesOrderBomCompareDecisionMap>(() => buildDefaultDecisions(draftRows));
  const [confirmedRiskyKeys, setConfirmedRiskyKeys] = useState<Set<string>>(new Set());

  const summary = summarizeDecisions(draftRows, decisions);
  const risky = riskyDeleteRows(draftRows, decisions);
  const riskyKeys = new Set(risky.map((r) => r.key));

  const setIncoming = (key: string, value: IncomingDecision) => {
    setDecisions((prev) => ({ incoming: new Map(prev.incoming).set(key, value), existing: prev.existing }));
  };
  const setExisting = (key: string, value: ExistingDecision) => {
    setDecisions((prev) => ({ incoming: prev.incoming, existing: new Map(prev.existing).set(key, value) }));
    if (value !== 'delete') {
      setConfirmedRiskyKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleConfirmClick = () => {
    const uncheckedRisky = risky.filter((r) => !confirmedRiskyKeys.has(r.key));
    if (uncheckedRisky.length > 0) {
      window.alert(
        `삭제 대상 중 수동 필요수량·확정 단가·종류 지정이 있는 자재가 있습니다 — 아래에서 확인 체크를 해야 삭제할 수 있습니다: ${uncheckedRisky
          .map((r) => r.row.existing?.itemName)
          .join(', ')}`,
      );
      return;
    }
    if (summary.delete > 0) {
      const deleteNames = draftRows
        .filter(({ key, row }) => row.type === 'existingOnly' && (decisions.existing.get(key) ?? defaultExistingDecisionFor(row)) === 'delete')
        .map(({ row }) => row.existing?.itemName ?? '')
        .filter(Boolean);
      const proceed = window.confirm(`기존 자재 ${deleteNames.length}건이 삭제됩니다. 계속할까요?\n- ${deleteNames.join('\n- ')}`);
      if (!proceed) return;
    }
    onConfirm(buildCommitDecisionsPayload(draftRows, decisions));
  };

  return (
    <div className="space-y-4" data-testid="sales-order-bom-compare-step">
      <div>
        <h4 className="text-lg font-bold">자재명세 초안 비교{styleNo ? ` — ${styleNo}` : ''}</h4>
        <p className="text-sm text-gray-600 mt-1">
          갱신 {summary.update} · 합치기 {summary.mergeInto} · 새로 추가 {summary.add} · 삭제 {summary.delete} · 유지 {summary.keep}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          기본 선택은 "새 인식 우선"입니다(비슷한 이름은 새 자재로 추가, 기존에만 있는 자재는 삭제) — 수동 필요수량·확정 단가·종류 지정·요척·비고 같은 확정 값은 갱신/합치기에서 항상 기존 값을 유지합니다.
        </p>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">새 인식</th>
              <th className="px-3 py-2 text-left">기존 행</th>
              <th className="px-3 py-2 text-left">선택</th>
            </tr>
          </thead>
          <tbody>
            {draftRows.map(({ key, row }) => {
              const badge = TYPE_BADGE[row.type];
              const isRisky = riskyKeys.has(key);
              return (
                <tr key={key} className="border-t align-top">
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.incoming ? (
                      <div>
                        <div className="font-medium">{row.incoming.itemName}</div>
                        <div className="text-xs text-gray-500">
                          {row.incoming.englishName ? `${row.incoming.englishName} · ` : ''}
                          {row.incoming.colorCode ?? '-'} · {row.incoming.category ?? '-'} · {row.incoming.requiredQty ?? row.incoming.consumption ?? '-'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.existing ? (
                      <div>
                        <div className="font-medium">{row.existing.itemName}</div>
                        <div className="text-xs text-gray-500">
                          필요수량 {row.existing.requiredQty} {row.existing.unit ?? ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.type === 'same' && <span className="text-xs text-gray-500">갱신(자동)</span>}
                    {row.type === 'new' && <span className="text-xs text-gray-500">새 자재로 추가(자동)</span>}
                    {row.type === 'similar' && (
                      <select
                        aria-label="합치기/새 자재로 추가"
                        className="border rounded px-2 py-1 text-xs"
                        value={decisions.incoming.get(key) ?? 'add'}
                        onChange={(e) => setIncoming(key, e.target.value as IncomingDecision)}
                      >
                        <option value="add">새 자재로 추가</option>
                        <option value="mergeInto">합치기(기존 행에)</option>
                      </select>
                    )}
                    {row.type === 'existingOnly' && row.existing && (
                      <div className="space-y-1">
                        <select
                          aria-label="유지/삭제"
                          className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                          value={decisions.existing.get(key) ?? defaultExistingDecisionFor(row)}
                          onChange={(e) => setExisting(key, e.target.value as ExistingDecision)}
                          disabled={!row.existing.canDelete}
                        >
                          <option value="keep">유지</option>
                          <option value="delete" disabled={!row.existing.canDelete}>
                            삭제
                          </option>
                        </select>
                        {!row.existing.canDelete && (
                          <div className="text-xs text-red-600">{row.existing.blockedReason ?? '삭제할 수 없습니다'}</div>
                        )}
                        {isRisky && (decisions.existing.get(key) ?? defaultExistingDecisionFor(row)) === 'delete' && (
                          <label className="flex items-center gap-1 text-xs text-red-700">
                            <input
                              type="checkbox"
                              checked={confirmedRiskyKeys.has(key)}
                              onChange={(e) =>
                                setConfirmedRiskyKeys((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(key);
                                  else next.delete(key);
                                  return next;
                                })
                              }
                            />
                            수동 지정·확정 단가·종류 지정이 있는 자재입니다 — 삭제를 확인했습니다
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded border text-gray-700" disabled={saving}>
          취소(저장 안 함)
        </button>
        <button onClick={handleConfirmClick} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={saving}>
          {saving ? '저장 중...' : '이 선택으로 저장'}
        </button>
      </div>
    </div>
  );
}
