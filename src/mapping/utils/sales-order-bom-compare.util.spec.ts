import { classifySalesOrderBomCompare, type SalesOrderBomCompareExistingRow, type SalesOrderBomCompareIncomingRow } from './sales-order-bom-compare.util';

const existingRow = (overrides: Partial<SalesOrderBomCompareExistingRow>): SalesOrderBomCompareExistingRow => ({
  bomItemId: 1,
  itemName: '자재A',
  englishName: null,
  category: 'FABRIC',
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

const incomingRow = (overrides: Partial<SalesOrderBomCompareIncomingRow>): SalesOrderBomCompareIncomingRow => ({
  itemName: '자재A',
  category: 'FABRIC',
  colorCode: null,
  spec: null,
  consumption: 1,
  requiredQty: 100,
  ...overrides,
});

// PR-235(PILOT-23 후속): 작지 저장 전 비교 분류 — 합성 값만 사용.
describe('classifySalesOrderBomCompare (PR-235)', () => {
  it('정규화 이름+색상+규격이 모두 같으면 same(갱신 대상)', () => {
    const rows = classifySalesOrderBomCompare([existingRow({})], [incomingRow({ itemName: '자재A ' })]);
    expect(rows).toEqual([expect.objectContaining({ type: 'same', incomingIndex: 0 })]);
  });

  it('공백/괄호 기호/대소문자만 다른 이름도 same(PR-233 정규화 일치)', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '다데(실크)' })],
      [incomingRow({ itemName: '다데<실크>' })],
    );
    expect(rows[0].type).toBe('same');
  });

  it('이름이 비슷하고 색상·구분이 같으면 similar(제안, 1:1일 때만)', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '르카이KL-R114' })],
      [incomingRow({ itemName: 'KL-R114' })],
    );
    expect(rows).toEqual([expect.objectContaining({ type: 'similar', incomingIndex: 0 })]);
  });

  it('다데<면> vs 다데<실크>는 괄호/꺾쇠 안 내용이 달라 similar 후보로 제안되지 않는다(각각 new/existingOnly)', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '다데<면>' })],
      [incomingRow({ itemName: '다데<실크>' })],
    );
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(['existingOnly', 'new']);
  });

  it('이름은 비슷해도 색상이 다르면 similar 후보가 아니다(각각 new/existingOnly)', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '자재A', colorCode: 'BK' })],
      [incomingRow({ itemName: '자재A', colorCode: 'CR' })],
    );
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(['existingOnly', 'new']);
  });

  // commit()의 실제 매칭 키(정규화 이름+colorCode+spec)에는 category가 들어가지 않는다
  // (commit()이 기존 행에 category를 덮어쓰지도 않는다) — 그래서 이름/색상/규격이
  // 같으면 category가 달라도 same이다. "similar" 후보 판단에서는(이름 자체가 다를 때)
  // category까지 같아야만 제안한다(아래 테스트).
  it('이름·색상·규격이 같으면 구분(category)이 달라도 same(commit()의 실제 매칭 키와 동일)', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '자재A', category: 'FABRIC' })],
      [incomingRow({ itemName: '자재A', category: '부자재' })],
    );
    expect(rows[0].type).toBe('same');
  });

  it('이름이 비슷하고(완전 일치 아님) 구분이 다르면 similar 후보로 제안하지 않는다', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '르카이KL-R114', category: 'FABRIC' })],
      [incomingRow({ itemName: 'KL-R114', category: '부자재' })],
    );
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(['existingOnly', 'new']);
  });

  it('similar 후보가 1:1이 아니면(모호함) 제안하지 않는다', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ bomItemId: 1, itemName: '자재AB' }), existingRow({ bomItemId: 2, itemName: '자재AC' })],
      [incomingRow({ itemName: '자재A' })],
    );
    expect(rows.every((r) => r.type !== 'similar')).toBe(true);
  });

  it('새 인식에 전혀 없는 기존 행은 existingOnly이고, 연결 정보를 그대로 담는다', () => {
    const rows = classifySalesOrderBomCompare(
      [existingRow({ itemName: '완전히다른자재', linkedPurchaseOrderCount: 2, canDelete: false, blockedReason: '발주 2건 연결' })],
      [incomingRow({ itemName: '새자재' })],
    );
    const existingOnly = rows.find((r) => r.type === 'existingOnly');
    expect(existingOnly?.existing).toMatchObject({ linkedPurchaseOrderCount: 2, canDelete: false, blockedReason: '발주 2건 연결' });
  });

  it('완전히 새로운 이름의 새 인식 행은 new다', () => {
    const rows = classifySalesOrderBomCompare([], [incomingRow({ itemName: '완전신규자재' })]);
    expect(rows).toEqual([expect.objectContaining({ type: 'new', incomingIndex: 0 })]);
  });

  it('기존 행이 없으면 빈 배열(new만 나온다)', () => {
    const rows = classifySalesOrderBomCompare([], []);
    expect(rows).toEqual([]);
  });
});
