import { useState } from 'react';
import {
  applyBulkComposition,
  selectFabricRowIndexes,
  countNonFabricSelected,
  formatBulkResult,
  cleanComposition,
  looksLikeAbbreviatedComposition,
  type CompositionRowLike,
} from '../utils/compositionReview';

export interface CompositionBulkItem extends CompositionRowLike {
  itemName?: string | null;
  colorCode?: string | null;
}

interface Props {
  items: CompositionBulkItem[];
  // 선택 불가(예: 저장에서 제외된 행) 인덱스.
  disabledIndexes?: Set<number>;
  // 채움이 일어난 뒤의 행 목록(composition 만 바뀜)을 부모 상태에 반영한다. 저장은 기존 저장 흐름.
  onApply: (nextItems: CompositionBulkItem[]) => void;
  testIdSuffix: string | number;
}

// PR-248: 한 스타일 안에서 선택한 행에 같은 혼용률을 채우는 작은 패널(새 엔드포인트 없음, 화면 상태만 변경).
// 이미 값이 있는 행은 건너뛰고, 값은 입력한 그대로 넣는다. 저장·진행을 막지 않는다.
export function CompositionBulkPanel({ items, disabledIndexes = new Set(), onApply, testIdSuffix }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const handleApply = () => {
    if (cleanComposition(value) == null || selected.size === 0) return;
    const nonFabric = countNonFabricSelected(items, selected);
    if (nonFabric > 0 && !window.confirm(`부자재 행 ${nonFabric}개가 포함돼 있습니다. 그래도 채울까요?`)) return;
    const result = applyBulkComposition(items, selected, value);
    onApply(result.rows);
    setMessage(formatBulkResult(result));
  };

  return (
    <div className="mt-2 text-sm" data-testid={`composition-bulk-${testIdSuffix}`}>
      <button type="button" className="text-xs underline text-blue-700" onClick={() => setOpen((v) => !v)}>
        {open ? '혼용률 일괄 입력 닫기' : '선택 행에 혼용률 채우기'}
      </button>
      {open && (
        <div className="mt-1 border rounded p-2 bg-gray-50 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-2 py-0.5 text-xs border rounded"
              onClick={() => setSelected(new Set([...selectFabricRowIndexes(items)].filter((i) => !disabledIndexes.has(i))))}
            >
              원단류 행 선택
            </button>
            <button type="button" className="px-2 py-0.5 text-xs border rounded" onClick={() => setSelected(new Set())}>
              선택 해제
            </button>
            <input
              className="border rounded px-2 py-0.5 text-xs w-64"
              placeholder="선택 행에 넣을 혼용률(입력한 그대로 저장)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="button"
              className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white disabled:bg-gray-400"
              disabled={selected.size === 0 || cleanComposition(value) == null}
              onClick={handleApply}
            >
              선택 {selected.size}행에 채우기
            </button>
          </div>
          {looksLikeAbbreviatedComposition(value) && (
            <div className="text-[10px] text-amber-700">약어 표기로 보입니다. 수입서류에 쓸 표기를 확인해 주세요</div>
          )}
          {message && <div className="text-xs text-green-700" data-testid={`composition-bulk-result-${testIdSuffix}`}>{message}</div>}
          <ul className="max-h-40 overflow-y-auto text-xs">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(i)} disabled={disabledIndexes.has(i)} onChange={() => toggle(i)} />
                <span className="text-gray-500 w-20 truncate">{item.category ?? '-'}</span>
                <span className="w-48 truncate">{item.itemName ?? ''}{item.colorCode ? ` / ${item.colorCode}` : ''}</span>
                <span className="text-gray-700">{cleanComposition(item.composition) ?? <em className="text-gray-400">미기재</em>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
