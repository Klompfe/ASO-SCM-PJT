import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SalesOrderBomCompareStep } from './SalesOrderBomCompareStep';
import {
  buildDraftRows,
  buildDefaultDecisions,
  buildCommitDecisionsPayload,
  riskyDeleteRows,
  detectOuterDuplicate,
  countOuterAfterSave,
  formatOuterDuplicateNotice,
  withOuterDuplicateConfirm,
} from '../utils/salesOrderBomCompareReview';
import { buildCommitBomItems } from '../utils/salesOrderBomReview';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// PR-261 보강 2: 기존 겉감 계열이 2줄 이상이면 새 인식의 겉감 줄 수(0 포함)·"제외" 체크와 상관없이 기본 "유지". 합성 데이터만.
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

const TWO_OUTER = () => [only(ex(1, '소재')), only(ex(2, '겉감')), only(ex(3, '부자재'))];
const NO_OUTER_NOTICE = '겉감 계열 행이 2줄 이상입니다(구분 소재·겉감 등, 기존 2줄). 이번 인식에서 겉감이 확인되지 않았거나 제외되어 있습니다. 자동으로 삭제하지 않습니다. 저장 전에 원본 작지를 확인하세요.';

describe('① 기존 겉감 계열 2줄 + 새 겉감 0줄', () => {
  it('기존 겉감 두 행은 기본 유지, 겉감 아닌 행은 기본 삭제, 저장 요청에 겉감 삭제가 없다', () => {
    const rows = [...TWO_OUTER(), fresh(0, '안감')];
    const { draft, decisions, defaults } = state(rows);
    expect(detectOuterDuplicate(rows)).toEqual({ active: true, existingOuterCount: 2, incomingOuterCount: 0 });
    expect(defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
    expect(buildCommitDecisionsPayload(draft, decisions)).toEqual({ existing: [{ bomItemId: 3, action: 'delete' }] });
  });

  it('새 행이 하나도 없어도(전부 제외) 같다', () => {
    expect(state(TWO_OUTER()).defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
  });

  it('안내 문구(원문)가 보이고 "추가" 안내는 없으며 두 겉감 행의 선택은 유지로 렌더된다', () => {
    const rows = TWO_OUTER();
    expect(formatOuterDuplicateNotice(detectOuterDuplicate(rows))).toBe(NO_OUTER_NOTICE);
    const html = render(rows);
    expect(html).toContain('outer-duplicate-notice');
    expect(html).toContain(NO_OUTER_NOTICE);
    expect(html).not.toContain('outer-duplicate-add-notice');
    expect(html).not.toContain('새 겉감 행과 어느 행이 같은지');
    expect((html.match(/<option value="keep" selected="">/g) ?? []).length).toBe(2);
    expect((html.match(/<option value="delete" selected="">/g) ?? []).length).toBe(1);
  });

  it('새 확인창을 만들지 않는다(추가되는 겉감이 없으면 기존 확인 문구 그대로)', () => {
    const rows = TWO_OUTER();
    const { draft, decisions } = state(rows);
    const after = countOuterAfterSave(draft, decisions);
    expect(after).toEqual({ added: 0, total: 2 });
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows), after)).toBeNull();
    expect(withOuterDuplicateConfirm('기존 삭제 확인', detectOuterDuplicate(rows), after)).toBe('기존 삭제 확인');
  });
});

describe('② "제외" 체크는 보호를 풀지 않는다', () => {
  // 저장 화면의 "제외"는 비교 요청에서 새 행만 뺀다(buildCommitBomItems). 서버 비교 응답에는 기존 행이 항상 전부 들어온다.
  const items = [{ category: '겉감', itemName: '새원단' }, { category: '안감', itemName: '새안감' }] as never;

  it('제외하지 않으면 새 겉감이 비교 요청에 있고, 제외하면 빠진다', () => {
    expect(buildCommitBomItems(items, new Set()).map((b) => b.category)).toEqual(['겉감', '안감']);
    expect(buildCommitBomItems(items, new Set([0])).map((b) => b.category)).toEqual(['안감']);
  });

  it('두 상태의 비교 결과에서 기존 겉감 행의 기본 선택이 같다(둘 다 유지)', () => {
    const notExcluded = [...TWO_OUTER(), fresh(0, '겉감'), fresh(1, '안감')];
    const excluded = [...TWO_OUTER(), fresh(0, '안감')];
    expect(state(excluded).defaults).toEqual(state(notExcluded).defaults);
    expect(state(excluded).defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
  });
});

describe('③ 기존 겉감 계열 2줄 + 새 겉감 1줄: 직전 보강 동작 그대로', () => {
  it('기본 유지 + 원래 안내 + 추가 안내 + 저장 확인창', () => {
    const rows = [...TWO_OUTER(), fresh(0, '겉감')];
    const { draft, decisions, defaults } = state(rows);
    expect(defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
    const html = render(rows);
    expect(html).toContain('같은 원단이 중복되었을 수 있어 자동으로 삭제하지 않습니다. 새 겉감 행과 어느 행이 같은지 직접 확인하세요.');
    expect(html).toContain('outer-duplicate-add-notice');
    expect(html).not.toContain('확인되지 않았거나 제외되어');
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows), countOuterAfterSave(draft, decisions))).toContain('계속할까요?');
  });
});

describe('④ 기존 겉감 계열 1줄 이하: 이전과 같다', () => {
  it.each([
    ['0줄 + 새 겉감 0줄', [only(ex(1, '안감')), only(ex(2, '부자재'))], { 1: 'delete', 2: 'delete' }],
    ['0줄 + 새 겉감 1줄', [only(ex(1, '안감')), fresh(0, '겉감')], { 1: 'delete' }],
    // PR-263(사용자 결정): 이 한 경우만 바뀌었다 — 새 겉감이 없으면 기존 겉감 1줄도 기본 유지(겉감이 아닌 행은 삭제 그대로).
    ['1줄 + 새 겉감 0줄', [only(ex(1, '소재')), only(ex(2, '부자재'))], { 1: 'keep', 2: 'delete' }],
    ['1줄 + 새 겉감 1줄(짝이 안 된 경우)', [only(ex(1, '겉감')), fresh(0, '겉감')], { 1: 'delete' }],
  ])('%s', (_label, rows, expected) => {
    expect(detectOuterDuplicate(rows as SalesOrderBomCompareRow[]).active).toBe(false);
    expect(state(rows as SalesOrderBomCompareRow[]).defaults).toEqual(expected);
    expect(render(rows as SalesOrderBomCompareRow[])).not.toContain('outer-duplicate-notice');
  });
});

describe('⑤⑥ 겉감이 아닌 행과 사용자가 직접 바꾼 삭제', () => {
  it('⑤ 겉감 계열이 아닌 행(부소재·안감·실)은 기본 삭제 그대로', () => {
    const rows = [only(ex(1, '소재')), only(ex(2, '겉감')), only(ex(3, '부소재')), only(ex(4, '안감')), only(ex(5, '실'))];
    expect(state(rows).defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete', 4: 'delete', 5: 'delete' });
  });

  it('⑥ 직접 삭제로 바꾸면 위험 삭제 확인 대상이고 저장 요청에 실리며, 발주 연결 행은 삭제할 수 없다', () => {
    const rows = [only(ex(1, '소재', { hasConfirmedUnitPrice: true })), only(ex(2, '겉감', { canDelete: false, blockedReason: '발주 1건 연결' }))];
    const { draft, decisions, defaults } = state(rows);
    expect(defaults).toEqual({ 1: 'keep', 2: 'keep' });
    const changed = { incoming: decisions.incoming, existing: new Map(decisions.existing).set(draft[0].key, 'delete' as const) };
    expect(riskyDeleteRows(draft, changed).map((r) => r.row.existing!.bomItemId)).toEqual([1]);
    expect(buildCommitDecisionsPayload(draft, changed)).toEqual({ existing: [{ bomItemId: 1, action: 'delete' }] });
    expect(render(rows)).toContain('발주 1건 연결');
  });
});
