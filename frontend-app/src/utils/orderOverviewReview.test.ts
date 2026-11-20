import { describe, it, expect } from 'vitest';
import {
  toggleOverviewUseNew,
  buildOverwriteOrderFields,
  countOverviewOverwrites,
  hasOverviewDecision,
  formatOverviewConflictsNotice,
  formatOverviewOverwriteConfirm,
  buildCompareConfirmMessage,
  orderOverviewLabel,
} from './orderOverviewReview';
import type { OrderOverviewCompareRow } from '../api/salesOrders.service';

// PR-249: 오더개요 항목별 선택(기본 유지 → 새 값 → 되돌리기)과 요청·문구 — 합성 값.
const rows: OrderOverviewCompareRow[] = [
  { field: 'totalQty', existing: 100, incoming: 250, status: 'differs' },
  { field: 'buyer', existing: 'Buyer A', incoming: 'Buyer B', status: 'differs' },
  { field: 'brand', existing: null, incoming: 'Brand A', status: 'fillEmpty' },
  { field: 'styleName', existing: 'Style A', incoming: 'Style A', status: 'same' },
  { field: 'itemType', existing: 'JACKET', incoming: null, status: 'incomingEmpty' },
];

describe('orderOverviewReview (PR-249)', () => {
  it('기본(선택 없음)이면 보낼 필드가 없다 — 모든 항목 기존 값 유지', () => {
    expect(buildOverwriteOrderFields(rows, new Set())).toEqual([]);
    expect(countOverviewOverwrites(rows, new Set())).toBe(0);
  });

  it('toggleOverviewUseNew: 기본 유지 → 새 값 사용 → 되돌리기, 원본 집합은 바뀌지 않는다', () => {
    const base = new Set<string>();
    const on = toggleOverviewUseNew(base, 'buyer');
    expect([...on]).toEqual(['buyer']);
    expect(base.size).toBe(0);
    const off = toggleOverviewUseNew(on, 'buyer');
    expect(off.size).toBe(0);
  });

  it('새 값 사용을 고른 differs 항목만 overwriteOrderFields 로 나간다(다른 항목은 유지)', () => {
    const chosen = toggleOverviewUseNew(new Set(), 'buyer');
    expect(buildOverwriteOrderFields(rows, chosen)).toEqual(['buyer']);
    expect(countOverviewOverwrites(rows, chosen)).toBe(1);
  });

  it('differs 가 아닌 항목(fillEmpty/same/incomingEmpty)의 선택은 무시한다', () => {
    const chosen = new Set(['brand', 'styleName', 'itemType']);
    expect(buildOverwriteOrderFields(rows, chosen)).toEqual([]);
  });

  it('여러 항목을 고르면 응답 순서(서버 필드 순서)대로 나간다', () => {
    const chosen = new Set(['buyer', 'totalQty']);
    expect(buildOverwriteOrderFields(rows, chosen)).toEqual(['totalQty', 'buyer']);
  });

  it('overview 응답이 없으면(구버전 서버·신규 스타일) 아무것도 보내지 않는다', () => {
    expect(buildOverwriteOrderFields(undefined, new Set(['buyer']))).toEqual([]);
    expect(hasOverviewDecision(undefined)).toBe(false);
  });

  it('hasOverviewDecision: differs 가 하나라도 있을 때만 true', () => {
    expect(hasOverviewDecision(rows)).toBe(true);
    expect(hasOverviewDecision(rows.filter((r) => r.status !== 'differs'))).toBe(false);
  });

  it('formatOverviewConflictsNotice: 일괄 저장 결과 안내 문구(없으면 null)', () => {
    expect(formatOverviewConflictsNotice([{ field: 'buyer', existing: 'A', incoming: 'B' }, { field: 'totalQty', existing: 1, incoming: 2 }])).toBe(
      '오더개요 2개 항목이 기존과 달라 유지했습니다(개별 저장에서 비교 후 바꿀 수 있습니다)',
    );
    expect(formatOverviewConflictsNotice([])).toBeNull();
    expect(formatOverviewConflictsNotice(undefined)).toBeNull();
  });

  it('확인창 문구: 교체가 없으면 null, 있으면 "오더개요 N개 항목을 새 값으로 바꿉니다."', () => {
    expect(formatOverviewOverwriteConfirm(0)).toBeNull();
    expect(formatOverviewOverwriteConfirm(2)).toBe('오더개요 2개 항목을 새 값으로 바꿉니다.');
  });

  describe('buildCompareConfirmMessage', () => {
    it('아무 교체·삭제도 없으면 확인창이 없다', () => {
      expect(buildCompareConfirmMessage({ deleteNames: [], compositionOverwriteCount: 0, overviewOverwriteCount: 0 })).toBeNull();
    });

    it('삭제만 있으면 기존 문구와 완전히 같다', () => {
      expect(buildCompareConfirmMessage({ deleteNames: ['A', 'B'], compositionOverwriteCount: 0, overviewOverwriteCount: 0 })).toBe(
        '기존 자재 2건이 삭제됩니다. 계속할까요?\n- A\n- B',
      );
    });

    it('오더개요 교체만 있으면 그 문구 + 계속할까요?', () => {
      expect(buildCompareConfirmMessage({ deleteNames: [], compositionOverwriteCount: 0, overviewOverwriteCount: 2 })).toBe(
        '오더개요 2개 항목을 새 값으로 바꿉니다. 계속할까요?',
      );
    });

    it('오더개요·혼용률·삭제가 함께 있으면 교체 줄이 앞에 붙고 삭제 문구는 그대로 이어진다', () => {
      const msg = buildCompareConfirmMessage({ deleteNames: ['A'], compositionOverwriteCount: 1, overviewOverwriteCount: 3 });
      expect(msg).toBe('오더개요 3개 항목을 새 값으로 바꿉니다.\n혼용률 1행을 새 값으로 바꿉니다.\n기존 자재 1건이 삭제됩니다. 계속할까요?\n- A');
    });

    it('혼용률 교체만 있으면 PR-246 문구 그대로', () => {
      expect(buildCompareConfirmMessage({ deleteNames: [], compositionOverwriteCount: 2, overviewOverwriteCount: 0 })).toBe('혼용률 2행을 새 값으로 바꿉니다. 계속할까요?');
    });
  });

  it('항목 이름표(한글)와 알 수 없는 필드는 그대로 표시', () => {
    expect(orderOverviewLabel('targetRdd')).toBe('납기');
    expect(orderOverviewLabel('zzz')).toBe('zzz');
  });
});
