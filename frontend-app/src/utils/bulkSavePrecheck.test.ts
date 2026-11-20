import { describe, it, expect } from 'vitest';
import {
  classifyBulkPrecheck,
  summarizePrecheck,
  formatPrecheckHeadline,
  formatPrecheckSummary,
  selectNewTargets,
  selectChangedIndexes,
  nextChangedIndex,
  isStillNew,
  runWithConcurrency,
  findDuplicateStyleNos,
  listOverviewChangeLabels,
  type PrecheckInput,
} from './bulkSavePrecheck';
import type { SalesOrderBomCompareResponse, SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// PR-250: 일괄 저장 사전 점검 분류 — 합성 값만 사용.
const existing = (o: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId: 1, itemName: '자재A', englishName: null, category: '겉감', colorCode: null, spec: null, consumption: 1, requiredQty: 100,
  unit: null, remarks: null, composition: null, sheetQty: 100, hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false,
  linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null, ...o,
});
const sameRow = (o: { consumption?: number; requiredQty?: number; compositionStatus?: any } = {}): SalesOrderBomCompareRow => ({
  type: 'same', incomingIndex: 0, existing: existing(),
  incoming: { itemName: '자재A', consumption: o.consumption ?? 1, requiredQty: o.requiredQty ?? 100 },
  // 서버는 기존·들어온 행이 모두 있는 행에는 항상 혼용률 상태를 채워 준다 — 기본값은 same.
  compositionStatus: o.compositionStatus ?? 'same',
});
const compare = (rows: SalesOrderBomCompareRow[], overview?: SalesOrderBomCompareResponse['overview'], hasExistingBom = true): SalesOrderBomCompareResponse => ({
  hasExistingBom, rows, ...(overview ? { overview } : {}),
});
const ov = (status: any, field = 'buyer') => ({ field, existing: 'A', incoming: 'B', status });
const input = (index: number, styleNo: string | null, c?: SalesOrderBomCompareResponse | null, extra: Partial<PrecheckInput> = {}): PrecheckInput => ({
  index, styleNo, compare: c ?? null, ...extra,
});
const kindOf = (i: PrecheckInput) => classifyBulkPrecheck([i])[0].kind;

describe('classifyBulkPrecheck (PR-250)', () => {
  it('신규: 기존 자재 행도 오더개요도 없음 → 바로 저장 가능', () => {
    expect(kindOf(input(0, 'S-NEW', compare([], undefined, false)))).toBe('new');
  });

  it('변경 없음: 기존 스타일이고 행·오더개요·혼용률이 모두 같음/비어 있음 → 저장 안 함', () => {
    const c = compare([sameRow({ compositionStatus: 'same' }), sameRow({ compositionStatus: 'incomingEmpty' })], [ov('same'), ov('incomingEmpty', 'brand')]);
    const e = classifyBulkPrecheck([input(0, 'S-1', c)])[0];
    expect(e.kind).toBe('unchanged');
    expect(e.summary).toContain('저장하지 않습니다');
  });

  it('변경 있음 — 신규 자재 행', () => {
    const e = classifyBulkPrecheck([input(0, 'S-1', compare([sameRow(), { type: 'new', incomingIndex: 1, incoming: { itemName: '자재B' } }]))])[0];
    expect(e.kind).toBe('changed');
    expect(e.counts.newRows).toBe(1);
    expect(e.summary).toBe('신규 자재 1행');
  });

  it('변경 있음 — 요척 차이 / 작지 수량 차이 / 혼용률 채움·다름', () => {
    expect(kindOf(input(0, 'S', compare([sameRow({ consumption: 2 })])))).toBe('changed');
    expect(kindOf(input(0, 'S', compare([sameRow({ requiredQty: 120 })])))).toBe('changed'); // 기존 sheetQty 100
    expect(kindOf(input(0, 'S', compare([sameRow({ compositionStatus: 'fillEmpty' })])))).toBe('changed');
    expect(kindOf(input(0, 'S', compare([sameRow({ compositionStatus: 'differs' })])))).toBe('changed');
  });

  it('변경 있음 — 비슷한 이름 후보·삭제 후보(기존에만 있는 행)', () => {
    const similar: SalesOrderBomCompareRow = { type: 'similar', incomingIndex: 0, existing: existing(), incoming: { itemName: '자재A2' } };
    const onlyExisting: SalesOrderBomCompareRow = { type: 'existingOnly', existing: existing({ bomItemId: 2 }) };
    expect(classifyBulkPrecheck([input(0, 'S', compare([similar]))])[0].counts.changedRows).toBe(1);
    const e = classifyBulkPrecheck([input(0, 'S', compare([onlyExisting]))])[0];
    expect(e.kind).toBe('changed');
    expect(e.counts.removeCandidates).toBe(1);
  });

  it('변경 있음 — 오더개요 differs / fillEmpty (자재 행이 같아도)', () => {
    expect(kindOf(input(0, 'S', compare([sameRow()], [ov('differs')])))).toBe('changed');
    expect(kindOf(input(0, 'S', compare([sameRow()], [ov('fillEmpty', 'brand')])))).toBe('changed');
    const e = classifyBulkPrecheck([input(0, 'S', compare([sameRow()], [ov('differs'), ov('fillEmpty', 'brand'), ov('same', 'itemType')]))])[0];
    expect(e.counts.overviewItems).toBe(2);
  });

  it('자재 행이 없는 기존 스타일(오더개요만 있음)도 기존 스타일로 본다', () => {
    expect(kindOf(input(0, 'S', compare([], [ov('same')], false)))).toBe('unchanged');
    expect(kindOf(input(0, 'S', compare([], [ov('differs')], false)))).toBe('changed');
  });

  it('확인 필요 — 점검 호출 실패', () => {
    const e = classifyBulkPrecheck([input(0, 'S', null, { compareFailed: true })])[0];
    expect(e.kind).toBe('needsCheck');
    expect(e.reason).toContain('점검에 실패');
  });

  it('확인 필요 — 스타일번호 없음', () => {
    expect(kindOf(input(0, null, compare([], undefined, false)))).toBe('needsCheck');
  });

  it('확인 필요 — 저장 전 이미 걸리는 조건(blockedReason)은 compare 결과가 신규여도 우선', () => {
    const e = classifyBulkPrecheck([input(0, 'S', compare([], undefined, false), { blockedReason: '원본 대조 안 함' })])[0];
    expect(e.kind).toBe('needsCheck');
    expect(e.reason).toBe('원본 대조 안 함');
  });

  it('확인 필요 — 같은 배치에 같은 스타일번호가 2건 이상이면 모두 확인 필요(어느 것을 저장할지 모호)', () => {
    const c = compare([], undefined, false);
    const entries = classifyBulkPrecheck([input(0, 'S-DUP', c), input(1, 'S-DUP', c), input(2, 'S-OK', c)]);
    expect(entries.map((e) => e.kind)).toEqual(['needsCheck', 'needsCheck', 'new']);
    expect(entries[0].reason).toContain('2건 이상');
    expect([...findDuplicateStyleNos([{ styleNo: 'A' }, { styleNo: 'A' }, { styleNo: null }, { styleNo: null }])]).toEqual(['A']);
  });

  it('요약 문구·숫자 집계', () => {
    const entries = classifyBulkPrecheck([
      input(0, 'S-NEW', compare([], undefined, false)),
      input(1, 'S-SAME', compare([sameRow()], [ov('same')])),
      input(2, 'S-CHG', compare([sameRow(), { type: 'new', incomingIndex: 1, incoming: { itemName: 'B' } }, { type: 'new', incomingIndex: 2, incoming: { itemName: 'C' } }], [ov('differs'), ov('differs', 'totalQty')])),
      input(3, null, null),
    ]);
    const summary = summarizePrecheck(entries);
    expect(summary).toEqual({ new: 1, unchanged: 1, changed: 1, needsCheck: 1 });
    expect(formatPrecheckHeadline(summary)).toBe('신규 1건 / 변경 있음 1건 / 변경 없음 1건 / 확인 필요 1건');
    expect(entries[2].summary).toBe('신규 자재 2행, 오더개요 2항목 상이/채움');
    expect(formatPrecheckSummary({ newRows: 0, changedRows: 1, removeCandidates: 1, overviewItems: 0 })).toBe('값 변경 1행, 삭제 후보 1행');
  });

  it('listOverviewChangeLabels: 바뀔 오더개요 항목 이름만', () => {
    expect(listOverviewChangeLabels(compare([], [ov('differs'), ov('same', 'brand'), ov('fillEmpty', 'totalQty')], false))).toEqual(['바이어', '총수량']);
  });
});

describe('일괄 저장 대상 선택 (PR-250 핵심 회귀)', () => {
  const entries = classifyBulkPrecheck([
    input(0, 'S-NEW1', compare([], undefined, false)),
    input(1, 'S-CHG', compare([sameRow({ consumption: 3 })])),
    input(2, 'S-SAME', compare([sameRow()])),
    input(3, 'S-NEW2', compare([], undefined, false)),
    input(4, null, null),
    input(5, 'S-FAIL', null, { compareFailed: true }),
  ]);

  it('selectNewTargets 는 신규만 — 변경 있음·변경 없음·확인 필요는 절대 포함되지 않는다', () => {
    expect(selectNewTargets(entries)).toEqual([0, 3]);
    for (const i of selectNewTargets(entries)) expect(entries.find((e) => e.index === i)!.kind).toBe('new');
  });

  it('이미 저장된 스타일은 신규 대상에서도 빠진다(중복 저장 방지)', () => {
    expect(selectNewTargets(entries, new Set([0]))).toEqual([3]);
  });

  it('동일 스타일(변경 없음)은 저장 대상이 아니다', () => {
    expect(selectNewTargets(entries)).not.toContain(2);
    expect(selectChangedIndexes(entries)).toEqual([1]);
  });

  it('nextChangedIndex: 저장 안 된 변경 건을 표 순서대로(없으면 null)', () => {
    const more = classifyBulkPrecheck([
      input(0, 'A', compare([sameRow({ consumption: 2 })])),
      input(1, 'B', compare([], undefined, false)),
      input(2, 'C', compare([sameRow({ consumption: 2 })])),
    ]);
    expect(nextChangedIndex(more, new Set())).toBe(0);
    expect(nextChangedIndex(more, new Set([0]))).toBe(2);
    expect(nextChangedIndex(more, new Set(), 0)).toBe(2);
    expect(nextChangedIndex(more, new Set([0, 2]))).toBeNull();
  });

  it('isStillNew: 저장 직전 재확인 — 기존 BOM·오더개요가 생겼으면 신규가 아니다', () => {
    expect(isStillNew(compare([], undefined, false))).toBe(true);
    expect(isStillNew(compare([sameRow()]))).toBe(false);
    expect(isStillNew(compare([], [ov('same')], false))).toBe(false);
    expect(isStillNew(null)).toBe(false);
  });
});

describe('runWithConcurrency (PR-250)', () => {
  it('동시 실행 수를 제한하고 결과를 입력 순서대로 돌려준다', async () => {
    let active = 0;
    let maxActive = 0;
    const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('한 항목의 실패가 전체를 막지 않는다(그 항목만 error)', async () => {
    const results = await runWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1].ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, value: 3 });
  });

  it('빈 입력도 정상(결과 빈 배열)', async () => {
    expect(await runWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});

// PR-250 보강(MERGE-55 Gate A ③): 모르는 값은 안전한 쪽(변경 있음 / 확인 필요)으로 — fail-closed. 합성 값만 사용.
describe('classifyBulkPrecheck — 알 수 없는 값은 변경 있음, 비정상 응답은 확인 필요 (PR-250 보강)', () => {
  const weird = (v: unknown) => v as any;
  const kind = (c: unknown) => classifyBulkPrecheck([{ index: 0, styleNo: 'S-X', compare: c as any }])[0];

  it('미지의 자재 행 type → 변경 있음(변경 없음·신규로 분류되지 않음)', () => {
    for (const type of ['moved', '', 7, null, undefined]) {
      const e = kind(compare([weird({ type, existing: existing(), incoming: { itemName: 'A' } })]));
      expect(e.kind).toBe('changed');
      expect(e.counts.unknownItems).toBe(1);
      expect(e.summary).toContain('해석할 수 없는 값 1건');
    }
  });

  it('미지의 오더개요 status → 변경 있음', () => {
    for (const status of ['pending', '', 3, null, undefined]) {
      const e = kind(compare([sameRow()], [weird({ field: 'buyer', existing: 'A', incoming: 'B', status })]));
      expect(e.kind).toBe('changed');
      expect(e.counts.unknownItems).toBe(1);
    }
  });

  it('미지의 혼용률 status(누락 포함) → 변경 있음', () => {
    for (const compositionStatus of ['weird', '', 9, null, undefined]) {
      const row = { ...sameRow(), compositionStatus: weird(compositionStatus) };
      const e = kind(compare([row]));
      expect(e.kind).toBe('changed');
      expect(e.counts.unknownItems).toBe(1);
    }
  });

  it('same 행인데 기존·들어온 행이 빠져 있으면(판단 불가) 변경 있음', () => {
    const e = kind(compare([weird({ type: 'same', compositionStatus: 'same' })]));
    expect(e.kind).toBe('changed');
  });

  it('알려진 값 조합은 기존과 같은 결과(회귀): 신규 / 변경 없음 / 변경 있음', () => {
    expect(kind(compare([], undefined, false)).kind).toBe('new');
    expect(kind(compare([sameRow({ compositionStatus: 'same' }), sameRow({ compositionStatus: 'incomingEmpty' })], [ov('same'), ov('incomingEmpty', 'brand')])).kind).toBe('unchanged');
    expect(kind(compare([sameRow({ compositionStatus: 'fillEmpty' })])).kind).toBe('changed');
    expect(kind(compare([sameRow()], [ov('differs')])).kind).toBe('changed');
    expect(kind(compare([sameRow()])).counts.unknownItems).toBe(0);
  });

  it('응답 구조가 비정상이면 변경 없음이 아니라 확인 필요', () => {
    const bad: unknown[] = [
      {},
      { hasExistingBom: true },
      { hasExistingBom: true, rows: 'x' },
      { hasExistingBom: true, rows: {} },
      { hasExistingBom: true, rows: [], overview: 'x' },
      { hasExistingBom: true, rows: [], overview: {} },
      { hasExistingBom: 'yes', rows: [] },
      { rows: [] },
      'text',
      42,
    ];
    for (const c of bad) {
      const e = kind(c);
      expect(e.kind).toBe('needsCheck');
      expect(e.reason).toContain('해석할 수 없습니다');
    }
  });

  it('신규는 기존 행·오더개요가 없음이 명확할 때만 — 자재 행이 남아 있는 모순된 응답은 변경 있음', () => {
    const e = kind(compare([sameRow()], undefined, false));
    expect(e.kind).toBe('changed');
  });

  it('미지의 값이 섞인 스타일은 selectNewTargets 에 포함되지 않고, 변경 있음으로 표에 남는다(저장 대상에서 조용히 사라지지 않음)', () => {
    const entries = classifyBulkPrecheck([
      { index: 0, styleNo: 'S-NEW', compare: compare([], undefined, false) },
      { index: 1, styleNo: 'S-UNK', compare: compare([weird({ type: 'moved', existing: existing(), incoming: { itemName: 'A' } })]) },
      { index: 2, styleNo: 'S-BAD', compare: weird({ rows: 'x' }) },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['new', 'changed', 'needsCheck']);
    expect(selectNewTargets(entries)).toEqual([0]);
    expect(selectChangedIndexes(entries)).toEqual([1]); // "비교하고 저장"으로 사람이 확인
    expect(summarizePrecheck(entries)).toEqual({ new: 1, changed: 1, unchanged: 0, needsCheck: 1 });
  });
});

describe('isStillNew — 저장 직전 재확인도 fail-closed (PR-250 보강)', () => {
  it('비정상 응답은 신규가 아니다(저장하지 않음)', () => {
    for (const fresh of [null, undefined, {}, 'x', { rows: [] }, { hasExistingBom: false }, { hasExistingBom: false, rows: 'x' }, { hasExistingBom: false, rows: [], overview: 'x' }, { hasExistingBom: 'no', rows: [] }]) {
      expect(isStillNew(fresh as any)).toBe(false);
    }
  });

  it('기존 행 목록이 비어 있지 않은 모순 응답은 신규가 아니다, 명확히 비어 있을 때만 신규', () => {
    expect(isStillNew({ hasExistingBom: false, rows: [{ type: 'new' }] } as any)).toBe(false);
    expect(isStillNew({ hasExistingBom: false, rows: [], overview: [] })).toBe(true);
    expect(isStillNew({ hasExistingBom: false, rows: [] })).toBe(true);
  });
});

