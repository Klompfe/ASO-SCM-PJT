import { describe, expect, it } from 'vitest';
import { resolveZeroQtyReason, describeZeroQtyReason, isUnitChanged, UNIT_CHANGE_CONFIRM_TEXT } from './bomQtyReason';

describe('resolveZeroQtyReason (PR-227)', () => {
  it('requiredQty가 0이 아니면 이유가 필요 없다(null)', () => {
    expect(resolveZeroQtyReason({ consumption: 1.5, requiredQty: 318, styleTotalQty: 1000 })).toBeNull();
  });

  it('요척 자체가 0이면 "진짜 0"(genuine-zero) — 문구를 보여줄 필요가 없는 경우', () => {
    expect(resolveZeroQtyReason({ consumption: 0, requiredQty: 0, styleTotalQty: 1000 })).toBe('genuine-zero');
  });

  it('요척은 0이 아닌데 소요수량이 0이고 스타일 총수량이 없으면 missing-total-qty', () => {
    expect(resolveZeroQtyReason({ consumption: 1.52, requiredQty: 0, styleTotalQty: null })).toBe('missing-total-qty');
    expect(resolveZeroQtyReason({ consumption: 1.52, requiredQty: 0, styleTotalQty: 0 })).toBe('missing-total-qty');
  });

  it('요척은 0이 아니고 총수량도 있는데 소요수량이 0이면 stale-snapshot', () => {
    expect(resolveZeroQtyReason({ consumption: 1.52, requiredQty: 0, styleTotalQty: 499 })).toBe('stale-snapshot');
  });
});

describe('describeZeroQtyReason (PR-227)', () => {
  it('genuine-zero와 null은 문구가 없다(화면은 그냥 0을 보여줌)', () => {
    expect(describeZeroQtyReason('genuine-zero')).toBeNull();
    expect(describeZeroQtyReason(null)).toBeNull();
  });

  it('missing-total-qty는 "스타일 총수량 미입력" 문구와 스타일 관리로 안내하는 title을 돌려준다', () => {
    const r = describeZeroQtyReason('missing-total-qty');
    expect(r?.text).toContain('총수량');
    expect(r?.title).toContain('스타일 관리');
  });

  it('stale-snapshot은 "다시 저장" 문구와 안내 title을 돌려준다', () => {
    const r = describeZeroQtyReason('stale-snapshot');
    expect(r?.text).toContain('0');
    expect(r?.title).toContain('다시 저장');
  });
});

describe('isUnitChanged / UNIT_CHANGE_CONFIRM_TEXT (PR-227)', () => {
  it('단위가 실제로 바뀌었을 때만 true — 앞뒤 공백 차이는 바뀐 것으로 치지 않는다', () => {
    expect(isUnitChanged('EA', 'M')).toBe(true);
    expect(isUnitChanged('EA', 'EA')).toBe(false);
    expect(isUnitChanged('EA', ' EA ')).toBe(false);
    expect(isUnitChanged(null, '')).toBe(false);
    expect(isUnitChanged(null, 'EA')).toBe(true);
    expect(isUnitChanged('', 'EA')).toBe(true);
  });

  it('확인 문구는 "자재(품목) 마스터 값"이며 모든 스타일에 적용된다는 점을 알린다', () => {
    expect(UNIT_CHANGE_CONFIRM_TEXT).toContain('마스터');
    expect(UNIT_CHANGE_CONFIRM_TEXT).toContain('모든 스타일');
  });
});
