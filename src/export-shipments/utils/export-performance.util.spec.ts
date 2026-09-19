import { aggregateExportPerformance, UNCLASSIFIED_BRAND } from './export-performance.util';

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
      shipments: [],
    });
  });
});
