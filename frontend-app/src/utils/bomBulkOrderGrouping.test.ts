import { describe, it, expect, vi } from 'vitest';
import {
  buildInitialDrafts,
  groupDraftsBySupplier,
  isDraftReadyForCreate,
  canCreateBulkOrders,
  summarizeBulkOrders,
  buildBulkOrderCreatePayload,
  createOrdersBySupplier,
  type BulkOrderRowInput,
  type BulkOrderRowDraft,
  type SupplierGroup,
} from './bomBulkOrderGrouping';

const row = (overrides: Partial<BulkOrderRowInput> = {}): BulkOrderRowInput => ({
  bomItemId: 1,
  itemId: 100,
  itemName: '자재A',
  category: '부자재',
  colorCode: 'BK',
  unit: 'Y',
  candidateSupplierId: null,
  alreadyOrderedCount: 0,
  suggestedQuantity: 50,
  ...overrides,
});

// PR-238: 공급사별 그룹핑/검증 순수 로직. 합성 값만 사용.
describe('bomBulkOrderGrouping (PR-238)', () => {
  it('초기 draft는 후보 공급업체·제안 수량을 그대로 들고 오고, 단가/구분은 비어 있다', () => {
    const drafts = buildInitialDrafts([row({ candidateSupplierId: 7, suggestedQuantity: 30 })]);
    expect(drafts[0]).toMatchObject({ supplierId: 7, quantity: 30, unitPrice: null, orderType: null, excluded: false });
  });

  it('공급업체가 없으면 unassigned로 분류되고, 있으면 해당 업체 그룹으로 들어간다', () => {
    const drafts = buildInitialDrafts([
      row({ bomItemId: 1, candidateSupplierId: 7 }),
      row({ bomItemId: 2, candidateSupplierId: null }),
      row({ bomItemId: 3, candidateSupplierId: 7 }),
    ]);
    const { groups, unassigned } = groupDraftsBySupplier(drafts);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe(7);
    expect(groups[0].rows.map((r) => r.bomItemId).sort()).toEqual([1, 3]);
    expect(unassigned.map((r) => r.bomItemId)).toEqual([2]);
  });

  it('제외(excluded) 행은 그룹에서도 unassigned에서도 빠진다', () => {
    const drafts = buildInitialDrafts([row({ bomItemId: 1, candidateSupplierId: null })]);
    drafts[0].excluded = true;
    const { groups, unassigned } = groupDraftsBySupplier(drafts);
    expect(groups).toHaveLength(0);
    expect(unassigned).toHaveLength(0);
  });

  it('공급업체를 수동으로 지정하면(unassigned → 업체 그룹) 이동한다', () => {
    const drafts = buildInitialDrafts([row({ bomItemId: 1, candidateSupplierId: null })]);
    drafts[0].supplierId = 9;
    const { groups, unassigned } = groupDraftsBySupplier(drafts);
    expect(unassigned).toHaveLength(0);
    expect(groups[0].supplierId).toBe(9);
  });

  // PR-240: BOM 공급사/확정 단가가 미리 채워져 들어오면(호출하는 쪽의 orderPrefill
  // 계산 결과) 그 출처까지 draft에 그대로 전달된다.
  it('PR-240: candidateSupplierId/suggestedUnitPrice와 그 출처가 draft에 그대로 전달된다', () => {
    const drafts = buildInitialDrafts([
      row({ candidateSupplierId: 7, candidateSupplierSource: 'bom', suggestedUnitPrice: 1000, priceSource: 'bom' }),
    ]);
    expect(drafts[0]).toMatchObject({ supplierId: 7, supplierSource: 'bom', unitPrice: 1000, priceSource: 'bom' });
  });

  it('PR-240: 공급업체/단가가 없으면(null) 출처도 null이다(값 없는데 출처만 있는 상태를 만들지 않음)', () => {
    const drafts = buildInitialDrafts([row({ candidateSupplierId: null, candidateSupplierSource: 'bom', suggestedUnitPrice: null, priceSource: 'bom' })]);
    expect(drafts[0]).toMatchObject({ supplierId: null, supplierSource: null, unitPrice: null, priceSource: null });
  });

  const ready = (overrides: Partial<BulkOrderRowDraft> = {}): BulkOrderRowDraft => ({
    bomItemId: 1,
    itemId: 100,
    itemName: '자재A',
    category: '부자재',
    colorCode: 'BK',
    unit: 'Y',
    supplierId: 7,
    supplierSource: null,
    quantity: 50,
    unitPrice: 10,
    priceSource: null,
    orderType: 'FIRM',
    excluded: false,
    alreadyOrderedCount: 0,
    alreadyOrderedConfirmed: false,
    ...overrides,
  });

  it('공급업체·수량·단가가 모두 있으면(실발주) 생성 준비 완료', () => {
    expect(isDraftReadyForCreate(ready())).toBe(true);
  });

  it('공급업체가 없으면 생성할 수 없다', () => {
    expect(isDraftReadyForCreate(ready({ supplierId: null }))).toBe(false);
  });

  it('수량이 없거나 0이면(근거 없음/극단 불일치로 비워둔 경우) 생성할 수 없다', () => {
    expect(isDraftReadyForCreate(ready({ quantity: null }))).toBe(false);
    expect(isDraftReadyForCreate(ready({ quantity: 0 }))).toBe(false);
  });

  it('가발주(PROVISIONAL)는 단가가 없어도 생성 가능(PR-173 정책 재사용)', () => {
    expect(isDraftReadyForCreate(ready({ orderType: 'PROVISIONAL', unitPrice: null }))).toBe(true);
  });

  it('실발주인데 단가가 없으면 생성할 수 없다', () => {
    expect(isDraftReadyForCreate(ready({ orderType: 'FIRM', unitPrice: null }))).toBe(false);
  });

  it('이미 발주된 자재는 확인 체크 전까지 생성할 수 없다', () => {
    expect(isDraftReadyForCreate(ready({ alreadyOrderedCount: 2, alreadyOrderedConfirmed: false }))).toBe(false);
    expect(isDraftReadyForCreate(ready({ alreadyOrderedCount: 2, alreadyOrderedConfirmed: true }))).toBe(true);
  });

  it('제외된 행은 항상 준비 완료로 본다(검증 대상에서 빠짐)', () => {
    expect(isDraftReadyForCreate(ready({ excluded: true, supplierId: null, quantity: null }))).toBe(true);
  });

  it('canCreateBulkOrders — 포함된 행이 전부 준비돼야 true, 하나라도 미비하면 false', () => {
    expect(canCreateBulkOrders([ready(), ready({ bomItemId: 2 })])).toBe(true);
    expect(canCreateBulkOrders([ready(), ready({ bomItemId: 2, supplierId: null })])).toBe(false);
  });

  it('canCreateBulkOrders — 포함된 행이 하나도 없으면(전부 제외) false', () => {
    expect(canCreateBulkOrders([ready({ excluded: true })])).toBe(false);
  });

  it('summarizeBulkOrders — 업체 수/총 건수를 집계한다(미지정은 제외)', () => {
    const drafts = [
      ready({ bomItemId: 1, supplierId: 7 }),
      ready({ bomItemId: 2, supplierId: 7 }),
      ready({ bomItemId: 3, supplierId: 9 }),
      ready({ bomItemId: 4, supplierId: null }),
    ];
    expect(summarizeBulkOrders(drafts)).toEqual({ supplierCount: 2, totalCount: 3 });
  });

  it('buildBulkOrderCreatePayload — 한 업체 그룹만 변환하고 styleNo를 각 행에 채운다', () => {
    const group = { supplierId: 7, rows: [ready({ bomItemId: 1, itemId: 100 }), ready({ bomItemId: 2, itemId: 200, orderType: 'PROVISIONAL', unitPrice: null })] };
    const payload = buildBulkOrderCreatePayload(group, 'MB00AAA000Z');
    expect(payload).toEqual([
      { supplierId: 7, itemId: 100, quantity: 50, unitPrice: 10, orderType: 'FIRM', styleNo: 'MB00AAA000Z' },
      { supplierId: 7, itemId: 200, quantity: 50, unitPrice: undefined, orderType: 'PROVISIONAL', styleNo: 'MB00AAA000Z' },
    ]);
  });

  describe('createOrdersBySupplier — 업체별 독립 생성/롤백(합성 createFn으로 서버 트랜잭션 분리 검증)', () => {
    const groupA: SupplierGroup = { supplierId: 7, rows: [ready({ bomItemId: 1, itemId: 100 })] };
    const groupB: SupplierGroup = { supplierId: 9, rows: [ready({ bomItemId: 2, itemId: 200 })] };

    it('한 업체가 실패해도 다른 업체는 영향 없이 계속 시도되고, 실패한 업체는 생성 건수 0으로 남는다(업체 내부 전체 롤백)', async () => {
      const createFn = vi.fn(async (payload) => {
        if (payload[0].supplierId === 7) throw new Error('재고 부족');
        return payload.map((_: unknown, i: number) => ({ id: 1000 + i }));
      });
      const results = await createOrdersBySupplier([groupA, groupB], 'MB00AAA000Z', createFn);
      expect(createFn).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        { supplierId: 7, success: false, createdIds: [], reason: '재고 부족' },
        { supplierId: 9, success: true, createdIds: [1000] },
      ]);
    });

    it('모든 업체가 성공하면 각 업체의 생성된 id를 그대로 모은다', async () => {
      const createFn = vi.fn(async (payload) => payload.map((p: any) => ({ id: p.supplierId * 10 })));
      const results = await createOrdersBySupplier([groupA, groupB], 'MB00AAA000Z', createFn);
      expect(results).toEqual([
        { supplierId: 7, success: true, createdIds: [70] },
        { supplierId: 9, success: true, createdIds: [90] },
      ]);
    });

    it('업체 내부에 여러 행이 있을 때 하나라도 실패하면(서버가 전체 트랜잭션 거부) 그 업체 전체가 생성 안 된 것으로 기록된다', async () => {
      const multiRowGroup: SupplierGroup = {
        supplierId: 7,
        rows: [ready({ bomItemId: 1, itemId: 100 }), ready({ bomItemId: 2, itemId: 101 })],
      };
      const createFn = vi.fn(async () => {
        throw new Error('공급업체를 찾을 수 없습니다');
      });
      const results = await createOrdersBySupplier([multiRowGroup], 'MB00AAA000Z', createFn);
      expect(results).toEqual([{ supplierId: 7, success: false, createdIds: [], reason: '공급업체를 찾을 수 없습니다' }]);
    });
  });
});
