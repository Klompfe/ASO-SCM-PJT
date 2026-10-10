import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getThreadTapeCandidates,
  classifyThreadTape,
  type ThreadTapeCandidate,
} from '../api/items.service';
import { getMaterialPackagingUnitRules, type MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';
import { getErrorMessage } from '../utils/errorMessage';

type ReviewedFilter = 'false' | 'true' | 'all';

// PR-186 D: 실/테이프로 보이는 자재(looksLikeThreadOrTape)는 규칙 테이블에 정확히 1개
// 매칭되면 추천값을 함께 보여준다 — 하지만 자동으로 확정하지 않는다("하지 말 것: 자동
// 확정 금지"). 사람이 추천을 확인/수정하고 "선택 적용"을 눌러야 저장된다(classifyThreadTape,
// all-or-nothing). "실/테이프 아님"으로 확정하려면 종류를 "- 없음 -"으로 둔 채 적용하면 된다
// (packagingReviewedAt만 채워지고, 다음부터 이 후보 목록에 다시 뜨지 않는다).
export const ThreadTapeClassificationManager: React.FC = () => {
  const [filter, setFilter] = useState<ReviewedFilter>('false');
  const [candidates, setCandidates] = useState<ThreadTapeCandidate[]>([]);
  const [rules, setRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 품목ID → 선택한 종류('' = 미지정/실·테이프 아님). 추천이 있으면 기본값으로 미리 채워두되,
  // 사람이 체크/선택한 항목만 적용 대상이 된다(selected).
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([getThreadTapeCandidates(filter), getMaterialPackagingUnitRules()]);
      const list = Array.isArray(cRes) ? cRes : ((cRes as any)?.data ?? []);
      setCandidates(list);
      setRules(Array.isArray(rRes) ? rRes : ((rRes as any)?.data ?? []));
      const nextDraft: Record<number, string> = {};
      const nextSelected: Record<number, boolean> = {};
      for (const c of list as ThreadTapeCandidate[]) {
        nextDraft[c.id] = c.materialSubType ?? c.suggestion?.materialSubType ?? '';
        nextSelected[c.id] = false;
      }
      setDraft(nextDraft);
      setSelected(nextSelected);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '실/테이프 후보 목록을 불러오는 데 실패했습니다.'));
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelected = (id: number, checked: boolean) => setSelected((s) => ({ ...s, [id]: checked }));
  const selectAllSuggested = () => {
    const next: Record<number, boolean> = { ...selected };
    for (const c of candidates) if (c.suggestion) next[c.id] = true;
    setSelected(next);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const applySelected = async () => {
    const assignments = candidates
      .filter((c) => selected[c.id])
      .map((c) => ({ itemId: c.id, materialSubType: draft[c.id] || null }));
    if (assignments.length === 0) {
      toast.error('적용할 항목을 선택해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await classifyThreadTape(assignments);
      toast.success(`${res.updated ?? assignments.length}건 적용되었습니다.`);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '일괄 적용에 실패했습니다. 선택 항목을 다시 확인해 주세요.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">실/테이프 종류 지정</h2>
      <p className="text-sm text-gray-500">
        자재명에 실(THREAD)/테이프(TAPE) 등이 포함돼 보수적으로 추려진 후보 목록입니다. 정확히 1개
        규칙과 매칭되면 추천값을 미리 채워두지만, 자동으로 확정하지 않습니다 — 확인 후 체크해서
        "선택 적용"을 눌러야 저장됩니다. BOM 자재명세에 종류를 지정한 행이 있으면 그 값이 우선하고,
        여기서 지정한 값은 BOM 행에 종류가 없는 경우에만 쓰입니다. "실/테이프 아님"으로 확정하려면
        종류를 "- 없음 -"으로 두고 적용하세요(다음부터 이 목록에 다시 뜨지 않습니다).
      </p>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          {(['false', 'true', 'all'] as ReviewedFilter[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded text-sm font-medium border ${filter === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              {v === 'false' ? '검토 안 함' : v === 'true' ? '검토 완료' : '전체'}
            </button>
          ))}
        </div>
        <button type="button" onClick={selectAllSuggested} className="text-sm text-blue-600 hover:underline">
          추천 있는 항목 전체 선택
        </button>
        <button
          type="button"
          onClick={applySelected}
          disabled={submitting || selectedCount === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 ml-auto"
        >
          선택 적용 ({selectedCount}건)
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left"></th>
                  <th className="px-4 py-2 text-left">코드</th>
                  <th className="px-4 py-2 text-left">자재명</th>
                  <th className="px-4 py-2 text-left">단위</th>
                  <th className="px-4 py-2 text-left">추천</th>
                  <th className="px-4 py-2 text-left">지정할 종류</th>
                  <th className="px-4 py-2 text-left">검토 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${c.name} 선택`}
                        checked={!!selected[c.id]}
                        onChange={(e) => toggleSelected(c.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 text-gray-500">{c.unit ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {c.suggestion ? `${c.suggestion.displayName} (${c.suggestion.reason})` : '추천 없음(직접 선택)'}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="border rounded px-2 py-1"
                        aria-label={`${c.name} 종류 선택`}
                        value={draft[c.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                      >
                        <option value="">- 없음(실/테이프 아님) -</option>
                        {rules.map((r) => (
                          <option key={r.materialSubType} value={r.materialSubType}>{r.displayName}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {c.materialSubType ? `지정됨(${c.materialSubType})` : c.packagingReviewedAt ? '검토완료(실/테이프 아님)' : '검토 안 함'}
                    </td>
                  </tr>
                ))}
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-400" data-testid="thread-tape-candidates-empty">
                      {filter === 'false' ? '검토할 후보가 없습니다.' : '해당 조건의 자재가 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
