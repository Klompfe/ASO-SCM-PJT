import { describe, it, expect } from 'vitest';
import {
  buildDraftRows,
  buildDefaultDecisions,
  summarizeDecisions,
  riskyDeleteRows,
  buildCommitDecisionsPayload,
  toggleCompositionChoice,
  countCompositionOverwrites,
  compositionTargetsExisting,
} from './salesOrderBomCompareReview';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

const existing = (overrides: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId: 1,
  itemName: '자재A',
  englishName: null,
  category: '부자재',
  colorCode: null,
  spec: null,
  consumption: 1,
  requiredQty: 100,
  unit: null,
  remarks: null,
  hasManualOverride: false,
  hasConfirmedUnitPrice: false,
  hasSubtypeAssignment: false,
  linkedPurchaseOrderCount: 0,
  linkedReceivingCount: 0,
  canDelete: true,
  blockedReason: null,
  ...overrides,
});

// PR-235(PILOT-23 후속): 작지 저장 전 비교 화면의 순수 로직. 합성 값만 사용.
describe('salesOrderBomCompareReview (PR-235)', () => {
  it('기본 선택 — "새 인식 우선": same→갱신, similar/new→새 자재로 추가', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'same', incomingIndex: 0, existing: existing(), incoming: { itemName: '자재A' } },
      { type: 'similar', incomingIndex: 1, existing: existing({ bomItemId: 2 }), incoming: { itemName: '자재A비슷' } },
      { type: 'new', incomingIndex: 2, incoming: { itemName: '완전신규' } },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    expect(decisions.incoming.get(draft[0].key)).toBe('update');
    expect(decisions.incoming.get(draft[1].key)).toBe('add');
    expect(decisions.incoming.get(draft[2].key)).toBe('add');
  });

  it('기본 선택 — existingOnly: canDelete=true면 삭제, canDelete=false면 유지로 고정', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'existingOnly', existing: existing({ bomItemId: 1, canDelete: true }) },
      { type: 'existingOnly', existing: existing({ bomItemId: 2, canDelete: false, blockedReason: '발주 1건 연결' }) },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    expect(decisions.existing.get(draft[0].key)).toBe('delete');
    expect(decisions.existing.get(draft[1].key)).toBe('keep'); // 비활성 대상이 기본으로 선택되는 사고 방지.
  });

  it('요약 숫자가 결정에 따라 집계된다', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'same', incomingIndex: 0, existing: existing({ bomItemId: 1 }), incoming: { itemName: 'A' } },
      { type: 'similar', incomingIndex: 1, existing: existing({ bomItemId: 2 }), incoming: { itemName: 'B' } },
      { type: 'new', incomingIndex: 2, incoming: { itemName: 'C' } },
      { type: 'existingOnly', existing: existing({ bomItemId: 3, canDelete: true }) },
      { type: 'existingOnly', existing: existing({ bomItemId: 4, canDelete: false }) },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    expect(summarizeDecisions(draft, decisions)).toEqual({ update: 1, mergeInto: 0, add: 2, delete: 1, keep: 1 });
  });

  it('삭제가 선택된 행 중 수동/확정단가/종류지정이 있는 행만 riskyDeleteRows로 걸린다', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'existingOnly', existing: existing({ bomItemId: 1, canDelete: true, hasManualOverride: true }) },
      { type: 'existingOnly', existing: existing({ bomItemId: 2, canDelete: true, hasManualOverride: false }) },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    const risky = riskyDeleteRows(draft, decisions);
    expect(risky).toHaveLength(1);
    expect(risky[0].row.existing?.bomItemId).toBe(1);
  });

  it('keep으로 바꾸면 더 이상 risky 목록에 없다', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'existingOnly', existing: existing({ bomItemId: 1, canDelete: true, hasConfirmedUnitPrice: true }) },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    decisions.existing.set(draft[0].key, 'keep');
    expect(riskyDeleteRows(draft, decisions)).toHaveLength(0);
  });

  it('buildCommitDecisionsPayload: update/add/keep(기본값과 같은 선택)은 보내지 않고 mergeInto/delete만 보낸다', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'same', incomingIndex: 0, existing: existing({ bomItemId: 1 }), incoming: { itemName: 'A' } },
      { type: 'similar', incomingIndex: 1, existing: existing({ bomItemId: 2 }), incoming: { itemName: 'B' } },
      { type: 'new', incomingIndex: 2, incoming: { itemName: 'C' } },
      { type: 'existingOnly', existing: existing({ bomItemId: 3, canDelete: true }) },
      { type: 'existingOnly', existing: existing({ bomItemId: 4, canDelete: false }) },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    // similar 행을 "합치기"로 바꾼다(기본값은 add).
    decisions.incoming.set(draft[1].key, 'mergeInto');

    const payload = buildCommitDecisionsPayload(draft, decisions);
    expect(payload).toEqual({
      incoming: [{ index: 1, action: 'mergeInto', mergeIntoBomItemId: 2 }],
      existing: [{ bomItemId: 3, action: 'delete' }],
    });
  });

  it('모든 선택이 기본값과 같으면(변경 없음) undefined를 돌려준다 — unnecessary payload 방지는 아니지만 existingOnly 기본 삭제가 있으면 undefined가 아니다', () => {
    // same 하나만 있고(기본 update, 전송 안 함) existingOnly가 전혀 없으면 undefined.
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'same', incomingIndex: 0, existing: existing({ bomItemId: 1 }), incoming: { itemName: 'A' } },
    ];
    const draft = buildDraftRows(rows);
    const decisions = buildDefaultDecisions(draft);
    expect(buildCommitDecisionsPayload(draft, decisions)).toBeUndefined();
  });
});

// PR-246: 혼용률 선택(유지/바꾸기/되돌리기, 채우기 해제)과 페이로드 — 합성 값만 사용.
describe('salesOrderBomCompareReview — 혼용률 (PR-246)', () => {
  const same = (compositionStatus: any, incomingIndex = 0, bomItemId = 1): SalesOrderBomCompareRow => ({
    type: 'same',
    incomingIndex,
    existing: existing({ bomItemId }),
    incoming: { itemName: '자재A' },
    existingComposition: compositionStatus === 'fillEmpty' ? null : 'COTTON 100%',
    incomingComposition: compositionStatus === 'incomingEmpty' ? null : 'COTTON 60% POLYESTER 40%',
    compositionStatus,
  });

  it('toggleCompositionChoice: 누르면 설정, 다시 누르면 해제(되돌리기), 다른 선택으로 바꿀 수 있다', () => {
    let m = toggleCompositionChoice(new Map(), 'same-0', 'overwrite');
    expect(m.get('same-0')).toBe('overwrite');
    m = toggleCompositionChoice(m, 'same-0', 'overwrite');
    expect(m.has('same-0')).toBe(false);
    m = toggleCompositionChoice(m, 'same-0', 'skip');
    expect(m.get('same-0')).toBe('skip');
  });

  it('기본(선택 없음)이면 혼용률 플래그를 보내지 않는다 — differs도 기본은 유지', () => {
    const draft = buildDraftRows([same('differs')]);
    expect(buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft))).toBeUndefined();
    expect(countCompositionOverwrites(draft, buildDefaultDecisions(draft), new Map())).toBe(0);
  });

  it('differs + overwrite 선택 → 그 행만 action:update + overwriteComposition:true', () => {
    const draft = buildDraftRows([same('differs', 0, 1), same('differs', 1, 2)]);
    const choices = toggleCompositionChoice(new Map(), draft[0].key, 'overwrite');
    const payload = buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft), choices);
    expect(payload).toEqual({ incoming: [{ index: 0, action: 'update', overwriteComposition: true }] });
    expect(countCompositionOverwrites(draft, buildDefaultDecisions(draft), choices)).toBe(1);
  });

  it('되돌리기(다시 누름) 후에는 플래그가 사라진다', () => {
    const draft = buildDraftRows([same('differs')]);
    let choices = toggleCompositionChoice(new Map(), draft[0].key, 'overwrite');
    choices = toggleCompositionChoice(choices, draft[0].key, 'overwrite');
    expect(buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft), choices)).toBeUndefined();
  });

  it('fillEmpty + skip 선택 → skipComposition:true, 그 외 상태(same/incomingEmpty)에는 선택이 있어도 보내지 않는다', () => {
    const draft = buildDraftRows([same('fillEmpty', 0, 1), same('same', 1, 2), same('incomingEmpty', 2, 3)]);
    let choices = new Map();
    for (const d of draft) choices = toggleCompositionChoice(choices, d.key, 'skip');
    const payload = buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft), choices);
    expect(payload).toEqual({ incoming: [{ index: 0, action: 'update', skipComposition: true }] });
  });

  it('differs인데 skip을 골랐거나 fillEmpty인데 overwrite를 골라도 보내지 않는다(상태에 맞는 선택만)', () => {
    const draft = buildDraftRows([same('differs', 0, 1), same('fillEmpty', 1, 2)]);
    let choices = toggleCompositionChoice(new Map(), draft[0].key, 'skip');
    choices = toggleCompositionChoice(choices, draft[1].key, 'overwrite');
    expect(buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft), choices)).toBeUndefined();
  });

  it('similar: 합치기(mergeInto)를 골랐을 때만 혼용률이 의미 있고 플래그가 mergeInto 항목에 실린다', () => {
    const similar: SalesOrderBomCompareRow = { ...same('differs', 0, 7), type: 'similar' };
    const draft = buildDraftRows([similar]);
    const choices = toggleCompositionChoice(new Map(), draft[0].key, 'overwrite');
    expect(compositionTargetsExisting(similar, undefined)).toBe(false);
    expect(buildCommitDecisionsPayload(draft, buildDefaultDecisions(draft), choices)).toBeUndefined();
    const merged = buildDefaultDecisions(draft);
    merged.incoming.set(draft[0].key, 'mergeInto');
    expect(buildCommitDecisionsPayload(draft, merged, choices)).toEqual({
      incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 7, overwriteComposition: true }],
    });
    expect(countCompositionOverwrites(draft, merged, choices)).toBe(1);
  });
});
