import { findOuterFabricPair } from './outer-fabric-pair.util';
import {
  classifySalesOrderBomCompare,
  type SalesOrderBomCompareExistingRow,
  type SalesOrderBomCompareIncomingRow,
} from './sales-order-bom-compare.util';

// PR-257: 겉감 짝(기존 겉감 계열 정확히 1개 + 새 인식 겉감 계열 정확히 1개) — 합성 값만.
const ex = (bomItemId: number, category: string | null, overrides: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId, itemName: `기존${bomItemId}`, englishName: null, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, unit: null, remarks: null,
  hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false, linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null, ...overrides,
});
const inc = (category: string | null, itemName: string, overrides: Partial<SalesOrderBomCompareIncomingRow> = {}): SalesOrderBomCompareIncomingRow => ({
  itemName, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, ...overrides,
});

describe('findOuterFabricPair (PR-257)', () => {
  it('기존 겉감 1·새 겉감 1이면 한 쌍(구분 표기·색상·규격과 무관)', () => {
    expect(findOuterFabricPair([{ bomItemId: 7, category: '겉감 OUT-SHELL' }, { bomItemId: 8, category: '안감' }], [{ category: '안감' }, { category: '겉감' }])).toEqual({ existingBomItemId: 7, incomingIndex: 1 });
    expect(findOuterFabricPair([{ bomItemId: 1, category: '겉감\r\nOUT-SHELL' }], [{ category: 'out shell ' }])).toEqual({ existingBomItemId: 1, incomingIndex: 0 });
  });

  it('겉감 계열이 0개이거나 2개 이상이면(기존·새 인식 어느 쪽이든) 짝이 없다', () => {
    expect(findOuterFabricPair([{ bomItemId: 1, category: '안감' }], [{ category: '겉감' }])).toBeNull();
    expect(findOuterFabricPair([{ bomItemId: 1, category: '겉감' }], [{ category: '안감' }])).toBeNull();
    expect(findOuterFabricPair([{ bomItemId: 1, category: '겉감' }, { bomItemId: 2, category: 'OUT SHELL' }], [{ category: '겉감' }])).toBeNull();
    expect(findOuterFabricPair([{ bomItemId: 1, category: '겉감' }], [{ category: '겉감' }, { category: '겉감' }])).toBeNull();
    expect(findOuterFabricPair([], [])).toBeNull();
  });

  it('안감·배색·INTERLINING·부자재는 겉감 계열이 아니다(LINING ⊄ INTERLINING)', () => {
    for (const c of ['안감', 'LINING', '배색 COMBINATION', 'INTERLINING', '심 지\r\nINTERLINING', 'EDGE TAPE', 'PAD', '단추', 'FABRIC', null, undefined]) {
      expect(findOuterFabricPair([{ bomItemId: 1, category: c as string }], [{ category: '겉감' }])).toBeNull();
      expect(findOuterFabricPair([{ bomItemId: 1, category: '겉감' }], [{ category: c as string }])).toBeNull();
    }
  });
});

describe('classifySalesOrderBomCompare — 겉감 짝 (PR-257)', () => {
  it('엑셀 겉감 행 + 작지 겉감 행(이름·구분·색상·규격이 다름)이 outerFabricPair similar 로 묶인다', () => {
    const rows = classifySalesOrderBomCompare(
      [ex(1, '겉감 OUT-SHELL', { itemName: '겉감 OUT-SHELL', colorCode: 'N/A', composition: null }), ex(2, '안감', { itemName: '안감자재' })],
      [inc('겉감', '합성소재', { colorCode: 'NV', spec: '58"', composition: 'WOOL 100%' }), inc('안감', '안감자재')],
    );
    const pair = rows.filter((r) => r.outerFabricPair);
    expect(pair).toHaveLength(1);
    expect(pair[0]).toMatchObject({ type: 'similar', incomingIndex: 0, compositionStatus: 'fillEmpty' });
    expect(pair[0].existing?.bomItemId).toBe(1);
    expect(rows.filter((r) => r.type === 'existingOnly' || r.type === 'new')).toHaveLength(0); // 삭제+추가로 갈라지지 않는다
    expect(rows.filter((r) => r.type === 'same')).toHaveLength(1);
  });

  it('겉감 짝 조건이 아니면 기존 분류 그대로(기존 겉감 2개 / 새 겉감 2개 / 겉감 없음)', () => {
    const two = classifySalesOrderBomCompare([ex(1, '겉감'), ex(2, '겉감 OUT-SHELL')], [inc('겉감', '합성소재')]);
    expect(two.some((r) => r.outerFabricPair)).toBe(false);
    expect(two.filter((r) => r.type === 'new')).toHaveLength(1);
    const newTwo = classifySalesOrderBomCompare([ex(1, '겉감 OUT-SHELL')], [inc('겉감', '소재A'), inc('겉감', '소재B', { colorCode: 'NV' })]);
    expect(newTwo.some((r) => r.outerFabricPair)).toBe(false);
    const none = classifySalesOrderBomCompare([ex(1, '안감')], [inc('INTERLINING', '심지')]);
    expect(none.some((r) => r.outerFabricPair)).toBe(false);
    expect(none.map((r) => r.type).sort()).toEqual(['existingOnly', 'new']);
  });

  it('이미 same 으로 맞은 겉감 행은 짝 제안으로 바꾸지 않는다', () => {
    const rows = classifySalesOrderBomCompare([ex(1, '겉감', { itemName: '같은소재' })], [inc('겉감', '같은소재')]);
    expect(rows).toEqual([expect.objectContaining({ type: 'same' })]);
    expect(rows[0].outerFabricPair).toBeUndefined();
  });

  it('기존 similar 규칙으로 이미 짝지어진 겉감 한 쌍은 outerFabricPair 표시만 붙고 행은 늘지 않는다', () => {
    const rows = classifySalesOrderBomCompare([ex(1, '겉감', { itemName: '소재A(면)' })], [inc('겉감', '소재A')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'similar', outerFabricPair: true });
  });

  it('겉감이 아닌 행(안감 등)의 similar 는 기존 규칙(구분·색상 일치) 그대로이며 짝 표시가 없다', () => {
    const rows = classifySalesOrderBomCompare([ex(1, '안감', { itemName: '안감A(면)' })], [inc('안감', '안감A')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'similar' });
    expect(rows[0].outerFabricPair).toBeUndefined();
  });
});
