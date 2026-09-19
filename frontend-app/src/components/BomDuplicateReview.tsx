import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getDuplicateBoms, setActiveBom } from '../api/boms.service';
import { getErrorMessage } from '../utils/errorMessage';
import {
  currentBomId,
  isSelectionUnchanged,
  markDifferences,
  splitByReview,
  summarizeBoms,
  type DuplicateBomStyle,
} from '../utils/bomDuplicateReview';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
const th = 'border border-gray-300 px-2 py-1 bg-gray-100 text-left text-xs';
const td = 'border border-gray-300 px-2 py-1 text-xs';

interface StyleCardProps {
  style: DuplicateBomStyle;
  selectedId: number;
  saving: boolean;
  onSelect: (id: number) => void;
  onSave: () => void;
}

const StyleCard: React.FC<StyleCardProps> = ({ style, selectedId, saving, onSelect, onSave }) => {
  const nameMarks = markDifferences(style.boms, 'name'); // 실질 내용(이름·소요량)이 다른 행
  const recordMarks = markDifferences(style.boms, 'record'); // 자재 마스터 레코드까지 다른 행
  const summaries = summarizeBoms(style);
  const unchanged = isSelectionUnchanged(style, selectedId);

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white" data-testid={`dup-style-${style.styleNo}`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h4 className="font-semibold text-gray-900 font-mono">{style.styleNo}</h4>
        <span className="text-xs text-gray-500">BOM {style.bomCount}건</span>
        {!style.sameByName && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">구성이 서로 다름</span>}
        {style.identical && <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">내용 동일</span>}
        {!style.identical && style.sameByName && (
          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800" title="같은 자재가 줄바꿈/공백만 다른 이름으로 여러 번 등록되어, BOM마다 서로 다른 자재 마스터(Item) 레코드를 가리킵니다.">
            이름·소요량은 같고 자재 마스터 레코드만 다름
          </span>
        )}
        {style.activeCount !== 1 && <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">활성 BOM {style.activeCount}건 — 하나를 선택하세요</span>}
      </div>

      <div className="overflow-x-auto">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${style.boms.length}, minmax(440px, 1fr))` }}>
          {style.boms.map((b) => {
            const s = summaries.find((x) => x.bomId === b.id)!;
            const diff = nameMarks.get(b.id) ?? new Set<number>();
            const otherMaster = recordMarks.get(b.id) ?? new Set<number>();
            const selected = selectedId === b.id;
            return (
              <div key={b.id} className={`border rounded p-2 ${selected ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'}`} data-testid={`dup-bom-${b.id}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-1">
                  <input type="radio" name={`active-${style.styleNo}`} checked={selected} onChange={() => onSelect(b.id)} aria-label={`BOM #${b.id} 사용`} />
                  <span className="text-sm font-semibold whitespace-nowrap">BOM #{b.id}</span>
                  <span className="text-xs text-gray-500">{b.bomNo} · {b.version}</span>
                  {b.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 whitespace-nowrap">현재 사용중</span>}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  항목 {s.itemCount}개 · 소요량 합 {fmt(s.consumptionSum)}
                  {s.differingItemCount > 0 && <span className="text-red-600 font-semibold"> · 다른 행 {s.differingItemCount}개</span>}
                </p>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0">
                      <tr>
                        <th className={th}>자재</th>
                        <th className={th}>카테고리</th>
                        <th className={th}>색상/규격</th>
                        <th className={`${th} text-right whitespace-nowrap`}>소요량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.items.map((i) => (
                        <tr key={i.id} className={diff.has(i.id) ? 'bg-yellow-100' : otherMaster.has(i.id) ? 'bg-blue-50' : ''} title={`${i.materialCode} (자재 #${i.materialId ?? '-'})`}>
                          <td className={td}>{i.materialName}</td>
                          <td className={td}>{i.category || '-'}</td>
                          <td className={td}>{[i.colorCode, i.spec].filter(Boolean).join(' / ') || '-'}</td>
                          <td className={`${td} text-right whitespace-nowrap`}>{fmt(i.consumption)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || unchanged}
          className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? '저장 중...' : `BOM #${selectedId} 사용으로 저장`}
        </button>
        {unchanged && <span className="text-xs text-gray-500">이미 이 BOM을 사용 중입니다.</span>}
      </div>
    </div>
  );
};

// PR-121: BOM 중복 검토 — 한 스타일에 BOM이 2건 이상이면 나란히 비교하고, 앞으로 BOM 소요명세서에서 쓸 BOM을 고른다.
export const BomDuplicateReview: React.FC = () => {
  const [styles, setStyles] = useState<DuplicateBomStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [savingStyle, setSavingStyle] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDuplicateBoms();
      const list: DuplicateBomStyle[] = Array.isArray(res) ? res : [];
      setStyles(list);
      setSelection(Object.fromEntries(list.map((s) => [s.styleNo, currentBomId(s)])));
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'BOM 중복 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (styleNo: string) => {
    setSavingStyle(styleNo);
    try {
      await setActiveBom(styleNo, selection[styleNo]);
      toast.success(`${styleNo}: BOM #${selection[styleNo]}을(를) 사용하도록 저장했습니다.`);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '저장에 실패했습니다. (MANAGER/ADMIN 권한이 필요합니다)'));
    } finally {
      setSavingStyle(null);
    }
  };

  const { needsReview, identical } = splitByReview(styles);
  const card = (s: DuplicateBomStyle) => (
    <StyleCard key={s.styleNo} style={s} selectedId={selection[s.styleNo]} saving={savingStyle === s.styleNo} onSelect={(id) => setSelection((p) => ({ ...p, [s.styleNo]: id }))} onSave={() => save(s.styleNo)} />
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">BOM 중복 검토</h3>
        <p className="text-sm text-gray-500 mt-1">
          같은 스타일에 BOM이 여러 건 있으면 BOM 소요명세서는 <b>사용 중(활성)인 BOM</b> 하나만 계산에 씁니다. 구성이 서로 다른 중복은 아래에서 나란히 비교해 올바른 쪽을 선택해 주세요.
          노란 행은 다른 BOM과 자재/소요량이 다른 행, 연한 파란 행은 이름·소요량은 같지만 자재 마스터 레코드만 다른 행입니다.
        </p>
      </div>

      {loading && <div className="p-4 text-gray-500">불러오는 중...</div>}
      {!loading && styles.length === 0 && <p className="text-sm text-gray-500">BOM이 중복된 스타일이 없습니다.</p>}
      {!loading && styles.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3" data-testid="dup-summary">
            {[
              ['BOM 중복 스타일', `${styles.length}개`],
              ['검토 필요(구성 다름/활성 ≠ 1)', `${needsReview.length}개`],
              ['내용이 같은 중복', `${identical.length}개`],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold mt-1 text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {needsReview.length > 0 && <h4 className="text-sm font-semibold text-red-700">검토가 필요한 스타일 ({needsReview.length})</h4>}
          {needsReview.map(card)}

          {identical.length > 0 && (
            <details className="border border-gray-200 rounded-lg" data-testid="dup-identical">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700">내용이 완전히 같은 중복 ({identical.length}개 스타일) — 검토 불필요</summary>
              <div className="p-4 space-y-4">{identical.map(card)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
};
