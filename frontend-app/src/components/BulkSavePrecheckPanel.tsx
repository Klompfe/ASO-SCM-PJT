import {
  summarizePrecheck,
  formatPrecheckHeadline,
  selectNewTargets,
  nextChangedIndex,
  KIND_LABEL,
  type PrecheckEntry,
  type PrecheckKind,
} from '../utils/bulkSavePrecheck';

const BADGE_CLASS: Record<PrecheckKind, string> = {
  new: 'bg-blue-100 text-blue-800',
  unchanged: 'bg-gray-100 text-gray-700',
  changed: 'bg-yellow-100 text-yellow-800',
  needsCheck: 'bg-red-100 text-red-800',
};

interface Props {
  entries: PrecheckEntry[];
  running: boolean;
  // 점검 중 진행(완료 수 / 전체 수).
  progress: { done: number; total: number };
  savedIndexes: ReadonlySet<number>;
  // 신규 일괄 저장에서 건너뛰었거나 실패한 스타일의 사유(index → 문구).
  notes: ReadonlyMap<number, string>;
  saving: boolean;
  onSaveNew: () => void;
  onOpenCompare: (index: number) => void;
  onClose: () => void;
}

// PR-250: 일괄 저장 사전 점검 표 — 닫으면 아무것도 저장되지 않는다. 저장 버튼은 신규에만, 변경 있음은 개별 비교 화면으로.
export function BulkSavePrecheckPanel({ entries, running, progress, savedIndexes, notes, saving, onSaveNew, onOpenCompare, onClose }: Props) {
  const summary = summarizePrecheck(entries);
  const newTargets = selectNewTargets(entries, savedIndexes);
  const nextChanged = nextChangedIndex(entries, savedIndexes);
  return (
    <div className="space-y-3" data-testid="bulk-precheck">
      <div>
        <h4 className="text-lg font-bold">일괄 저장 사전 점검</h4>
        {running ? (
          <p className="text-sm text-gray-600 mt-1" data-testid="bulk-precheck-running">
            기존 자재명세와 비교하는 중... ({progress.done}/{progress.total})
          </p>
        ) : (
          <p className="text-sm text-gray-700 mt-1" data-testid="bulk-precheck-headline">{formatPrecheckHeadline(summary)}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          신규 스타일만 일괄 저장됩니다. 변경 있음은 한 건씩 비교 화면에서 확인한 뒤 저장하고, 변경 없음은 저장하지 않으며, 확인 필요는 개별로 처리해 주세요.
          이 표를 닫으면 아무것도 저장되지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSaveNew}
          disabled={running || saving || newTargets.length === 0}
          className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
        >
          {saving ? '저장 중...' : `신규 ${newTargets.length}건 저장`}
        </button>
        <button
          type="button"
          onClick={() => nextChanged != null && onOpenCompare(nextChanged)}
          disabled={running || saving || nextChanged == null}
          className="px-4 py-2 rounded border text-sm disabled:opacity-50"
        >
          다음 변경 건 열기
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded border text-gray-700 text-sm">
          닫기(저장 안 함)
        </button>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">스타일</th>
              <th className="px-3 py-2 text-left">분류</th>
              <th className="px-3 py-2 text-left">내용</th>
              <th className="px-3 py-2 text-left">동작</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const saved = savedIndexes.has(e.index);
              const note = notes.get(e.index);
              return (
                <tr key={e.index} className="border-t align-top" data-testid={`bulk-precheck-row-${e.index}`}>
                  <td className="px-3 py-2">{e.styleNo ?? `#${e.index + 1}`}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${BADGE_CLASS[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {e.summary}
                    {note && <div className="text-red-700 mt-0.5">{note}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {saved && <span className="text-xs text-green-700">저장됨</span>}
                    {!saved && e.kind === 'changed' && (
                      <button
                        type="button"
                        onClick={() => onOpenCompare(e.index)}
                        disabled={running || saving}
                        className="px-2 py-1 rounded border text-xs disabled:opacity-50"
                      >
                        비교하고 저장
                      </button>
                    )}
                    {!saved && e.kind === 'new' && <span className="text-xs text-gray-500">위 "신규 저장"으로 저장</span>}
                    {!saved && e.kind === 'unchanged' && <span className="text-xs text-gray-500">저장 안 함</span>}
                    {!saved && e.kind === 'needsCheck' && <span className="text-xs text-gray-500">개별 확인 필요</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
