import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SalesOrderBomCompareStep } from './SalesOrderBomCompareStep';
import {
  OUTER_MISSING_NOTICE,
  buildDraftRows,
  buildDefaultDecisions,
  buildCommitDecisionsPayload,
  riskyDeleteRows,
  detectOuterDuplicate,
  isOuterMissingInIncoming,
  countOuterAfterSave,
  withOuterDuplicateConfirm,
} from '../utils/salesOrderBomCompareReview';
import { buildCommitBomItems } from '../utils/salesOrderBomReview';
import { buildCompareConfirmMessage } from '../utils/orderOverviewReview';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// PR-263: 기존 겉감 계열 1줄 이상 + 비교에 올라간 새 겉감 0줄(인식 누락이든 "제외"든) → 기존 겉감 행은 기본 "유지". 합성 데이터만.
// jsdom 이 없어 클릭은 못 본다 — 순수 함수·정적 렌더로 확인한다.
const ex = (bomItemId: number, category: string, extra: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId, itemName: `기존${bomItemId}`, englishName: null, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, unit: 'EA', remarks: null, composition: null,
  hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false, linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null, ...extra,
});
const only = (e: SalesOrderBomCompareExistingRow): SalesOrderBomCompareRow => ({ type: 'existingOnly', existing: e });
const fresh = (incomingIndex: number, category: string): SalesOrderBomCompareRow => ({
  type: 'new', incomingIndex, incoming: { itemName: `새${incomingIndex}`, category, colorCode: null, consumption: 1, requiredQty: 100 },
});
const state = (rows: SalesOrderBomCompareRow[]) => {
  const draft = buildDraftRows(rows);
  const decisions = buildDefaultDecisions(draft);
  const defaults = Object.fromEntries(draft.filter((d) => d.row.type === 'existingOnly').map((d) => [d.row.existing!.bomItemId, decisions.existing.get(d.key)]));
  return { draft, decisions, defaults };
};
const render = (rows: SalesOrderBomCompareRow[]) =>
  renderToStaticMarkup(createElement(SalesOrderBomCompareStep, { styleNo: 'SYN-1', rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }));
const count = (html: string, text: string) => html.split(text).length - 1;
const MISSING_SENTENCE = '이번 인식에서 겉감이 확인되지 않았거나 제외되어 있습니다.';

describe.each([
  ['① 기존 겉감 1줄', '겉감'],
  ['② 기존 소재 1줄', '소재'],
])('%s + 새 겉감 0줄', (_label, category) => {
  const rows = () => [only(ex(1, category, { composition: 'A/B=50/50' })), only(ex(2, '부자재')), fresh(0, '안감')];

  it('그 기존 행은 기본 유지, 저장 요청에 그 행의 삭제가 없다', () => {
    const { draft, decisions, defaults } = state(rows());
    expect(defaults).toEqual({ 1: 'keep', 2: 'delete' });
    expect(buildCommitDecisionsPayload(draft, decisions)).toEqual({ existing: [{ bomItemId: 2, action: 'delete' }] });
  });

  it('⑨ 안내(원문)가 한 번 보이고, 선택은 유지 1개·삭제 1개로 렌더되며, 2줄 이상 안내는 없다', () => {
    const html = render(rows());
    expect(html).toContain('outer-missing-notice');
    expect(count(html, OUTER_MISSING_NOTICE)).toBe(1);
    expect(count(html, MISSING_SENTENCE)).toBe(1);
    expect(html).not.toContain('outer-duplicate-notice');
    expect(html).not.toContain('겉감 계열 행이 2줄 이상');
    expect(count(html, '<option value="keep" selected="">')).toBe(1);
    expect(count(html, '<option value="delete" selected="">')).toBe(1);
  });

  it('새 확인창을 만들지 않는다(추가되는 겉감이 없으므로 기존 확인 문구 그대로)', () => {
    const { draft, decisions } = state(rows());
    const after = countOuterAfterSave(draft, decisions);
    expect(after).toEqual({ added: 0, total: 1 });
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows()), after)).toBeNull();
    expect(withOuterDuplicateConfirm('기존 확인 문구', detectOuterDuplicate(rows()), after)).toBe('기존 확인 문구');
  });
});

it('안내 원문', () => {
  expect(OUTER_MISSING_NOTICE).toBe('이번 인식에서 겉감이 확인되지 않았거나 제외되어 있습니다. 기존 겉감 행은 자동으로 삭제하지 않습니다. 저장 전에 원본 작지를 확인하세요.');
});

describe('③ "제외"와 인식 누락은 같은 입력이고, 제외가 보호를 풀지 않는다', () => {
  const recognized = [{ category: '겉감', itemName: '새원단' }, { category: '안감', itemName: '새안감' }] as never;
  const notRecognized = [{ category: '안감', itemName: '새안감' }] as never;

  it('새 겉감 행을 제외한 비교 요청은 애초에 겉감이 인식되지 않은 요청과 같다', () => {
    expect(buildCommitBomItems(recognized, new Set([0]))).toEqual(buildCommitBomItems(notRecognized, new Set()));
  });

  it('제외하든 안 하든(겉감 짝) 기존 겉감 행은 삭제되지 않는다', () => {
    const notExcluded: SalesOrderBomCompareRow[] = [
      { type: 'similar', outerFabricPair: true, incomingIndex: 0, existing: ex(1, '겉감'), incoming: { itemName: '새원단', category: '겉감' }, compositionStatus: 'incomingEmpty' },
      fresh(1, '안감'),
    ];
    const excluded = [only(ex(1, '겉감')), fresh(0, '안감')];
    for (const rows of [notExcluded, excluded]) {
      const { draft, decisions } = state(rows);
      expect(buildCommitDecisionsPayload(draft, decisions)?.existing ?? []).toEqual([]);
    }
    expect(state(excluded).defaults).toEqual({ 1: 'keep' });
  });
});

describe('④⑤ 다른 경우는 이전과 같다', () => {
  it('④ 기존 겉감 1 + 새 겉감 1(겉감 짝): 기본 합치기, 안내 없음', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'similar', outerFabricPair: true, incomingIndex: 0, existing: ex(1, '겉감'), incoming: { itemName: '새', category: '겉감' }, compositionStatus: 'incomingEmpty' },
      only(ex(2, '부자재')),
    ];
    const { draft, decisions, defaults } = state(rows);
    expect(isOuterMissingInIncoming(detectOuterDuplicate(rows))).toBe(false);
    expect(defaults).toEqual({ 2: 'delete' });
    expect(buildCommitDecisionsPayload(draft, decisions)).toEqual({ incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 1 }], existing: [{ bomItemId: 2, action: 'delete' }] });
    const html = render(rows);
    expect(html).not.toContain('outer-missing-notice');
    expect(html).not.toContain('outer-duplicate-notice');
  });

  it.each([
    ['짝이 안 된 새 겉감 1줄', [only(ex(1, '겉감')), fresh(0, '겉감')]],
    ['새 겉감 2줄', [only(ex(1, '겉감')), fresh(0, '겉감'), fresh(1, '겉감')]],
    ['새 겉감이 같은 이름의 행과 same', [only(ex(1, '겉감')), { type: 'same', incomingIndex: 0, existing: ex(2, '부자재'), incoming: { itemName: '기존2', category: '겉감' } }]],
  ])('④ 기존 겉감 1줄 + 새 겉감 1줄 이상(%s): 이전처럼 기본 삭제, 안내 없음', (_label, rows) => {
    const list = rows as SalesOrderBomCompareRow[];
    expect(state(list).defaults).toEqual({ 1: 'delete' });
    expect(render(list)).not.toContain('outer-missing-notice');
  });

  it.each([
    ['새 겉감 0줄', [only(ex(1, '안감')), only(ex(2, '부자재')), fresh(0, '안감')]],
    ['새 행 자체가 없음', [only(ex(1, '안감')), only(ex(2, '부자재'))]],
  ])('⑤ 기존 겉감 0줄 + %s: 이전처럼 기본 삭제, 안내 없음', (_label, rows) => {
    const list = rows as SalesOrderBomCompareRow[];
    expect(state(list).defaults).toEqual({ 1: 'delete', 2: 'delete' });
    expect(render(list)).not.toContain('outer-missing-notice');
  });
});

describe('⑥⑦ 2줄 이상 안내와의 우선순위, 겉감이 아닌 행', () => {
  it('⑥ 기존 2줄 + 새 0줄: 둘 다 유지, 2줄 이상 안내만 한 번(새 안내는 겹쳐 나오지 않는다)', () => {
    const rows = [only(ex(1, '소재')), only(ex(2, '겉감')), only(ex(3, '부자재'))];
    expect(state(rows).defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
    const html = render(rows);
    expect(html).toContain('outer-duplicate-notice');
    expect(html).not.toContain('outer-missing-notice');
    expect(count(html, MISSING_SENTENCE)).toBe(1);
  });

  it('⑦ 겉감 계열이 아닌 기존 행(부소재·안감·실·FABRIC·INTERLINING)은 기본 삭제 그대로', () => {
    const rows = [only(ex(1, '겉감')), only(ex(2, '부소재')), only(ex(3, '안감')), only(ex(4, '실')), only(ex(5, 'FABRIC')), only(ex(6, 'INTERLINING'))];
    expect(state(rows).defaults).toEqual({ 1: 'keep', 2: 'delete', 3: 'delete', 4: 'delete', 5: 'delete', 6: 'delete' });
  });
});

describe('⑧ 사용자가 직접 삭제로 바꾸면 기존 확인창·보호 규칙 대상', () => {
  it('위험 삭제(확인 체크 필요)·저장 요청·삭제 확인창 문구에 포함된다', () => {
    const rows = [only(ex(1, '겉감', { hasConfirmedUnitPrice: true }))];
    const { draft, decisions } = state(rows);
    expect(riskyDeleteRows(draft, decisions)).toHaveLength(0);
    const changed = { incoming: decisions.incoming, existing: new Map(decisions.existing).set(draft[0].key, 'delete' as const) };
    expect(riskyDeleteRows(draft, changed).map((r) => r.row.existing!.bomItemId)).toEqual([1]);
    expect(buildCommitDecisionsPayload(draft, changed)).toEqual({ existing: [{ bomItemId: 1, action: 'delete' }] });
    expect(buildCompareConfirmMessage({ deleteNames: ['기존1'], compositionOverwriteCount: 0, overviewOverwriteCount: 0 })).toContain('기존1');
  });

  it('발주가 연결된 행은 유지로 고정이고 삭제를 고를 수 없게 렌더된다', () => {
    const rows = [only(ex(1, '겉감', { canDelete: false, blockedReason: '발주 1건 연결' }))];
    expect(state(rows).defaults).toEqual({ 1: 'keep' });
    const html = render(rows);
    expect(html).toContain('발주 1건 연결');
    expect(html).toContain('<option value="delete" disabled="">');
  });
});
