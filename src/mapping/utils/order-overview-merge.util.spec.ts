import { classifyOrderOverviewField, compareOrderOverview, ORDER_OVERVIEW_FIELDS } from './order-overview-merge.util';

// PR-249: 오더개요 항목 판정 — 합성 값만 사용.
describe('order-overview-merge.util (PR-249)', () => {
  it('허용 필드는 7개(공장·CMT단가 제외)', () => {
    expect([...ORDER_OVERVIEW_FIELDS]).toEqual(['totalQty', 'buyer', 'styleName', 'brand', 'itemType', 'productionType', 'targetRdd']);
  });

  it.each([
    ['buyer', null, 'B', 'fillEmpty'],
    ['buyer', '', 'B', 'fillEmpty'],
    ['buyer', '  ', 'B', 'fillEmpty'],
    ['buyer', 'A', 'A', 'same'],
    ['buyer', 'A', 'B', 'differs'],
    ['buyer', 'A', '', 'incomingEmpty'],
    ['buyer', 'A', null, 'incomingEmpty'],
    ['buyer', 'A', undefined, 'incomingEmpty'],
    ['buyer', 'A', '  ', 'incomingEmpty'],
  ])('%s: 기존 %p / 들어온 %p → %s', (field, existing, incoming, status) => {
    expect(classifyOrderOverviewField(field as any, existing, incoming).status).toBe(status);
  });

  it('문자열은 trim·대소문자 변환 없이 비교한다(대소문자만 달라도 differs)', () => {
    expect(classifyOrderOverviewField('buyer', 'Buyer A', 'buyer a').status).toBe('differs');
    expect(classifyOrderOverviewField('buyer', 'Buyer A', ' Buyer A').status).toBe('differs');
  });

  it('총수량: 숫자는 값 비교(문자열 "100" 과 100 은 같음), 0·음수·NaN 은 비어 있음', () => {
    expect(classifyOrderOverviewField('totalQty', '100', 100).status).toBe('same');
    expect(classifyOrderOverviewField('totalQty', 100, 250).status).toBe('differs');
    expect(classifyOrderOverviewField('totalQty', 0, 250).status).toBe('fillEmpty');
    expect(classifyOrderOverviewField('totalQty', 100, 0).status).toBe('incomingEmpty');
    expect(classifyOrderOverviewField('totalQty', 100, -1).status).toBe('incomingEmpty');
    expect(classifyOrderOverviewField('totalQty', 100, 'abc').status).toBe('incomingEmpty');
  });

  it('납기: Date 와 YYYY-MM-DD 문자열은 날짜로 비교한다', () => {
    expect(classifyOrderOverviewField('targetRdd', new Date('2027-03-01T00:00:00Z'), '2027-03-01').status).toBe('same');
    expect(classifyOrderOverviewField('targetRdd', '2027-03-01', '2027-04-01').status).toBe('differs');
    expect(classifyOrderOverviewField('targetRdd', null, '2027-04-01').status).toBe('fillEmpty');
  });

  it('compareOrderOverview 는 7개 필드를 순서대로 돌려주고 표시값(existing/incoming)을 정규화해 담는다', () => {
    const rows = compareOrderOverview({ buyer: 'A', totalQty: '100' }, { buyer: 'B', totalQty: 100, brand: 'X' });
    expect(rows.map((r) => r.field)).toEqual([...ORDER_OVERVIEW_FIELDS]);
    expect(rows.find((r) => r.field === 'buyer')).toEqual({ field: 'buyer', existing: 'A', incoming: 'B', status: 'differs' });
    expect(rows.find((r) => r.field === 'totalQty')).toMatchObject({ existing: 100, incoming: 100, status: 'same' });
    expect(rows.find((r) => r.field === 'brand')).toMatchObject({ existing: null, incoming: 'X', status: 'fillEmpty' });
  });
});
