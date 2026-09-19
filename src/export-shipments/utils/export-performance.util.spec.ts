import { aggregateExportPerformance, UNCLASSIFIED_BRAND, UNCLASSIFIED_BUYER } from './export-performance.util';

const rules = [
  { prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
  { prefix: 'LB', isNumericStart: false, brandName: '라베' },
  { prefix: null, isNumericStart: true, brandName: '숫자브랜드' },
];

const line = (styleNo: string, qty: unknown, unit: string, amount: unknown) => ({ styleNo, qty, unit, amount });

const shipments = [
  // 확정, 9/10 — 한 문서에 두 브랜드(BF/LB)가 섞여 있다
  { id: 1, status: 'FINALIZED', sheetNo: 'S1', invoiceDate: '2026-09-10', styleNos: ['BF1', 'LB1'], lines: [line('BF1', 100, 'YD', '1000'), line('BF1', 50, 'YD', 500), line('LB1', 10, 'EA', 30)] },
  // 확정, 9/30(기간 끝 날짜 포함) — 단가 미정 라인 포함, 미분류 스타일 포함
  { id: 2, status: 'FINALIZED', sheetNo: 'S2', invoiceDate: '2026-09-30', styleNos: ['BF2', 'ZZ9'], lines: [line('BF2', 20, 'EA', null), line('ZZ9', 5, 'EA', 15)] },
  // 확정, 10/5 — 기간 밖
  { id: 3, status: 'FINALIZED', sheetNo: 'S3', invoiceDate: '2026-10-05', styleNos: ['BF3'], lines: [line('BF3', 999, 'YD', 9999)] },
  // 미확정 — 기간 안이어도 제외
  { id: 4, status: 'DRAFT', sheetNo: 'S4', invoiceDate: '2026-09-15', styleNos: ['BF4'], lines: [line('BF4', 1000, 'YD', 10000)] },
  { id: 5, status: 'REVIEWED', sheetNo: 'S5', invoiceDate: '2026-09-16', styleNos: ['BF5'], lines: [line('BF5', 2000, 'YD', 20000)] },
  // 확정이지만 송장일 없음
  { id: 6, status: 'FINALIZED', sheetNo: 'S6', invoiceDate: null, styleNos: ['LB6'], lines: [line('LB6', 7, 'EA', 70)] },
];

describe('수출 실적표 집계 (PR-119)', () => {
  const period = { from: '2026-09-01', to: '2026-09-30' };

  it('FINALIZED만 집계한다(DRAFT/REVIEWED는 기간 안이어도 제외)', () => {
    const r = aggregateExportPerformance(shipments, rules, period);
    expect(r.shipments.map((s) => s.id)).toEqual([1, 2]);
    const all = aggregateExportPerformance(shipments, rules);
    expect(all.shipments.map((s) => s.id).sort()).toEqual([1, 2, 3, 6]);
    expect(all.totals.qtyByUnit.YD).toBe(150 + 999); // 미확정 1000/2000이 들어가지 않는다
  });

  it('기간(invoiceDate) 필터는 양끝을 포함하고, 날짜 없는 문서는 기간 지정 시 제외/미지정 시 포함', () => {
    expect(aggregateExportPerformance(shipments, rules, { from: '2026-09-10', to: '2026-09-10' }).shipments.map((s) => s.id)).toEqual([1]);
    expect(aggregateExportPerformance(shipments, rules, { from: '2026-09-30' }).shipments.map((s) => s.id)).toEqual([2, 3]);
    expect(aggregateExportPerformance(shipments, rules, { to: '2026-09-09' }).shipments).toEqual([]);
    // 날짜 없는 문서(6)는 기간을 주면 빠지고, 안 주면 목록 맨 뒤에 들어간다
    expect(aggregateExportPerformance(shipments, rules).shipments.map((s) => s.id)).toEqual([1, 2, 3, 6]);
  });

  it('총계: 건수/라인 수/금액, 수량은 단위별로 따로 합산, 단가 미정 라인 수를 알려준다', () => {
    const { totals } = aggregateExportPerformance(shipments, rules, period);
    expect(totals).toEqual({
      shipmentCount: 2,
      lineCount: 5,
      qtyByUnit: { YD: 150, EA: 35 },
      amount: 1000 + 500 + 30 + 0 + 15,
      linesWithoutAmount: 1,
    });
  });

  it('브랜드는 라인 단위로 매긴다 — 한 문서에 섞인 브랜드는 각각 자기 수량/금액을 갖는다', () => {
    const { byBrand, totals } = aggregateExportPerformance(shipments, rules, period);
    expect(byBrand).toEqual([
      { brand: '빈폴', shipmentCount: 2, lineCount: 3, qtyByUnit: { YD: 150, EA: 20 }, amount: 1500 },
      { brand: '라베', shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 10 }, amount: 30 },
      { brand: UNCLASSIFIED_BRAND, shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 5 }, amount: 15 },
    ]);
    // 브랜드별 금액 합 = 전체 금액(헤더 단위로 뭉뚱그렸다면 성립하지 않는다)
    expect(byBrand.reduce((a, b) => a + b.amount, 0)).toBe(totals.amount);
    // 건수는 브랜드별 합(4)이 전체(2)보다 크다 — 여러 브랜드가 섞인 문서는 브랜드마다 한 번씩 센다
    expect(byBrand.reduce((a, b) => a + b.shipmentCount, 0)).toBe(4);
  });

  it('문서 행: 브랜드 목록/문서별 수량·금액·송장일 오름차순', () => {
    const { shipments: rows } = aggregateExportPerformance(shipments, rules, period);
    expect(rows[0]).toMatchObject({ id: 1, sheetNo: 'S1', invoiceDate: '2026-09-10', brands: ['라베', '빈폴'], qtyByUnit: { YD: 150, EA: 10 }, amount: 1530, linesWithoutAmount: 0 });
    expect(rows[1]).toMatchObject({ id: 2, brands: [UNCLASSIFIED_BRAND, '빈폴'].sort(), amount: 15, linesWithoutAmount: 1 });
  });

  it('숫자 시작 규칙, 문자열 decimal, Date 객체 송장일, 단위 없음도 처리한다', () => {
    const r = aggregateExportPerformance(
      [{ id: 9, status: 'FINALIZED', invoiceDate: new Date('2026-09-05T00:00:00Z'), lines: [line('123ABC', '2.5', '', '10.25'), line('123DEF', '0.5', '', '0.75')] }],
      rules,
      period,
    );
    expect(r.shipments[0].invoiceDate).toBe('2026-09-05');
    expect(r.byBrand).toEqual([{ brand: '숫자브랜드', shipmentCount: 1, lineCount: 2, qtyByUnit: { '-': 3 }, amount: 11 }]);
  });

  it('결과가 없으면 0/빈 배열', () => {
    expect(aggregateExportPerformance([], rules, period)).toEqual({
      totals: { shipmentCount: 0, lineCount: 0, qtyByUnit: {}, amount: 0, linesWithoutAmount: 0 },
      byBrand: [],
      byBuyer: [],
      shipments: [],
    });
  });
});

describe('수출 실적표 — 거래처(buyer)별 소계 (PR-121)', () => {
  const period = { from: '2026-09-01', to: '2026-09-30' };
  // StyleOverview.buyer: BF1/BF2는 A무역, LB1은 B상사(앞뒤 공백 포함), ZZ9는 오버뷰가 없고, BF3는 buyer가 빈 문자열
  const buyers = { BF1: 'A무역', BF2: 'A무역', LB1: ' B상사 ', ZZ9: undefined, BF3: '' };

  it('거래처도 브랜드처럼 라인 단위로 매겨, 한 문서에 섞인 거래처가 각자 집계된다', () => {
    const r = aggregateExportPerformance(shipments, rules, period, buyers);
    expect(r.byBuyer).toEqual([
      // 문서1: BF1 x2(1500) + 문서2의 BF2(20 EA, 단가 미정 → 0) = A무역
      { buyer: 'A무역', shipmentCount: 2, lineCount: 3, qtyByUnit: { YD: 150, EA: 20 }, amount: 1500 },
      { buyer: 'B상사', shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 10 }, amount: 30 },
      { buyer: UNCLASSIFIED_BUYER, shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 5 }, amount: 15 },
    ]);
  });

  it('거래처별 금액·수량 합은 전체 합과 일치하고, 건수 합은 섞인 문서 때문에 전체보다 클 수 있다', () => {
    const r = aggregateExportPerformance(shipments, rules, period, buyers);
    expect(r.byBuyer.reduce((a, b) => a + b.amount, 0)).toBe(r.totals.amount);
    expect(r.byBuyer.reduce((a, b) => a + b.lineCount, 0)).toBe(r.totals.lineCount);
    // 문서2는 A무역(BF2)과 미분류(ZZ9)가 섞여 있고 문서1은 A무역+B상사 → 건수 합 4 > 전체 2
    expect(r.byBuyer.reduce((a, b) => a + b.shipmentCount, 0)).toBe(4);
    expect(r.totals.shipmentCount).toBe(2);
  });

  it('StyleOverview가 없는 스타일(맵에 없음)과 buyer가 빈 스타일은 미분류로 묶고 맨 뒤에 둔다', () => {
    const r = aggregateExportPerformance(
      [{ id: 1, status: 'FINALIZED', invoiceDate: '2026-09-01', lines: [line('X1', 1, 'EA', 5), line('X2', 2, 'EA', 7), line('X3', 3, 'EA', 100)] }],
      rules,
      {},
      { X2: '   ', X3: '큰거래처' },
    );
    expect(r.byBuyer.map((b) => b.buyer)).toEqual(['큰거래처', UNCLASSIFIED_BUYER]);
    expect(r.byBuyer[1]).toMatchObject({ lineCount: 2, qtyByUnit: { EA: 3 }, amount: 12 });
  });

  it('문서 행에도 거래처 목록이 들어간다(정렬됨)', () => {
    const { shipments: rows } = aggregateExportPerformance(shipments, rules, period, buyers);
    expect(rows[0].buyers).toEqual(['A무역', 'B상사']);
    expect(rows[1].buyers).toEqual([UNCLASSIFIED_BUYER, 'A무역'].sort());
  });

  it('buyer 정보를 안 넘기면(기존 호출) 전부 미분류 하나로 묶인다', () => {
    const r = aggregateExportPerformance(shipments, rules, period);
    expect(r.byBuyer).toHaveLength(1);
    expect(r.byBuyer[0].buyer).toBe(UNCLASSIFIED_BUYER);
    expect(r.byBuyer[0].amount).toBe(r.totals.amount);
  });

  it('거래처 표기가 다르면 다른 거래처로 본다(자유입력이라 임의로 합치지 않는다)', () => {
    const r = aggregateExportPerformance(
      [{ id: 1, status: 'FINALIZED', invoiceDate: '2026-09-01', lines: [line('A', 1, 'EA', 1), line('B', 1, 'EA', 1)] }],
      rules,
      {},
      { A: 'ABC Co', B: 'ABC Co.' },
    );
    expect(r.byBuyer.map((b) => b.buyer).sort()).toEqual(['ABC Co', 'ABC Co.']);
  });

  it('미확정 문서의 거래처는 집계에 들어가지 않는다', () => {
    const r = aggregateExportPerformance(shipments, rules, period, { ...buyers, BF4: 'D거래처', LB9999: 'E거래처', BF9999: 'F거래처' });
    expect(r.byBuyer.map((b) => b.buyer)).not.toContain('D거래처');
    expect(r.byBuyer.map((b) => b.buyer)).not.toContain('F거래처');
  });
});
