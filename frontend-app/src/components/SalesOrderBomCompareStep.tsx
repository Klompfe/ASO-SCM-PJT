import { useMemo, useState } from 'react';
import type { AiSalesOrderResult, SalesOrderBomCompareRow, OrderOverviewCompareRow } from '../api/salesOrders.service';
import {
  orderOverviewLabel,
  toggleOverviewUseNew,
  buildOverwriteOrderFields,
  countOverviewOverwrites,
  buildCompareConfirmMessage,
} from '../utils/orderOverviewReview';
import {
  buildDraftRows,
  buildDefaultDecisions,
  summarizeDecisions,
  riskyDeleteRows,
  buildCommitDecisionsPayload,
  defaultExistingDecisionFor,
  defaultIncomingDecisionFor,
  compositionTargetsExisting,
  toggleCompositionChoice,
  countCompositionOverwrites,
  detectOuterDuplicate,
  countOuterAfterSave,
  formatOuterDuplicateNotice,
  formatOuterDuplicateAddNotice,
  withOuterDuplicateConfirm,
  isOuterMissingInIncoming,
  OUTER_MISSING_NOTICE,
  type CompositionChoiceMap,
  type SalesOrderBomCompareDecisionMap,
  type IncomingDecision,
  type ExistingDecision,
} from '../utils/salesOrderBomCompareReview';

interface SalesOrderBomCompareStepProps {
  styleNo: string | null;
  rows: SalesOrderBomCompareRow[];
  // PR-249: 기존 스타일의 오더개요 항목별 비교(없으면 오더개요 구역을 그리지 않는다).
  overview?: OrderOverviewCompareRow[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (decisions: AiSalesOrderResult['decisions'], overwriteOrderFields?: string[]) => void;
}

const TYPE_BADGE: Record<SalesOrderBomCompareRow['type'], { label: string; className: string }> = {
  same: { label: '동일 → 갱신', className: 'bg-gray-100 text-gray-700' },
  similar: { label: '비슷한 이름', className: 'bg-yellow-100 text-yellow-800' },
  new: { label: '새 자재', className: 'bg-blue-100 text-blue-800' },
  existingOnly: { label: '기존에만 있음', className: 'bg-red-100 text-red-800' },
};

// PR-257: 겉감 짝(제안) 행은 일반 "비슷한 이름" 배지 대신 별도 배지로 보여 준다.
export const OUTER_PAIR_BADGE = { label: '겉감 짝(제안)', className: 'bg-purple-100 text-purple-800' };
export const OUTER_PAIR_NOTE = '엑셀의 겉감 행과 작지의 겉감 행을 한 쌍으로 제안합니다. 기본은 기존 겉감 행에 합치기(자재명·구분은 바뀌지 않고 혼용률만 규칙에 따라 반영)이며, 합치지 않으려면 "새 자재로 추가"를 고르세요(겉감이 두 줄이 됩니다).';

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 자재명세와 비교" 화면. 기본 선택은
// "새 인식 우선"(사용자 확정 요구사항) — ① 새 인식에 없는 기존 행은 기본 삭제(단,
// 발주·입고 연결로 삭제 불가면 유지로 고정) ② 비슷한 이름 행은 기본 새 자재로 추가
// (합치기는 사람이 선택) ③ 정규화 일치(same)는 기본 갱신. 삭제가 기본값이라 안전장치를
// 그대로 둔다: 연결된 행은 선택 자체를 막고, 수동/확정값이 있는 행은 체크 확인 전에는
// 삭제가 적용되지 않는다.
export function SalesOrderBomCompareStep({ styleNo, rows, overview, saving, onCancel, onConfirm }: SalesOrderBomCompareStepProps) {
  const draftRows = useMemo(() => buildDraftRows(rows), [rows]);
  const [decisions, setDecisions] = useState<SalesOrderBomCompareDecisionMap>(() => buildDefaultDecisions(draftRows));
  const [confirmedRiskyKeys, setConfirmedRiskyKeys] = useState<Set<string>>(new Set());
  // PR-246: 행별 혼용률 선택(새 값으로 바꾸기 / 채우기 해제). 기본은 비어 있음 = 서버 기본 규칙.
  const [compositionChoices, setCompositionChoices] = useState<CompositionChoiceMap>(new Map());
  // PR-249: 오더개요 항목별 "새 값 사용" 선택(기본은 모두 기존 값 유지).
  const [overviewUseNew, setOverviewUseNew] = useState<Set<string>>(new Set());

  const summary = summarizeDecisions(draftRows, decisions);
  const risky = riskyDeleteRows(draftRows, decisions);
  const riskyKeys = new Set(risky.map((r) => r.key));
  const compositionOverwriteCount = countCompositionOverwrites(draftRows, decisions, compositionChoices);
  const overviewOverwriteCount = countOverviewOverwrites(overview, overviewUseNew);
  // PR-261 보강: 기존 겉감 계열 2줄 이상 + 새 겉감 — 기존 겉감 행은 기본 유지(buildDraftRows)하고, 안내와 저장 확인창으로 알린다.
  const outerDuplicate = detectOuterDuplicate(rows);
  const outerAfterSave = countOuterAfterSave(draftRows, decisions);

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
    const deleteNames =
      summary.delete > 0
        ? draftRows
            .filter(({ key, row }) => row.type === 'existingOnly' && (decisions.existing.get(key) ?? defaultExistingDecisionFor(row)) === 'delete')
            .map(({ row }) => row.existing?.itemName ?? '')
            .filter(Boolean)
        : [];
    // 삭제만 있을 때는 기존 문구 그대로, 오더개요·혼용률 교체가 있으면 그 줄을 앞에 덧붙인다(없으면 확인창 없음).
    const baseMessage = buildCompareConfirmMessage({ deleteNames, compositionOverwriteCount, overviewOverwriteCount });
    // 겉감 중복 상태에서 새 겉감 행이 추가되면 다른 확인 사항이 없어도 확인창을 띄운다 — 확인하지 않으면 저장되지 않는다.
    const confirmMessage = withOuterDuplicateConfirm(baseMessage, outerDuplicate, outerAfterSave);
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const overwriteOrderFields = buildOverwriteOrderFields(overview, overviewUseNew);
    onConfirm(buildCommitDecisionsPayload(draftRows, decisions, compositionChoices), overwriteOrderFields.length > 0 ? overwriteOrderFields : undefined);
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

      {/* PR-263: 기존 겉감 1줄 + 새 겉감 0줄. 2줄 이상이면 아래 중복 안내만 보인다(안내는 한 번). */}
      {!outerDuplicate.active && isOuterMissingInIncoming(outerDuplicate) && (
        <div className="border-2 border-red-400 bg-red-50 rounded p-3 text-sm text-red-800" data-testid="outer-missing-notice">
          <p className="font-semibold">⚠ {OUTER_MISSING_NOTICE}</p>
        </div>
      )}

      {outerDuplicate.active && (
        <div className="border-2 border-red-400 bg-red-50 rounded p-3 text-sm text-red-800" data-testid="outer-duplicate-notice">
          <p className="font-semibold">⚠ {formatOuterDuplicateNotice(outerDuplicate)}</p>
          {outerAfterSave.added > 0 && <p className="mt-1" data-testid="outer-duplicate-add-notice">{formatOuterDuplicateAddNotice(outerAfterSave)}</p>}
        </div>
      )}

      {overview && overview.some((r) => r.status !== 'incomingEmpty' || r.existing != null) && (
        <OrderOverviewSection
          rows={overview}
          useNew={overviewUseNew}
          onToggle={(field) => setOverviewUseNew((prev) => toggleOverviewUseNew(prev, field))}
        />
      )}

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
              const isOuterPair = row.type === 'similar' && row.outerFabricPair === true;
              const badge = isOuterPair ? OUTER_PAIR_BADGE : TYPE_BADGE[row.type];
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
                        {isOuterPair && (
                          <div className="text-xs text-gray-700" data-testid={`outer-pair-incoming-${key}`}>
                            구분 {row.incoming.category ?? '-'} · 혼용률 {row.incoming.composition?.trim() || '미기재'}
                          </div>
                        )}
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
                        {isOuterPair && (
                          <div className="text-xs text-gray-700" data-testid={`outer-pair-existing-${key}`}>
                            구분 {row.existing.category ?? '-'} · 혼용률 {row.existing.composition?.trim() || '미기재'}
                          </div>
                        )}
                        {compositionTargetsExisting(row, decisions.incoming.get(key)) && (
                          <CompositionCell
                            rowKey={key}
                            row={row}
                            choice={compositionChoices.get(key)}
                            onToggle={(choice) => setCompositionChoices((prev) => toggleCompositionChoice(prev, key, choice))}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.type === 'same' && <span className="text-xs text-gray-500">갱신(자동)</span>}
                    {row.type === 'new' && <span className="text-xs text-gray-500">새 자재로 추가(자동)</span>}
                    {row.type === 'similar' && (
                      <div className="space-y-1">
                        <select
                          aria-label="합치기/새 자재로 추가"
                          className="border rounded px-2 py-1 text-xs"
                          value={decisions.incoming.get(key) ?? defaultIncomingDecisionFor(row)}
                          onChange={(e) => setIncoming(key, e.target.value as IncomingDecision)}
                        >
                          <option value="add">새 자재로 추가</option>
                          <option value="mergeInto">합치기(기존 행에)</option>
                        </select>
                        {isOuterPair && <div className="text-xs text-purple-800 max-w-xs" data-testid={`outer-pair-note-${key}`}>{OUTER_PAIR_NOTE}</div>}
                      </div>
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


// PR-246: 매칭된 기존 행의 혼용률 상태 표시 — fillEmpty(기본 채움, 해제 가능) / differs(기본 유지,
// "새 값으로 바꾸기" 작은 버튼, 되돌리기 가능) / same·incomingEmpty(변화 없음).
export function CompositionCell({
  rowKey,
  row,
  choice,
  onToggle,
}: {
  rowKey: string;
  row: SalesOrderBomCompareRow;
  choice: 'overwrite' | 'skip' | undefined;
  onToggle: (choice: 'overwrite' | 'skip') => void;
}) {
  const status = row.compositionStatus;
  if (!status) return null;
  const testId = `composition-status-${rowKey}`;
  if (status === 'same' || status === 'incomingEmpty') {
    return (
      <div className="mt-1 text-xs text-gray-500" data-testid={testId}>
        혼용률: 변화 없음{status === 'incomingEmpty' ? '(새 값 비어 있음 — 기존 값 유지)' : ''}
      </div>
    );
  }
  if (status === 'fillEmpty') {
    const skipped = choice === 'skip';
    return (
      <div className="mt-1 text-xs text-green-700" data-testid={testId}>
        {skipped ? '혼용률: 채우지 않음(해제됨)' : `기존 값이 비어 있어 새 값으로 채웁니다: ${row.incomingComposition}`}
        <button
          type="button"
          onClick={() => onToggle('skip')}
          className="ml-2 px-1.5 py-0.5 rounded border border-green-600 text-green-700 hover:bg-green-50"
        >
          {skipped ? '다시 채우기' : '채우지 않기'}
        </button>
      </div>
    );
  }
  const overwrite = choice === 'overwrite';
  return (
    <div className="mt-1 text-xs" data-testid={testId}>
      <div className="text-gray-700">기존 혼용률: <b>{row.existingComposition}</b></div>
      <div className={overwrite ? 'text-orange-700' : 'text-gray-700'}>새 혼용률: <b>{row.incomingComposition}</b></div>
      <div className="text-gray-500">{overwrite ? '새 값으로 바꿉니다' : '기존 값을 유지합니다(기본)'}</div>
      <button
        type="button"
        onClick={() => onToggle('overwrite')}
        className={`mt-0.5 px-1.5 py-0.5 rounded border ${overwrite ? 'border-gray-400 text-gray-700 hover:bg-gray-50' : 'border-orange-600 text-orange-700 hover:bg-orange-50'}`}
      >
        {overwrite ? '되돌리기' : '새 값으로 바꾸기'}
      </button>
    </div>
  );
}


// PR-249: 오더개요 항목별 비교 — fillEmpty(비어 있어 채움) / differs(기존·새 값 나란히, 두 버튼, 기본 "기존 값 유지",
// 되돌릴 수 있음) / same·incomingEmpty(변화 없음). 값은 가공하지 않고 그대로 보여 준다.
export function OrderOverviewSection({
  rows,
  useNew,
  onToggle,
}: {
  rows: OrderOverviewCompareRow[];
  useNew: ReadonlySet<string>;
  onToggle: (field: string) => void;
}) {
  const shown = rows.filter((r) => r.status !== 'incomingEmpty' || r.existing != null);
  return (
    <div className="border rounded p-3 bg-gray-50" data-testid="order-overview-compare">
      <h5 className="text-sm font-semibold mb-1">오더개요 비교 (기존 스타일)</h5>
      <p className="text-xs text-gray-500 mb-2">
        비어 있는 항목은 새 값으로 채워지고, 값이 다른 항목은 기본으로 기존 값을 유지합니다. 바꾸려면 항목마다 "새 값 사용"을 눌러 주세요.
      </p>
      <table className="text-sm">
        <tbody>
          {shown.map((r) => {
            const chosenNew = useNew.has(r.field);
            return (
              <tr key={r.field} className="align-top" data-testid={`order-overview-${r.field}`}>
                <td className="pr-3 py-1 font-medium whitespace-nowrap">{orderOverviewLabel(r.field)}</td>
                <td className="py-1">
                  {r.status === 'same' && <span className="text-xs text-gray-500">변화 없음 ({String(r.existing)})</span>}
                  {r.status === 'incomingEmpty' && (
                    <span className="text-xs text-gray-500">변화 없음(새 값 비어 있음 — 기존 값 {String(r.existing)} 유지)</span>
                  )}
                  {r.status === 'fillEmpty' && <span className="text-xs text-green-700">비어 있어 새 값으로 채웁니다: {String(r.incoming)}</span>}
                  {r.status === 'differs' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        기존 <b>{String(r.existing)}</b>
                      </span>
                      <span>→</span>
                      <span>
                        새 <b>{String(r.incoming)}</b>
                      </span>
                      <span className="inline-flex rounded border overflow-hidden">
                        <button
                          type="button"
                          aria-pressed={!chosenNew}
                          onClick={() => chosenNew && onToggle(r.field)}
                          className={`px-2 py-0.5 ${!chosenNew ? 'bg-gray-700 text-white' : 'bg-white text-gray-700'}`}
                        >
                          기존 값 유지
                        </button>
                        <button
                          type="button"
                          aria-pressed={chosenNew}
                          onClick={() => !chosenNew && onToggle(r.field)}
                          className={`px-2 py-0.5 border-l ${chosenNew ? 'bg-orange-600 text-white' : 'bg-white text-gray-700'}`}
                        >
                          새 값 사용
                        </button>
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
