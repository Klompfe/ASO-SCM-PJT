import { useCallback, useEffect, useRef, useState } from 'react';
import { getOuterFabricAudit, type OuterFabricAuditStatus } from '../api/boms.service';
import {
  AUDIT_CATEGORY_HINT,
  AUDIT_EMPTY_MESSAGE,
  AUDIT_ERROR_MESSAGE,
  AUDIT_FILTER_OPTIONS,
  AUDIT_NO_STYLES_MESSAGE,
  AUDIT_PAGE_SIZE,
  AUDIT_SEARCH_SCOPE_NOTE,
  AUDIT_STATUS_BADGE,
  AUDIT_SUSPECT_MESSAGE,
  AUDIT_UNAPPLIED_HINT,
  AUDIT_ZERO_STATUS_MESSAGE,
  createLatestGate,
  decideAuditScreen,
  formatAuditSummary,
  formatNoSearchResult,
  formatPageOverflow,
  runAuditLoad,
  type AuditLoadState,
  type AuditRequest,
} from '../utils/outerFabricAudit';

type Filter = 'all' | OuterFabricAuditStatus;

interface ViewProps {
  loading: boolean;
  error: boolean;
  data: AuditLoadState['data'];
  filter: Filter;
  q: string; // 검색칸에 입력 중인 값
  appliedQ?: string; // 지금 조회에 적용 중인 검색어
  page?: number; // 지금 요청한 쪽
  onFilterChange: (f: Filter) => void;
  onQChange: (q: string) => void;
  onSearch: () => void;
  onClearSearch?: () => void;
  onReload?: () => void;
  onPage: (page: number) => void;
  onOpen: (styleNo: string) => void;
}

const WARNING_BOX = 'p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm';
const NEUTRAL_BOX = 'p-3 bg-gray-50 border border-gray-300 rounded text-gray-800 text-sm';

// PR-256: 겉감 혼용률 점검 목록(읽기 전용 표시 컴포넌트). 저장·수정·삭제·일괄 입력 버튼은 두지 않는다.
// PR-262: 무엇을 보일지는 decideAuditScreen 한 곳에서 정한다 — 로딩·오류·의심 응답에는 숫자를 보이지 않고, 초록 안내는 확인된 "전부 완료"에만 나온다.
export function OuterFabricAuditView({ loading, error, data, filter, q, appliedQ = '', page = 1, onFilterChange, onQChange, onSearch, onClearSearch, onReload, onPage, onOpen }: ViewProps) {
  const request: AuditRequest = { status: filter, q: appliedQ, page, pageSize: AUDIT_PAGE_SIZE };
  const screen = decideAuditScreen({ loading, error, data, request });
  const ready = screen.kind === 'list' || screen.kind === 'empty' ? screen.data : null;
  const overall = ready?.overall;
  const lastPage = ready ? Math.max(1, Math.ceil(ready.total / ready.pageSize)) : 1;

  const reloadButton = (
    <button type="button" className="ml-2 px-2 py-0.5 text-xs rounded border border-red-400 bg-white text-red-700" onClick={onReload} data-testid="outer-fabric-audit-reload">
      다시 조회
    </button>
  );

  return (
    <div className="space-y-3" data-testid="outer-fabric-audit">
      <p className="text-sm text-gray-600">
        완제품 재수입 세율 기준이 되는 겉감 혼용률이 없는 스타일을 모아 보여 줍니다(읽기 전용). "열기"로 해당 스타일의 BOM 조회로 이동해 겉감 행을 추가하거나 혼용률을 입력해 주세요.
      </p>

      {screen.kind === 'error' && (
        <div className={WARNING_BOX} data-testid="outer-fabric-audit-error">{AUDIT_ERROR_MESSAGE}{reloadButton}</div>
      )}
      {screen.kind === 'suspect' && (
        <div className={`${WARNING_BOX} font-semibold`} data-testid="outer-fabric-audit-suspect">{AUDIT_SUSPECT_MESSAGE}{reloadButton}</div>
      )}
      {overall && (
        <div data-testid="outer-fabric-audit-summary">
          {/* 요약 첫 줄은 항상 검색·필터와 무관한 전체 기준이다. */}
          <div className="text-sm font-semibold text-gray-800">
            {formatAuditSummary({ styleCount: overall.total, counts: { noBom: overall.noBom, noRow: overall.noRow, blank: overall.blank, total: overall.noBom + overall.noRow + overall.blank } })}
          </div>
          {appliedQ !== '' && ready && (
            <div className="text-xs text-gray-700" data-testid="outer-fabric-audit-search-summary">
              검색 결과 중 점검 대상 {ready.counts.total}개 — 겉감 행 없음 {ready.counts.noRow} · 겉감 혼용률 비어 있음 {ready.counts.blank} · BOM 없음 {ready.counts.noBom}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className="border rounded px-2 py-1 text-sm" value={filter} onChange={(e) => onFilterChange(e.target.value as Filter)} data-testid="outer-fabric-audit-filter">
          {AUDIT_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-64"
          placeholder="스타일 번호·이름 검색"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          data-testid="outer-fabric-audit-search"
        />
        <button type="button" className="px-3 py-1 text-sm border rounded" onClick={onSearch}>검색</button>
        {appliedQ !== '' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-xs border border-blue-300" data-testid="outer-fabric-audit-chip">
            적용 중인 검색어: {appliedQ}
            <button type="button" aria-label="검색어 해제" className="font-bold" onClick={onClearSearch} data-testid="outer-fabric-audit-chip-clear">×</button>
          </span>
        )}
      </div>
      {q.trim() !== appliedQ && (
        <p className="text-xs text-amber-700" data-testid="outer-fabric-audit-unapplied">{AUDIT_UNAPPLIED_HINT}</p>
      )}

      {screen.kind === 'loading' && <div className="text-sm text-gray-500" data-testid="outer-fabric-audit-loading">불러오는 중...</div>}

      {screen.kind === 'empty' && screen.empty === 'allDone' && (
        <div className="p-3 bg-green-50 border border-green-300 rounded text-green-800 text-sm" data-testid="outer-fabric-audit-empty">{AUDIT_EMPTY_MESSAGE}</div>
      )}
      {screen.kind === 'empty' && screen.empty === 'noStyles' && (
        <div className={NEUTRAL_BOX} data-testid="outer-fabric-audit-no-styles">{AUDIT_NO_STYLES_MESSAGE}</div>
      )}
      {screen.kind === 'empty' && screen.empty === 'noSearchResult' && (
        <div className={NEUTRAL_BOX} data-testid="outer-fabric-audit-no-search-result">
          <div>{formatNoSearchResult(appliedQ)}</div>
          <div className="text-xs text-gray-600">{AUDIT_SEARCH_SCOPE_NOTE}</div>
        </div>
      )}
      {screen.kind === 'empty' && screen.empty === 'zeroStatus' && (
        <div className={NEUTRAL_BOX} data-testid="outer-fabric-audit-zero-status">{AUDIT_ZERO_STATUS_MESSAGE}</div>
      )}
      {screen.kind === 'empty' && screen.empty === 'pageOverflow' && (
        <div className={NEUTRAL_BOX} data-testid="outer-fabric-audit-page-overflow">
          {formatPageOverflow(page)}
          <button type="button" className="ml-2 px-2 py-0.5 text-xs rounded border" onClick={() => onPage(1)}>1쪽으로</button>
        </div>
      )}

      {screen.kind === 'list' && (
        <>
          <p className="text-xs text-gray-500">{AUDIT_CATEGORY_HINT}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm" data-testid="outer-fabric-audit-table">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">스타일</th>
                  <th className="border px-2 py-1 text-left">상태</th>
                  <th className="border px-2 py-1 text-right">겉감 행 / 전체 행</th>
                  <th className="border px-2 py-1 text-left">구분 값</th>
                  <th className="border px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {screen.data.items.map((it) => (
                  <tr key={it.styleNo} data-testid={`outer-fabric-audit-row-${it.styleNo}`}>
                    <td className="border px-2 py-1"><span className="font-mono">{it.styleNo}</span>{it.styleName ? <span className="ml-2 text-gray-600">{it.styleName}</span> : null}</td>
                    <td className="border px-2 py-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${AUDIT_STATUS_BADGE[it.status].className}`} data-testid={`outer-fabric-audit-badge-${it.styleNo}`}>
                        {AUDIT_STATUS_BADGE[it.status].label}
                      </span>
                    </td>
                    <td className="border px-2 py-1 text-right">{it.outerRowCount} / {it.totalRows}</td>
                    <td className="border px-2 py-1 text-xs text-gray-700">{it.categories.length > 0 ? it.categories.join(' · ') : '-'}</td>
                    <td className="border px-2 py-1 text-center">
                      <button type="button" className="px-2 py-0.5 text-xs rounded border border-blue-400 text-blue-700" onClick={() => onOpen(it.styleNo)} data-testid={`outer-fabric-audit-open-${it.styleNo}`}>열기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={screen.data.page <= 1} onClick={() => onPage(screen.data.page - 1)}>이전</button>
            <span>{screen.data.page} / {lastPage} 쪽 (현재 조건 {screen.data.total}개)</span>
            <button type="button" className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={screen.data.page >= lastPage} onClick={() => onPage(screen.data.page + 1)}>다음</button>
          </div>
        </>
      )}
    </div>
  );
}

// PR-256: 데이터를 불러오는 컨테이너. PR-262: 최신 요청의 응답만 반영하고, 새로 조회하는 동안·실패했을 때는 이전 숫자를 남기지 않는다.
export function OuterFabricAuditList({ onOpenStyle }: { onOpenStyle: (styleNo: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<AuditLoadState>({ loading: true, error: false, data: null, request: { status: 'all', q: '', page: 1, pageSize: AUDIT_PAGE_SIZE } });
  const gateRef = useRef(createLatestGate());

  const load = useCallback(() => {
    void runAuditLoad(
      gateRef.current,
      { status: filter, q: appliedQ, page, pageSize: AUDIT_PAGE_SIZE },
      (request) => getOuterFabricAudit({ status: request.status, q: request.q || undefined, page: request.page, pageSize: request.pageSize }),
      setState,
    );
  }, [filter, appliedQ, page]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // 조건이 바뀐 직후(효과 실행 전) 한 번의 렌더에는 이전 응답이 남아 있다 — 그동안은 로딩으로 보여 이전 숫자·오탐 경고가 스치지 않게 한다.
  const stale = state.request.status !== filter || state.request.q !== appliedQ || state.request.page !== page;

  return (
    <OuterFabricAuditView
      loading={state.loading || stale}
      error={state.error}
      data={state.data}
      filter={filter}
      q={q}
      appliedQ={appliedQ}
      page={page}
      onFilterChange={(f) => { setFilter(f); setPage(1); }}
      onQChange={setQ}
      onSearch={() => { setAppliedQ(q.trim()); setPage(1); setReloadKey((k) => k + 1); }}
      onClearSearch={() => { setQ(''); setAppliedQ(''); setPage(1); }}
      onReload={() => setReloadKey((k) => k + 1)}
      onPage={setPage}
      onOpen={onOpenStyle}
    />
  );
}
