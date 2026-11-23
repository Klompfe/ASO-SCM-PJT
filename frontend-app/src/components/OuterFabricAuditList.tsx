import { useCallback, useEffect, useState } from 'react';
import { getOuterFabricAudit, type OuterFabricAuditResponse, type OuterFabricAuditStatus } from '../api/boms.service';
import {
  AUDIT_CATEGORY_HINT,
  AUDIT_EMPTY_MESSAGE,
  AUDIT_ERROR_MESSAGE,
  AUDIT_FILTER_OPTIONS,
  AUDIT_STATUS_BADGE,
  formatAuditSummary,
} from '../utils/outerFabricAudit';

type Filter = 'all' | OuterFabricAuditStatus;

interface ViewProps {
  loading: boolean;
  error: boolean;
  data: OuterFabricAuditResponse | null;
  filter: Filter;
  q: string;
  onFilterChange: (f: Filter) => void;
  onQChange: (q: string) => void;
  onSearch: () => void;
  onPage: (page: number) => void;
  onOpen: (styleNo: string) => void;
}

// PR-256: 겉감 혼용률 점검 목록(읽기 전용 표시 컴포넌트). 저장·수정·삭제·일괄 입력 버튼은 두지 않는다 — "열기"만 있다.
export function OuterFabricAuditView({ loading, error, data, filter, q, onFilterChange, onQChange, onSearch, onPage, onOpen }: ViewProps) {
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-3" data-testid="outer-fabric-audit">
      <p className="text-sm text-gray-600">
        완제품 재수입 세율 기준이 되는 겉감 혼용률이 없는 스타일을 모아 보여 줍니다(읽기 전용). "열기"로 해당 스타일의 BOM 조회로 이동해 겉감 행을 추가하거나 혼용률을 입력해 주세요.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm" data-testid="outer-fabric-audit-error">{AUDIT_ERROR_MESSAGE}</div>
      )}
      {!error && data && (
        <div className="text-sm font-semibold text-gray-800" data-testid="outer-fabric-audit-summary">{formatAuditSummary(data)}</div>
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
      </div>

      {loading && <div className="text-sm text-gray-500" data-testid="outer-fabric-audit-loading">불러오는 중...</div>}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="p-3 bg-green-50 border border-green-300 rounded text-green-800 text-sm" data-testid="outer-fabric-audit-empty">{AUDIT_EMPTY_MESSAGE}</div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
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
                {data.items.map((it) => (
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
            <button type="button" className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>이전</button>
            <span>{data.page} / {lastPage} 쪽 (현재 조건 {data.total}개)</span>
            <button type="button" className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={data.page >= lastPage} onClick={() => onPage(data.page + 1)}>다음</button>
          </div>
        </>
      )}
    </div>
  );
}

// PR-256: 데이터를 불러오는 컨테이너. 오류가 나면 data 를 비우고 오류 안내만 보여 "문제 없음"처럼 보이지 않게 한다.
export function OuterFabricAuditList({ onOpenStyle }: { onOpenStyle: (styleNo: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<OuterFabricAuditResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getOuterFabricAudit({ status: filter, q: appliedQ || undefined, page, pageSize: 50 });
      if (!res || !Array.isArray(res.items) || !res.counts) throw new Error('unexpected response');
      setData(res);
    } catch {
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, appliedQ, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <OuterFabricAuditView
      loading={loading}
      error={error}
      data={data}
      filter={filter}
      q={q}
      onFilterChange={(f) => { setFilter(f); setPage(1); }}
      onQChange={setQ}
      onSearch={() => { setAppliedQ(q.trim()); setPage(1); }}
      onPage={setPage}
      onOpen={onOpenStyle}
    />
  );
}
