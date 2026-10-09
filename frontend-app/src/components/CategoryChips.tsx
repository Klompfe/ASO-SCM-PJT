import React, { useEffect, useState } from 'react';
import { getMaterialCategories, type MaterialCategory } from '../api/materialCategories.service';
import { activeCategories, toggleCategoryId } from '../utils/materialCategories';

// PR-183: 공급업체 "취급 품목군" 다중 선택 칩. 활성 품목군만, 서버 정렬(sortOrder) 순서로 보여준다.
// 기존 MainItemsPicker(품목 검색)를 대체한다. SuppliersManager와 SupplierQuickCreateModal이 함께 쓴다.
export const CategoryChips: React.FC<{
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  ariaLabel: string;
}> = ({ selectedIds, onChange, ariaLabel }) => {
  const [options, setOptions] = useState<MaterialCategory[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getMaterialCategories()
      .then((res) => {
        if (!alive) return;
        const list: MaterialCategory[] = Array.isArray(res) ? res : (res?.data ?? []);
        setOptions(activeCategories(list));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col" role="group" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-2">
        {options.map((c) => {
          const on = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleCategoryId(selectedIds, c.id))}
              className={`text-xs px-3 py-1 rounded-full border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'}`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      {failed && <span className="text-xs text-red-600 mt-1">품목군 목록을 불러오지 못했습니다.</span>}
      {!failed && options.length === 0 && <span className="text-xs text-gray-400 mt-1">등록된 품목군이 없습니다. 품목군 관리에서 추가하세요.</span>}
      <span className="text-xs text-gray-500 mt-1">예: 실을 취급하는 업체라면 &apos;실&apos;을 선택하세요.</span>
    </div>
  );
};
