import { describe, expect, it } from 'vitest';
import { defaultSelectedLines, selectableRows } from './midoPriceImport';
import type { MidoPriceImportPreviewRow } from '../api/midoPriceTable.service';

const row = (over: Partial<MidoPriceImportPreviewRow>): MidoPriceImportPreviewRow => ({
  line: 1, status: 'NEW', after: { itemName: '항목', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', note: null },
  ...over,
});

// PR-188: 일괄 등록 미리보기 기본 체크 상태 — 신규는 기본 체크, 변경은 기본 해제(실수로
// 기존 값을 덮어쓰지 않기 위함), 동일/오류는 애초에 체크 대상이 아니다.
describe('defaultSelectedLines (PR-188)', () => {
  it('신규(NEW) 행만 기본 체크한다', () => {
    const rows = [row({ line: 1, status: 'NEW' }), row({ line: 2, status: 'CHANGED' }), row({ line: 3, status: 'SAME' }), row({ line: 4, status: 'ERROR' })];
    expect(defaultSelectedLines(rows)).toEqual({ 1: true, 2: false, 3: false, 4: false });
  });

  it('행이 없으면 빈 객체', () => {
    expect(defaultSelectedLines([])).toEqual({});
  });
});

describe('selectableRows (PR-188)', () => {
  it('NEW/CHANGED만 체크 가능 대상으로 추린다(SAME/ERROR 제외)', () => {
    const rows = [row({ line: 1, status: 'NEW' }), row({ line: 2, status: 'CHANGED' }), row({ line: 3, status: 'SAME' }), row({ line: 4, status: 'ERROR' })];
    expect(selectableRows(rows).map((r) => r.line)).toEqual([1, 2]);
  });
});
