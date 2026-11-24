import { useMemo, useRef, useState } from 'react';
import { checkOuterFabricSupplement, runOuterFabricSupplement, type ParsedStyleResult } from '../api/mapping.service';
import { runWithConcurrency } from '../utils/bulkSavePrecheck';
import {
  ABORT_NOTICE,
  DONE_HINT,
  FIRST_TIME_HINT,
  INTRO_TEXT,
  REASON_TEXT,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  buildConfirmMessage,
  buildSupplementRows,
  checkStateFromRunResult,
  describeRunResult,
  failedCheck,
  formatRunSummary,
  interpretCheckResponse,
  isSelectable,
  previewOuterRow,
  runSupplementQueue,
  runnableTargets,
  selectAllEligible,
  summarizeRun,
  toggleSelection,
  type RunResult,
  type RunSummary,
  type SupplementCheckState,
  type SupplementRow,
} from '../utils/outerFabricSupplement';

type StyleRow = SupplementRow<ParsedStyleResult>;

export interface SupplementViewProps {
  rows: StyleRow[];
  checking: boolean;
  checkProgress: { done: number; total: number } | null;
  running: boolean;
  runProgress: { done: number; total: number } | null;
  selected: ReadonlySet<string>;
  doneKeys: ReadonlySet<string>;
  runResults: ReadonlyMap<string, RunResult>;
  summary: RunSummary | null;
  aborted: boolean;
  confirming: boolean;
  onCheck: () => void;
  onRecheck: (key: string) => void;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onAsk: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onRetry: (key: string) => void;
}

// PR-259: "겉감 행 일괄 보충" 구역(표시 컴포넌트). 점검 결과는 화면 상태(메모리)에만 있다 — 저장소에 넣지 않는다.
export function OuterFabricSupplementView(p: SupplementViewProps) {
  const busy = p.checking || p.running;
  const anyChecked = p.rows.some((r) => r.check);
  const selectedCount = [...p.selected].filter((k) => p.rows.some((r) => r.key === k && isSelectable(r, p.doneKeys, k))).length;
  const selectedRows = p.rows.filter((r) => p.selected.has(r.key));
  return (
    <div className="border border-green-200 rounded p-3 space-y-3 bg-green-50/40" data-testid="outer-fabric-supplement">
      <h4 className="font-semibold text-gray-800">겉감 행 일괄 보충</h4>
      <p className="text-sm text-gray-700" data-testid="outer-fabric-supplement-intro">{INTRO_TEXT}</p>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={p.onCheck} disabled={busy} className="px-3 py-1.5 text-sm rounded border border-green-600 text-green-800 disabled:opacity-50" data-testid="outer-fabric-supplement-check">
          {p.checking && p.checkProgress ? `점검 중... (${p.checkProgress.done}/${p.checkProgress.total})` : '겉감 보충 점검'}
        </button>
        {anyChecked && (
          <>
            <button type="button" onClick={p.onSelectAll} disabled={busy} className="px-3 py-1.5 text-sm rounded border disabled:opacity-50">보충 가능 전체 선택</button>
            <button type="button" onClick={p.onClear} disabled={busy} className="px-3 py-1.5 text-sm rounded border disabled:opacity-50">선택 해제</button>
            <button
              type="button"
              onClick={p.onAsk}
              disabled={busy || selectedCount === 0}
              className="px-3 py-1.5 text-sm rounded bg-green-600 text-white disabled:opacity-50"
              data-testid="outer-fabric-supplement-run"
            >
              {p.running && p.runProgress ? `추가 중... (${p.runProgress.done}/${p.runProgress.total})` : `선택한 스타일에 겉감 행 추가${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </button>
          </>
        )}
      </div>

      {anyChecked && <p className="text-xs text-amber-800 font-medium" data-testid="outer-fabric-supplement-first-hint">{FIRST_TIME_HINT}</p>}

      {p.confirming && (
        <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2" data-testid="outer-fabric-supplement-confirm">
          <p className="text-sm">{buildConfirmMessage(selectedRows.length)}</p>
          <details className="text-xs text-gray-700">
            <summary className="cursor-pointer">스타일 번호 목록 ({selectedRows.length})</summary>
            <ul className="list-disc pl-5 mt-1">{selectedRows.map((r) => <li key={r.key} className="font-mono">{r.styleNo}</li>)}</ul>
          </details>
          <div className="flex gap-2">
            <button type="button" onClick={p.onConfirm} className="px-3 py-1.5 text-sm rounded bg-green-600 text-white">계속</button>
            <button type="button" onClick={p.onCancelConfirm} className="px-3 py-1.5 text-sm rounded border">취소</button>
          </div>
        </div>
      )}

      {p.aborted && <div className="p-2 bg-red-50 border border-red-300 text-red-700 text-sm rounded" data-testid="outer-fabric-supplement-aborted">{ABORT_NOTICE}</div>}

      {p.summary && (
        <div className="space-y-1" data-testid="outer-fabric-supplement-summary">
          <div className="text-sm font-semibold text-gray-800">{formatRunSummary(p.summary)}</div>
          {p.summary.added > 0 && <div className="text-xs text-green-800">{DONE_HINT}</div>}
        </div>
      )}

      {anyChecked && (
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm" data-testid="outer-fabric-supplement-table">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1" />
                <th className="border px-2 py-1 text-left">스타일</th>
                <th className="border px-2 py-1 text-left">상태</th>
                <th className="border px-2 py-1 text-left">추가될 겉감 행</th>
                <th className="border px-2 py-1 text-left">사유·안내</th>
                <th className="border px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => {
                const done = p.doneKeys.has(r.key);
                const result = p.runResults.get(r.key);
                const check = r.check;
                const preview = check?.status === 'eligible' ? previewOuterRow(r.style, check.outerRowIndex) : null;
                const canSelect = isSelectable(r, p.doneKeys, r.key);
                const failedRun = result && (result.kind === 'failed' || result.kind === 'serverError' || result.kind === 'notRun');
                return (
                  <tr key={r.key} data-testid={`outer-fabric-supplement-row-${r.key}`}>
                    <td className="border px-2 py-1 text-center">
                      <input type="checkbox" checked={p.selected.has(r.key)} disabled={busy || !canSelect} onChange={() => p.onToggle(r.key)} aria-label={`${r.styleNo} 선택`} />
                    </td>
                    <td className="border px-2 py-1 font-mono">{r.styleNo}</td>
                    <td className="border px-2 py-1">
                      {done ? (
                        <span className="text-xs px-2 py-0.5 rounded font-semibold bg-green-600 text-white" data-testid={`outer-fabric-supplement-badge-${r.key}`}>보충 완료</span>
                      ) : check ? (
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${STATUS_BADGE_CLASS[check.status]}`} data-testid={`outer-fabric-supplement-badge-${r.key}`}>{STATUS_LABEL[check.status]}</span>
                      ) : (
                        <span className="text-xs text-gray-400">점검 전</span>
                      )}
                    </td>
                    <td className="border px-2 py-1 text-xs text-gray-700">
                      {preview ? `구분 ${preview.category || '-'} · 자재명 ${preview.itemName} · 요척 ${preview.consumption}` : '-'}
                    </td>
                    <td className="border px-2 py-1 text-xs text-gray-700">
                      {result ? <div data-testid={`outer-fabric-supplement-result-${r.key}`}>{describeRunResult(result)}</div> : null}
                      {!result && check ? <div>{(check.reason && REASON_TEXT[check.reason]) || ''}{check.message ? <span className="text-gray-500"> ({check.message})</span> : null}</div> : null}
                    </td>
                    <td className="border px-2 py-1 text-center whitespace-nowrap">
                      {check?.status === 'needsCheck' && check.reason !== 'DUPLICATE' && !done && (
                        <button type="button" disabled={busy} onClick={() => p.onRecheck(r.key)} className="px-2 py-0.5 text-xs rounded border border-red-400 text-red-700 disabled:opacity-50">다시 점검</button>
                      )}
                      {failedRun && !done && (
                        <button type="button" disabled={busy} onClick={() => p.onRetry(r.key)} className="px-2 py-0.5 text-xs rounded border border-red-400 text-red-700 disabled:opacity-50">다시 시도</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// PR-259: 컨테이너 — 업로드 목록(parsedStyles)과 등록 여부(existsMap)를 받아 점검·순차 실행을 수행한다. 점검 결과·실행 결과는 이 컴포넌트의 메모리 상태뿐이다.
export function OuterFabricSupplementPanel({ styles, existsMap }: { styles: ParsedStyleResult[]; existsMap: Record<string, boolean> }) {
  const { checkable, duplicates } = useMemo(() => buildSupplementRows(styles, existsMap), [styles, existsMap]);
  const [checks, setChecks] = useState<Map<string, SupplementCheckState>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [runResults, setRunResults] = useState<Map<string, RunResult>>(new Map());
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [aborted, setAborted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busyRef = useRef(false); // 더블클릭·겹친 실행 방지(상태 갱신보다 먼저 막는다)

  const rows: StyleRow[] = useMemo(
    () => [...checkable.map((r) => ({ ...r, check: checks.get(r.key) })), ...duplicates],
    [checkable, duplicates, checks],
  );
  if (rows.length === 0) return null; // 이미 등록된 스타일이 없으면 구역을 그리지 않는다

  const setCheck = (key: string, state: SupplementCheckState) => setChecks((prev) => new Map(prev).set(key, state));

  const checkRows = async (targets: StyleRow[], withProgress: boolean) => {
    let done = 0;
    if (withProgress) setCheckProgress({ done: 0, total: targets.length });
    // 동시 호출 3개(PR-250 과 같은 방식). 한 스타일의 실패는 그 스타일만 "확인 필요"로 둔다.
    const outcomes = await runWithConcurrency(targets, 3, async (row) => {
      try {
        return await checkOuterFabricSupplement({ styleNo: row.styleNo, bomItems: row.style.bomItems ?? [] });
      } finally {
        done++;
        if (withProgress) setCheckProgress({ done, total: targets.length });
      }
    });
    setChecks((prev) => {
      const next = new Map(prev);
      targets.forEach((t, i) => next.set(t.key, outcomes[i].ok ? interpretCheckResponse(outcomes[i].value) : failedCheck()));
      return next;
    });
  };

  const handleCheck = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    setSummary(null);
    setAborted(false);
    setConfirming(false);
    setSelected(new Set()); // 점검을 다시 하면 선택은 항상 비어 있는 상태에서 시작한다(기본 선택 없음)
    setRunResults(new Map());
    try {
      await checkRows(checkable, true);
    } finally {
      setChecking(false);
      setCheckProgress(null);
      busyRef.current = false;
    }
  };

  const handleRecheck = async (key: string) => {
    if (busyRef.current) return;
    const row = checkable.find((r) => r.key === key);
    if (!row) return;
    busyRef.current = true;
    setChecking(true);
    try {
      await checkRows([row], false);
    } finally {
      setChecking(false);
      busyRef.current = false;
    }
  };

  // 순차 실행 — 서버 응답만 신뢰한다(점검 결과는 참고일 뿐, 서버가 트랜잭션 안에서 다시 판정).
  const execute = async (targets: StyleRow[]) => {
    if (targets.length === 0 || busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    setConfirming(false);
    setAborted(false);
    setSummary(null);
    setRunProgress({ done: 0, total: targets.length });
    try {
      const { outcomes, aborted: stopped } = await runSupplementQueue(
        targets,
        (row) => runOuterFabricSupplement({ styleNo: row.styleNo, bomItems: row.style.bomItems ?? [] }),
        (done, total, outcome) => {
          setRunProgress({ done, total });
          setRunResults((prev) => new Map(prev).set(outcome.row.key, outcome.result));
          if (outcome.result.kind === 'added') {
            setDoneKeys((prev) => new Set(prev).add(outcome.row.key));
            setSelected((prev) => { const n = new Set(prev); n.delete(outcome.row.key); return n; });
          } else {
            const next = checkStateFromRunResult(outcome.result);
            if (next) {
              setCheck(outcome.row.key, next);
              setSelected((prev) => { const n = new Set(prev); n.delete(outcome.row.key); return n; });
            }
          }
        },
      );
      setSummary(summarizeRun(outcomes.map((o) => o.result)));
      setAborted(stopped);
    } finally {
      setRunning(false);
      setRunProgress(null);
      busyRef.current = false;
    }
  };

  const handleConfirm = () => execute(runnableTargets(rows, selected, doneKeys));

  // 실패·확인 필요 행의 "다시 시도": 해당 스타일만 점검 → 보충 가능으로 나오면 실행(서버가 다시 판정).
  const handleRetry = async (key: string) => {
    if (busyRef.current) return;
    const row = checkable.find((r) => r.key === key);
    if (!row || doneKeys.has(key)) return;
    busyRef.current = true;
    setChecking(true);
    let state: SupplementCheckState;
    try {
      state = interpretCheckResponse(await checkOuterFabricSupplement({ styleNo: row.styleNo, bomItems: row.style.bomItems ?? [] }));
    } catch {
      state = failedCheck();
    }
    setCheck(key, state);
    setChecking(false);
    busyRef.current = false;
    if (state.status === 'eligible') await execute([{ ...row, check: state }]);
  };

  return (
    <OuterFabricSupplementView
      rows={rows}
      checking={checking}
      checkProgress={checkProgress}
      running={running}
      runProgress={runProgress}
      selected={selected}
      doneKeys={doneKeys}
      runResults={runResults}
      summary={summary}
      aborted={aborted}
      confirming={confirming}
      onCheck={handleCheck}
      onRecheck={handleRecheck}
      onToggle={(key) => setSelected((prev) => toggleSelection(prev, rows, doneKeys, key))}
      onSelectAll={() => setSelected(selectAllEligible(rows, doneKeys))}
      onClear={() => setSelected(new Set())}
      onAsk={() => setConfirming(true)}
      onConfirm={handleConfirm}
      onCancelConfirm={() => setConfirming(false)}
      onRetry={handleRetry}
    />
  );
}
