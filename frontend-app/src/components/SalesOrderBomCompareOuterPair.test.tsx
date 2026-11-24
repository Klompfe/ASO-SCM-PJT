import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SalesOrderBomCompareStep, OUTER_PAIR_BADGE, OUTER_PAIR_NOTE } from './SalesOrderBomCompareStep';
import {
  buildDraftRows,
  buildDefaultDecisions,
  defaultIncomingDecisionFor,
  buildCommitDecisionsPayload,
  summarizeDecisions,
} from '../utils/salesOrderBomCompareReview';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// PR-257: 겉감 짝(제안) 표시·기본 선택. jsdom 이 없어 클릭/선택 변경은 못 본다 — 초기 렌더와 순수 함수만 확인한다.
const existing = (overrides: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId: 11, itemName: '겉감 OUT-SHELL', englishName: null, category: '겉감 OUT-SHELL', colorCode: null, spec: null, consumption: 1, requiredQty: 120, unit: 'EA', remarks: null,
  composition: null, hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false, linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null, ...overrides,
});
const pairRow = (overrides: Partial<SalesOrderBomCompareRow> = {}): SalesOrderBomCompareRow => ({
  type: 'similar', incomingIndex: 0, outerFabricPair: true, existing: existing(),
  incoming: { itemName: '합성소재', category: '겉감', colorCode: 'NV', consumption: 1, requiredQty: 100, composition: 'WOOL 100%' },
  existingComposition: null, incomingComposition: 'WOOL 100%', compositionStatus: 'fillEmpty', ...overrides,
});
const plainSimilar = (): SalesOrderBomCompareRow => ({ ...pairRow(), outerFabricPair: undefined });
const render = (rows: SalesOrderBomCompareRow[]) =>
  renderToStaticMarkup(createElement(SalesOrderBomCompareStep, { styleNo: 'S-1', rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }));

describe('겉감 짝(제안) — 기본 선택 (PR-257)', () => {
  it('겉감 짝 similar 의 기본은 "기존 행에 합치기", 일반 similar 와 new 는 기존대로 "새 자재로 추가"', () => {
    expect(defaultIncomingDecisionFor(pairRow())).toBe('mergeInto');
    expect(defaultIncomingDecisionFor(plainSimilar())).toBe('add');
    expect(defaultIncomingDecisionFor({ type: 'new', incomingIndex: 1 })).toBe('add');
    expect(defaultIncomingDecisionFor({ type: 'same', incomingIndex: 2 })).toBe('update');
  });

  it('기본 선택으로 저장하면 합치기 결정이 서버로 간다(기존 겉감 행 id 지정), "새 자재로 추가"로 바꾸면 보내지 않는다', () => {
    const draft = buildDraftRows([pairRow()]);
    const defaults = buildDefaultDecisions(draft);
    expect(summarizeDecisions(draft, defaults)).toMatchObject({ mergeInto: 1, add: 0 });
    expect(buildCommitDecisionsPayload(draft, defaults)).toEqual({ incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 11 }] });

    const changed = { incoming: new Map(defaults.incoming).set(draft[0].key, 'add' as const), existing: defaults.existing };
    expect(summarizeDecisions(draft, changed)).toMatchObject({ mergeInto: 0, add: 1 });
    expect(buildCommitDecisionsPayload(draft, changed)).toBeUndefined();
  });

  it('겉감 짝으로 합칠 때 혼용률 기준 행으로 취급되어 "채우기/덮어쓰기" 선택 대상이 된다', () => {
    const draft = buildDraftRows([pairRow({ compositionStatus: 'differs', existingComposition: 'COTTON 100%' })]);
    const defaults = buildDefaultDecisions(draft);
    const payload = buildCommitDecisionsPayload(draft, defaults, new Map([[draft[0].key, 'overwrite' as const]]));
    expect(payload).toEqual({ incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 11, overwriteComposition: true }] });
  });
});

describe('SalesOrderBomCompareStep — 겉감 짝 표시 (PR-257)', () => {
  it('겉감 짝 행: 전용 배지·두 행의 구분·혼용률 나란히·안내 문구, 선택 기본값은 합치기, 요약은 합치기 1', () => {
    const html = render([pairRow()]);
    expect(html).toContain(OUTER_PAIR_BADGE.label);
    expect(html).toContain('겉감 짝(제안)');
    expect(html).toContain('구분 겉감 OUT-SHELL · 혼용률 미기재'); // 기존 행
    expect(html).toContain('구분 겉감 · 혼용률 WOOL 100%'); // 새 인식 행
    expect(html).toContain('합치기 1');
    expect(html).toContain(OUTER_PAIR_NOTE.slice(0, 20));
    expect(html).toMatch(/<option value="mergeInto" selected/);
    expect(html).not.toContain('bg-yellow-100 text-yellow-800'); // 일반 "비슷한 이름" 배지가 아니다
  });

  it('겉감 짝이 없으면 기존 화면과 같다(비슷한 이름 배지·기본 새 자재로 추가, 짝 표시 없음)', () => {
    const html = render([plainSimilar()]);
    expect(html).toContain('bg-yellow-100 text-yellow-800'); // 일반 "비슷한 이름" 배지
    expect(html).not.toContain('겉감 짝(제안)');
    expect(html).not.toContain('outer-pair-note');
    expect(html).toMatch(/<option value="add" selected/);
    expect(html).toContain('새로 추가 1');
  });
});
