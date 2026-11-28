import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SalesOrderBomCompareStep } from './SalesOrderBomCompareStep';
import {
  buildDraftRows,
  buildDefaultDecisions,
  buildCommitDecisionsPayload,
  summarizeDecisions,
  riskyDeleteRows,
  detectOuterDuplicate,
  countOuterAfterSave,
  defaultExistingDecisionFor,
  formatOuterDuplicateNotice,
  withOuterDuplicateConfirm,
} from '../utils/salesOrderBomCompareReview';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// PR-261 보강: 기존 겉감 계열 2줄 이상 + 새 겉감 → 기존 겉감 행은 기본 "유지". 합성 데이터만. jsdom 이 없어 클릭은 못 보고 순수 함수·정적 렌더로 확인한다.
const ex = (bomItemId: number, category: string, extra: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId, itemName: `기존${bomItemId}`, englishName: null, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, unit: 'EA', remarks: null, composition: null,
  hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false, linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null, ...extra,
});
const only = (e: SalesOrderBomCompareExistingRow): SalesOrderBomCompareRow => ({ type: 'existingOnly', existing: e });
const fresh = (incomingIndex: number, category: string): SalesOrderBomCompareRow => ({
  type: 'new', incomingIndex, incoming: { itemName: `새${incomingIndex}`, category, colorCode: null, consumption: 1, requiredQty: 100, composition: 'X/Y=60/40' },
});
const state = (rows: SalesOrderBomCompareRow[]) => {
  const draft = buildDraftRows(rows);
  const decisions = buildDefaultDecisions(draft);
  const defaults = Object.fromEntries(draft.filter((d) => d.row.type === 'existingOnly').map((d) => [d.row.existing!.bomItemId, decisions.existing.get(d.key)]));
  return { draft, decisions, defaults };
};
const render = (rows: SalesOrderBomCompareRow[]) =>
  renderToStaticMarkup(createElement(SalesOrderBomCompareStep, { styleNo: 'SYN-1', rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }));

const SOJAE_AND_SHELL = () => [only(ex(1, '소재', { composition: 'A/B=50/50' })), only(ex(2, '겉감')), only(ex(3, '부자재')), fresh(0, '겉감')];

describe('① 소재 1 + 겉감 1 + 새 겉감 1', () => {
  it('기존 겉감 계열 두 행은 기본 유지, 겉감 계열이 아닌 행은 기본 삭제 그대로', () => {
    const { defaults, decisions, draft } = state(SOJAE_AND_SHELL());
    expect(defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete' });
    expect(summarizeDecisions(draft, decisions)).toMatchObject({ keep: 2, delete: 1, add: 1, mergeInto: 0 });
  });

  it('저장 요청에는 겉감 행 삭제가 실리지 않는다(부자재 삭제만)', () => {
    const { draft, decisions } = state(SOJAE_AND_SHELL());
    expect(buildCommitDecisionsPayload(draft, decisions)).toEqual({ existing: [{ bomItemId: 3, action: 'delete' }] });
  });

  it('새 겉감 행은 기존 선택지 그대로(추가)이며, 저장 확인창이 반드시 뜬다', () => {
    const rows = [only(ex(1, '소재')), only(ex(2, '겉감')), fresh(0, '겉감')];
    const { draft, decisions } = state(rows);
    const after = countOuterAfterSave(draft, decisions);
    expect(after).toEqual({ added: 1, total: 3 });
    // 삭제·교체가 하나도 없어 원래는 확인창이 없던 상황에서도 확인창이 생긴다.
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows), after)).toBe('겉감 계열 행이 이미 2줄입니다. 새 겉감 행 1개를 추가하면 겉감 계열이 3줄이 됩니다. 계속할까요?');
    expect(withOuterDuplicateConfirm('기존 확인 문구', detectOuterDuplicate(rows), after)).toBe('겉감 계열 행이 이미 2줄입니다. 새 겉감 행 1개를 추가하면 겉감 계열이 3줄이 됩니다.\n기존 확인 문구');
  });

  it('⑦ 안내 문구가 비교 화면에 보이고, 두 기존 행의 선택은 "유지"로 렌더된다', () => {
    const html = render(SOJAE_AND_SHELL());
    expect(html).toContain('outer-duplicate-notice');
    expect(html).toContain('겉감 계열 행이 2줄 이상입니다(구분 소재·겉감 등, 기존 2줄). 같은 원단이 중복되었을 수 있어 자동으로 삭제하지 않습니다. 새 겉감 행과 어느 행이 같은지 직접 확인하세요.');
    expect(html).toContain('이대로 저장하면 새 겉감 행 1개가 추가되어 겉감 계열이 3줄이 됩니다.');
    expect((html.match(/<option value="keep" selected="">/g) ?? []).length).toBe(2);
    expect((html.match(/<option value="delete" selected="">/g) ?? []).length).toBe(1); // 부자재
    expect(html).toContain('삭제 1');
  });
});

describe('② 겉감 2줄(소재 없음)·영문 별칭도 같은 규칙', () => {
  it.each([
    [['겉감', '겉감']],
    [['겉감 OUT-SHELL', '겉감']],
    [['소재', '소재']],
  ])('%j', (cats) => {
    const { defaults } = state([only(ex(1, cats[0])), only(ex(2, cats[1])), fresh(0, '겉감')]);
    expect(defaults).toEqual({ 1: 'keep', 2: 'keep' });
  });

  it('기존 겉감 한 줄이 same 으로 맞고 나머지 한 줄만 기존에만 있어도 그 줄은 유지', () => {
    const same: SalesOrderBomCompareRow = { type: 'same', incomingIndex: 0, existing: ex(1, '소재'), incoming: { itemName: '기존1', category: '겉감' } };
    const rows = [same, only(ex(2, '겉감'))];
    expect(state(rows).defaults).toEqual({ 2: 'keep' });
    expect(countOuterAfterSave(state(rows).draft, state(rows).decisions)).toEqual({ added: 0, total: 2 });
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows), { added: 0, total: 2 })).toBeNull(); // 추가가 없으면 확인창을 새로 만들지 않는다
  });
});

describe('③④⑤ 겉감 계열 1줄 이하·조건 미충족은 이전과 같다', () => {
  it('③ 기존 겉감 1 + 새 겉감 1(겉감 짝): 기본 합치기, 안내 없음', () => {
    const pair: SalesOrderBomCompareRow = { type: 'similar', outerFabricPair: true, incomingIndex: 0, existing: ex(1, '소재'), incoming: { itemName: '새', category: '겉감' }, compositionStatus: 'incomingEmpty' };
    const rows = [pair, only(ex(3, '부자재'))];
    const { draft, decisions, defaults } = state(rows);
    expect(detectOuterDuplicate(rows).active).toBe(false);
    expect(defaults).toEqual({ 3: 'delete' });
    expect(buildCommitDecisionsPayload(draft, decisions)).toEqual({ incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 1 }], existing: [{ bomItemId: 3, action: 'delete' }] });
    const html = render(rows);
    expect(html).not.toContain('outer-duplicate-notice');
  });

  it('③ 기존 겉감 1줄만 "기존에만 있음"이면 새 겉감이 있어도 이전처럼 기본 삭제(짝이 안 된 경우)', () => {
    expect(state([only(ex(1, '겉감')), fresh(0, '겉감')]).defaults).toEqual({ 1: 'delete' });
  });

  it('④ 기존 겉감 계열 0줄: 이전과 동일(확인창·안내 없음)', () => {
    const rows = [only(ex(1, '안감')), only(ex(2, '부소재')), fresh(0, '겉감')];
    const { defaults, draft, decisions } = state(rows);
    expect(defaults).toEqual({ 1: 'delete', 2: 'delete' });
    expect(withOuterDuplicateConfirm(null, detectOuterDuplicate(rows), countOuterAfterSave(draft, decisions))).toBeNull();
    expect(render(rows)).not.toContain('outer-duplicate-notice');
  });

  it('새 인식에 겉감 계열이 없으면 규칙이 적용되지 않는다(지시된 조건 — 알려진 한계)', () => {
    const rows = [only(ex(1, '소재')), only(ex(2, '겉감')), fresh(0, '안감')];
    expect(detectOuterDuplicate(rows)).toEqual({ active: false, existingOuterCount: 2, incomingOuterCount: 0 });
    expect(state(rows).defaults).toEqual({ 1: 'delete', 2: 'delete' });
  });

  it('⑤ 겉감 계열이 아닌 행(부자재·부소재·안감)은 중복 상태에서도 기본 삭제 그대로', () => {
    const rows = [only(ex(1, '소재')), only(ex(2, '겉감')), only(ex(3, '부소재')), only(ex(4, '안감')), only(ex(5, '실')), fresh(0, '겉감')];
    expect(state(rows).defaults).toEqual({ 1: 'keep', 2: 'keep', 3: 'delete', 4: 'delete', 5: 'delete' });
  });
});

describe('⑥ 사용자가 직접 삭제로 바꾸면 기존 확인창·보호 규칙 대상', () => {
  it('수동 값이 있는 겉감 행을 삭제로 바꾸면 위험 삭제(확인 체크 필요)로 잡히고 저장 요청에 삭제가 실린다', () => {
    const rows = [only(ex(1, '소재', { hasManualOverride: true })), only(ex(2, '겉감')), fresh(0, '겉감')];
    const { draft, decisions } = state(rows);
    expect(riskyDeleteRows(draft, decisions)).toHaveLength(0); // 기본(유지)에서는 위험 삭제가 없다
    const changed = { incoming: decisions.incoming, existing: new Map(decisions.existing).set(draft[0].key, 'delete' as const) };
    expect(riskyDeleteRows(draft, changed).map((r) => r.row.existing!.bomItemId)).toEqual([1]);
    expect(buildCommitDecisionsPayload(draft, changed)).toEqual({ existing: [{ bomItemId: 1, action: 'delete' }] });
    expect(countOuterAfterSave(draft, changed)).toEqual({ added: 1, total: 2 });
  });

  it('발주가 연결된 행(canDelete=false)은 여전히 유지로 고정', () => {
    const { draft } = state([only(ex(1, '소재', { canDelete: false })), only(ex(2, '겉감')), fresh(0, '겉감')]);
    expect(defaultExistingDecisionFor(draft[0].row)).toBe('keep');
    const html = render([only(ex(1, '소재', { canDelete: false, blockedReason: '발주 1건 연결' })), only(ex(2, '겉감')), fresh(0, '겉감')]);
    expect(html).toContain('발주 1건 연결');
  });

  it('keepByDefault 표시는 화면 전용이라 원본 행을 바꾸지 않는다', () => {
    const rows = SOJAE_AND_SHELL();
    const snapshot = JSON.stringify(rows);
    buildDraftRows(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(formatOuterDuplicateNotice(detectOuterDuplicate(rows))).toContain('기존 2줄');
  });
});
