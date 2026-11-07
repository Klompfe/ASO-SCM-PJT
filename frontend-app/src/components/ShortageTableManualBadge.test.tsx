import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ShortageTable } from './StyleShortagePanel';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';

// PR-231: [A] 부족자재 표 — 수동 지정된 자재는 "수동 지정 포함" 배지가 붙고, 전부
// 수동이면(basis='manual') 불일치/오독/비정상 요척 경고가 뜨지 않는다(서버가 애초에
// 그 필드들을 채우지 않으므로 — material-requirements.util.ts 참고, 프런트는 그대로
// 표시만 한다). ShortageTable은 표시 전용 컴포넌트라 정적 렌더로 검증 가능하다.
const baseRow: MaterialRequirementRow = {
  itemId: 1, itemCode: 'M1', itemName: '겉감', categories: ['겉감'], colors: [],
  consumptionPerUnit: 1, requiredQty: 50, orderedQty: 0, shortageQty: 50, lineCount: 1,
};

describe('ShortageTable — 수동 지정 배지/경고 숨김 (PR-231)', () => {
  it('basis가 manual이면 "수동 지정 포함" 배지가 보이고, mismatch/extremeConsumptionMismatch 경고는 없다', () => {
    const row: MaterialRequirementRow = {
      ...baseRow, basis: 'manual', hasManualOverride: true, computedQty: 200,
      // 서버가 수동 행에는 애초에 이 필드들을 채우지 않는다(undefined) — 그래도 명시적으로 넣어 회귀를 막는다.
      mismatch: undefined, extremeConsumptionMismatch: undefined, sheetQtyLooksLikeTotalQtyMisread: undefined,
    };
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row], onPick: vi.fn() }));
    expect(html).toContain('수동 지정 포함');
    expect(html).not.toContain('계산값(요척×기획수량');
    expect(html).not.toContain('요척이 비정상적으로 보입니다');
  });

  it('basis가 mixed이고 hasManualOverride가 true면 배지는 보이되, 다른 행의 경고는 그대로 보일 수 있다', () => {
    const row: MaterialRequirementRow = {
      ...baseRow, basis: 'mixed', hasManualOverride: true, mismatch: true, computedQty: 100, sheetQty: 80,
    };
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row], onPick: vi.fn() }));
    expect(html).toContain('수동 지정 포함');
    expect(html).toContain('계산값(요척×기획수량'); // mixed 자재의 비-수동 행에서 온 mismatch는 그대로 보인다.
  });

  it('hasManualOverride가 없으면(기존 자재) 배지가 보이지 않는다 — 회귀 확인', () => {
    const row: MaterialRequirementRow = { ...baseRow, basis: 'computed' };
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row], onPick: vi.fn() }));
    expect(html).not.toContain('수동 지정 포함');
  });
});
