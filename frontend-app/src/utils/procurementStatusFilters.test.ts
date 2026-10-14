import { describe, it, expect } from 'vitest';
import { filterProcurementStatusRows, extractDistinctBrands, toggleStyleSelection, MULTI_STYLE_SELECTION_MAX } from './procurementStatusFilters';
import type { ProcurementStatusRow } from '../api/orderProcessStages.service';

const row = (overrides: Partial<ProcurementStatusRow>): ProcurementStatusRow => ({
  styleNo: 'S', buyer: null, poCreated: false, materialReadiness: { ready: 0, total: 0 },
  exported: false, packed: false, packingPendingPurchaseOrderId: null, overallStatus: '미발주',
  unlinkedPoCount: 0, autoAttributedPoCount: 0, targetRdd: null, brand: null,
  ...overrides,
});

describe('filterProcurementStatusRows (PR-194 보완) — 시즌 2026 FW 선택 시 7~12월 납기만', () => {
  const rows = [
    row({ styleNo: 'A', targetRdd: '2026-08-15' }), // FW
    row({ styleNo: 'B', targetRdd: '2026-03-01' }), // SS
    row({ styleNo: 'C', targetRdd: null }), // 납기 미정
    row({ styleNo: 'D', targetRdd: '2027-08-01' }), // 다른 연도 FW
  ];

  it('2026 FW를 고르면 7~12월 납기 스타일만 남는다', () => {
    const result = filterProcurementStatusRows(rows, { season: { year: 2026, season: 'FW' } });
    expect(result.map((r) => r.styleNo)).toEqual(['A']);
  });

  it('납기 없는 스타일은 시즌 필터에서 기본적으로 제외된다', () => {
    const result = filterProcurementStatusRows(rows, { season: { year: 2026, season: 'FW' } });
    expect(result.some((r) => r.styleNo === 'C')).toBe(false);
  });

  it('includeNoDeliveryDate를 켜면 납기 미정 스타일도 함께 나온다', () => {
    const result = filterProcurementStatusRows(rows, { season: { year: 2026, season: 'FW' }, includeNoDeliveryDate: true });
    expect(result.map((r) => r.styleNo).sort()).toEqual(['A', 'C']);
  });

  it('시즌을 지정하지 않으면(null) 전부 통과한다(다른 조건 없을 때)', () => {
    expect(filterProcurementStatusRows(rows, { season: null })).toHaveLength(4);
  });

  it('2026 SS를 고르면 1~6월 납기만 남는다', () => {
    const result = filterProcurementStatusRows(rows, { season: { year: 2026, season: 'SS' } });
    expect(result.map((r) => r.styleNo)).toEqual(['B']);
  });
});

describe('filterProcurementStatusRows — 브랜드/바이어/상태/키워드', () => {
  const rows = [
    row({ styleNo: 'A', brand: '미센스', buyer: '바이어1', overallStatus: '미발주' }),
    row({ styleNo: 'B', brand: '반에크', buyer: '바이어2', overallStatus: '입고대기' }),
  ];

  it('브랜드로 거른다', () => {
    expect(filterProcurementStatusRows(rows, { brand: '미센스' }).map((r) => r.styleNo)).toEqual(['A']);
  });

  it('종합상태로 거른다', () => {
    expect(filterProcurementStatusRows(rows, { status: '입고대기' }).map((r) => r.styleNo)).toEqual(['B']);
  });

  it('키워드는 스타일번호/바이어 부분일치(기존 동작)', () => {
    expect(filterProcurementStatusRows(rows, { keyword: '바이어1' }).map((r) => r.styleNo)).toEqual(['A']);
  });

  it('조건을 조합하면 AND로 묶인다', () => {
    expect(filterProcurementStatusRows(rows, { brand: '반에크', status: '입고대기' }).map((r) => r.styleNo)).toEqual(['B']);
    expect(filterProcurementStatusRows(rows, { brand: '반에크', status: '미발주' })).toEqual([]);
  });
});

describe('extractDistinctBrands (PR-194 보완)', () => {
  it('고유 브랜드만 가나다순으로 돌려주고 null/빈 값은 뺀다', () => {
    const rows = [row({ brand: '반에크' }), row({ brand: '미센스' }), row({ brand: null }), row({ brand: '미센스' })];
    expect(extractDistinctBrands(rows)).toEqual(['미센스', '반에크']);
  });
});

describe('toggleStyleSelection (PR-194 보완) — 31개 이상이면 자동 선택 안 함', () => {
  it('선택 안 된 스타일을 체크하면 추가된다', () => {
    const result = toggleStyleSelection(new Set(['A']), 'B');
    expect(result.next).toEqual(new Set(['A', 'B']));
    expect(result.blockedAtMax).toBe(false);
  });

  it('이미 선택된 스타일은 제한과 무관하게 항상 해제할 수 있다', () => {
    const full = new Set(Array.from({ length: MULTI_STYLE_SELECTION_MAX }, (_, i) => `S${i}`));
    const result = toggleStyleSelection(full, 'S0');
    expect(result.next.has('S0')).toBe(false);
    expect(result.next.size).toBe(MULTI_STYLE_SELECTION_MAX - 1);
    expect(result.blockedAtMax).toBe(false);
  });

  it('이미 30개(최대)가 선택된 상태에서 새 스타일을 체크하면 막히고 선택은 바뀌지 않는다(자동 상위 30개 선택 금지)', () => {
    const full = new Set(Array.from({ length: MULTI_STYLE_SELECTION_MAX }, (_, i) => `S${i}`));
    const result = toggleStyleSelection(full, 'NEW');
    expect(result.blockedAtMax).toBe(true);
    expect(result.next).toBe(full); // 참조까지 그대로(변경 없음)
    expect(result.next.has('NEW')).toBe(false);
  });

  it('max를 직접 지정할 수 있다(테스트 편의)', () => {
    const result = toggleStyleSelection(new Set(['A', 'B']), 'C', 2);
    expect(result.blockedAtMax).toBe(true);
  });
});
