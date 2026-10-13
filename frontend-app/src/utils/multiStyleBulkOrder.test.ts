import { describe, it, expect } from 'vitest';
import {
  materialSubTypeLabel,
  resolveCategoryGroupKey,
  buildEditablePendingKey,
  buildEditableOrderByStyleItem,
  groupMultiStyleRequirements,
  resolveGroupBulkSupplierId,
  exceedsBulkCreateLimit,
  UNCATEGORIZED_LABEL,
  type MultiStyleRequirementResult,
} from './multiStyleBulkOrder';
import type { MaterialRequirementRow } from './bomRequirementReport';

const rules = [
  { materialSubType: 'COA_SA', displayName: '코아사' },
  { materialSubType: 'DADE', displayName: '다데' },
];

const baseRow = (overrides: Partial<MaterialRequirementRow>): MaterialRequirementRow => ({
  itemId: 1, itemCode: 'IT-1', itemName: '자재', categories: [], colors: [],
  consumptionPerUnit: 1, requiredQty: 10, orderedQty: 0, unlinkedOrderedQty: 0, shortageQty: 10, lineCount: 1,
  ...overrides,
});

describe('materialSubTypeLabel (PR-194)', () => {
  it('규칙에 있으면 displayName으로 바꾼다', () => {
    expect(materialSubTypeLabel('COA_SA', rules)).toBe('코아사');
  });
  it('규칙에 없으면 코드 자체를 그대로 돌려준다(추측 금지)', () => {
    expect(materialSubTypeLabel('UNKNOWN', rules)).toBe('UNKNOWN');
  });
  it('null/undefined는 null', () => {
    expect(materialSubTypeLabel(null, rules)).toBeNull();
    expect(materialSubTypeLabel(undefined, rules)).toBeNull();
  });
});

describe('resolveCategoryGroupKey (PR-194) — 품목군 키 규칙', () => {
  it('Item.category(itemCategoryName)이 있으면 그것을 1순위로 쓴다', () => {
    expect(resolveCategoryGroupKey(baseRow({ itemCategoryName: '원단류', categories: ['겉감'] }))).toBe('원단류');
  });
  it('itemCategoryName이 없으면 BOM 구분(categories[0])으로 폴백한다', () => {
    expect(resolveCategoryGroupKey(baseRow({ itemCategoryName: null, categories: ['겉감', '안감'] }))).toBe('겉감');
  });
  it('둘 다 없으면 미분류다', () => {
    expect(resolveCategoryGroupKey(baseRow({ itemCategoryName: null, categories: [] }))).toBe(UNCATEGORIZED_LABEL);
  });
});

describe('buildEditableOrderByStyleItem (PR-194)', () => {
  it('PENDING이고 styleNo가 있는 발주만 (styleNo,itemId) 키로 등록한다', () => {
    const orders = [
      { itemId: 1, styleNo: 'ST-A', status: 'PENDING' },
      { itemId: 2, styleNo: 'ST-A', status: 'RECEIVED' }, // 입고됨 — 제외
      { itemId: 3, styleNo: null, status: 'PENDING' }, // 스타일 미연결 — 제외
    ];
    const set = buildEditableOrderByStyleItem(orders as any);
    expect(set.has(buildEditablePendingKey('ST-A', 1))).toBe(true);
    expect(set.has(buildEditablePendingKey('ST-A', 2))).toBe(false);
    expect(set.size).toBe(1);
  });
});

describe('groupMultiStyleRequirements (PR-194)', () => {
  const results: MultiStyleRequirementResult[] = [
    {
      styleNo: 'ST-A', styleName: '스타일A', totalQty: 100, targetRdd: '2026-12-01',
      rows: [
        baseRow({ itemId: 1, itemName: '원단', itemCategoryName: '원단류', requiredQty: 100, orderedQty: 20, shortageQty: 80 }),
        baseRow({ itemId: 2, itemName: '재봉사', itemCategoryName: '부자재', materialSubType: 'COA_SA', requiredQty: 50, orderedQty: 0, shortageQty: 50 }),
      ],
    },
    {
      styleNo: 'ST-B', styleName: '스타일B', totalQty: 50, targetRdd: null,
      rows: [
        baseRow({ itemId: 1, itemName: '원단', itemCategoryName: '원단류', requiredQty: 60, orderedQty: 0, shortageQty: 60 }),
      ],
    },
    { styleNo: 'ST-ERR', styleName: null, totalQty: 0, targetRdd: null, rows: [], error: 'BOM이 없습니다.' },
  ];

  it('같은 품목군끼리 묶이고, 같은 품목은 스타일별 행으로 나뉜다', () => {
    const groups = groupMultiStyleRequirements(results, rules, new Set());
    expect(groups.map((g) => g.key)).toEqual(['부자재', '원단류']); // 가나다순 정렬
    const fabricGroup = groups.find((g) => g.key === '원단류')!;
    expect(fabricGroup.items).toHaveLength(1); // 품목 1개(원단)
    expect(fabricGroup.items[0].rows).toHaveLength(2); // 스타일 2개 행
    expect(fabricGroup.items[0].rows.map((r) => r.styleNo)).toEqual(['ST-A', 'ST-B']);
  });

  it('실/테이프 종류가 있으면 품목 그룹에 materialSubTypeLabel이 채워진다', () => {
    const groups = groupMultiStyleRequirements(results, rules, new Set());
    const threadGroup = groups.find((g) => g.key === '부자재')!;
    expect(threadGroup.items[0].materialSubTypeLabel).toBe('코아사');
  });

  it('에러난 스타일(BOM 없음 등)은 행 생성에서 제외된다', () => {
    const groups = groupMultiStyleRequirements(results, rules, new Set());
    const allStyleNos = groups.flatMap((g) => g.items.flatMap((i) => i.rows.map((r) => r.styleNo)));
    expect(allStyleNos).not.toContain('ST-ERR');
  });

  it('이미 미입고 발주가 있는 (스타일,품목) 행에는 hasEditablePending=true가 붙는다', () => {
    const pending = new Set([buildEditablePendingKey('ST-A', 1)]);
    const groups = groupMultiStyleRequirements(results, rules, pending);
    const fabricGroup = groups.find((g) => g.key === '원단류')!;
    const rowA = fabricGroup.items[0].rows.find((r) => r.styleNo === 'ST-A')!;
    const rowB = fabricGroup.items[0].rows.find((r) => r.styleNo === 'ST-B')!;
    expect(rowA.hasEditablePending).toBe(true);
    expect(rowB.hasEditablePending).toBe(false);
  });
});

describe('resolveGroupBulkSupplierId (PR-194) — 품목군 전체 일괄 지정', () => {
  it('품목군 내 모든 품목의 후보를 합쳐 정확히 1개면 그 값을 고른다', () => {
    expect(resolveGroupBulkSupplierId([[7], [7], []])).toBe(7);
  });
  it('후보가 2개 이상 섞이면 추측하지 않는다(null)', () => {
    expect(resolveGroupBulkSupplierId([[7], [8]])).toBeNull();
  });
  it('후보가 전혀 없으면 null', () => {
    expect(resolveGroupBulkSupplierId([[], []])).toBeNull();
  });
});

describe('exceedsBulkCreateLimit (PR-194)', () => {
  it('100건 이하면 false', () => {
    expect(exceedsBulkCreateLimit(100)).toBe(false);
  });
  it('100건 초과면 true', () => {
    expect(exceedsBulkCreateLimit(101)).toBe(true);
  });
});
