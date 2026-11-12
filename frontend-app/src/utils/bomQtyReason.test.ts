import { describe, expect, it } from 'vitest';
import {
  resolveZeroQtyReason,
  describeZeroQtyReason,
  isUnitChanged,
  UNIT_CHANGE_CONFIRM_TEXT,
  resolveLiveQtyReason,
  describeLiveQtyReason,
  describeSnapshotNote,
  isBlockedUnitForLengthBasedMaterial,
  BLOCKED_PACKAGING_UNIT_MESSAGE,
} from './bomQtyReason';
import { resolveAppliedQuantity, buildColorQtyMap } from './appliedQuantity';
import { formatBomItemQty, type PackagingRuleLike } from './materialRequirementDisplay';

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

describe('isBlockedUnitForLengthBasedMaterial (PR-239)', () => {
  const PACKAGING_ROW = { hasPackagingRule: true, looksLikeThreadOrTapeByName: false };
  const THREAD_LOOKING_ROW = { hasPackagingRule: false, looksLikeThreadOrTapeByName: true };
  const ORDINARY_ROW = { hasPackagingRule: false, looksLikeThreadOrTapeByName: false };

  it('포장 규칙이 지정된 행은 콘·롤·EA 등 길이가 아닌 단위로 바꾸는 것을 막는다', () => {
    expect(isBlockedUnitForLengthBasedMaterial('CONE', PACKAGING_ROW)).toBe(true);
    expect(isBlockedUnitForLengthBasedMaterial('콘', PACKAGING_ROW)).toBe(true);
    expect(isBlockedUnitForLengthBasedMaterial('ROLL', PACKAGING_ROW)).toBe(true);
    expect(isBlockedUnitForLengthBasedMaterial('EA', PACKAGING_ROW)).toBe(true);
  });

  it('포장 규칙이 지정된 행은 길이 단위(M/Y 등)로 바꾸는 것은 막지 않는다', () => {
    expect(isBlockedUnitForLengthBasedMaterial('M', PACKAGING_ROW)).toBe(false);
    expect(isBlockedUnitForLengthBasedMaterial('Y', PACKAGING_ROW)).toBe(false);
    expect(isBlockedUnitForLengthBasedMaterial('yd', PACKAGING_ROW)).toBe(false);
  });

  it('종류가 미지정이라도 자재명이 실/테이프로 보이면 같은 가드가 적용된다', () => {
    expect(isBlockedUnitForLengthBasedMaterial('CONE', THREAD_LOOKING_ROW)).toBe(true);
    expect(isBlockedUnitForLengthBasedMaterial('M', THREAD_LOOKING_ROW)).toBe(false);
  });

  it('길이 기반이 아닌 일반 개수 자재(단추 등)는 EA/SET/콘 등 어떤 단위로 바꿔도 막지 않는다', () => {
    expect(isBlockedUnitForLengthBasedMaterial('EA', ORDINARY_ROW)).toBe(false);
    expect(isBlockedUnitForLengthBasedMaterial('SET', ORDINARY_ROW)).toBe(false);
    expect(isBlockedUnitForLengthBasedMaterial('CONE', ORDINARY_ROW)).toBe(false);
  });

  it('안내 문구는 길이 단위여야 한다는 것과 포장 규칙으로 처리된다는 것을 모두 알린다', () => {
    expect(BLOCKED_PACKAGING_UNIT_MESSAGE).toContain('길이 단위');
    expect(BLOCKED_PACKAGING_UNIT_MESSAGE).toContain('포장 규칙');
  });
});

describe('resolveLiveQtyReason / describeLiveQtyReason (PR-229)', () => {
  it('basis가 unknown이면(색상 수량표에도 작지 값에도 근거 없음) needs-color-qty', () => {
    expect(resolveLiveQtyReason({ basis: 'unknown', styleTotalQty: 1000 })).toBe('needs-color-qty');
    expect(resolveLiveQtyReason({ basis: 'unknown', styleTotalQty: null })).toBe('needs-color-qty');
  });

  it('basis가 computed인데 스타일 총수량이 없으면(null 또는 0 이하) missing-total-qty', () => {
    expect(resolveLiveQtyReason({ basis: 'computed', styleTotalQty: null })).toBe('missing-total-qty');
    expect(resolveLiveQtyReason({ basis: 'computed', styleTotalQty: 0 })).toBe('missing-total-qty');
  });

  it('basis가 computed이고 총수량이 있으면 이유 없음(null) — 0이어도 "진짜 0"이라 그대로 보여준다', () => {
    expect(resolveLiveQtyReason({ basis: 'computed', styleTotalQty: 499 })).toBeNull();
  });

  it('basis가 sheet/color-qty면 총수량과 무관하게 이미 값이 있어 이유가 없다', () => {
    expect(resolveLiveQtyReason({ basis: 'sheet', styleTotalQty: null })).toBeNull();
    expect(resolveLiveQtyReason({ basis: 'color-qty', styleTotalQty: null })).toBeNull();
  });

  it('needs-color-qty는 "색상별 수량 확인 필요" 문구를 돌려준다', () => {
    const r = describeLiveQtyReason('needs-color-qty');
    expect(r?.text).toBe('색상별 수량 확인 필요');
  });

  it('missing-total-qty는 "스타일 총수량 미입력" 문구를 돌려준다(stale-snapshot의 "다시 저장" 문구와는 다르다)', () => {
    const r = describeLiveQtyReason('missing-total-qty');
    expect(r?.text).toBe('스타일 총수량 미입력');
    expect(r?.text).not.toContain('다시 저장');
  });

  it('null이면 이유 없음(null)', () => {
    expect(describeLiveQtyReason(null)).toBeNull();
  });
});

describe('describeSnapshotNote (PR-229)', () => {
  it('지금 계산한 값과 저장된 스냅샷 표시가 같으면 보조 표시를 하지 않는다(null)', () => {
    expect(describeSnapshotNote('499', '499')).toBeNull();
  });

  it('다르면 "저장 당시 값 N" 형태로만 보여준다 — "다시 저장" 요구 문구는 없다', () => {
    const note = describeSnapshotNote('499', '0');
    expect(note).toBe('저장 당시 값 0');
    expect(note).not.toContain('다시 저장');
  });
});

// PR-229: 사용자 보고 — 수기 추가한 라벨류(EA, 요척 1) 행의 소요수량 칸에 "저장된 값
// 0(다시 저장 필요)"가 뜨던 문제. 이 표의 주 값을 스냅샷(BomItem.requiredQty)이 아니라
// 지금 규칙(resolveAppliedQuantity, PR-226)으로 계산한 값으로 바꾸면 해결되는지를,
// ItemsManager.tsx의 renderBomItemQtyCell과 같은 조합(resolveAppliedQuantity →
// resolveLiveQtyReason → formatBomItemQty → describeSnapshotNote)으로 확인한다.
describe('"소요수량" 주 값을 스냅샷이 아니라 실시간 계산값으로 — 통합 시나리오 (PR-229)', () => {
  const RULES: PackagingRuleLike[] = [
    { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
    { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
  ];

  // renderBomItemQtyCell이 실제로 하는 것과 같은 순서로 묶어, 컴포넌트 렌더링 없이
  // "화면에 뭐가 보일지"를 순수 함수 조합만으로 검증한다(이 저장소의 React 테스트
  // 환경에는 jsdom/testing-library가 없다 — 기존 PR-226~228과 같은 테스트 패턴).
  function liveQtyScreen(opts: {
    consumption: number | null;
    requiredQtySnapshot: number;
    totalQty: number | null;
    sheetQty?: number | null;
    sheetQtyUnit?: string | null;
    itemUnit?: string | null;
    colorCode?: string | null;
    colorQtyMap?: Map<string, number>;
    subtype?: string | null;
    itemName?: string | null;
  }) {
    const applied = resolveAppliedQuantity({
      consumption: opts.consumption,
      totalQty: opts.totalQty,
      sheetQty: opts.sheetQty ?? null,
      sheetQtyUnit: opts.sheetQtyUnit ?? null,
      itemUnit: opts.itemUnit ?? null,
      colorCode: opts.colorCode ?? null,
      colorQtyMap: opts.colorQtyMap ?? new Map(),
    });
    const reason = resolveLiveQtyReason({ basis: applied.basis, styleTotalQty: opts.totalQty });
    const formatOpts = { subtype: opts.subtype, itemName: opts.itemName, itemUnit: opts.itemUnit };
    const display = formatBomItemQty(applied.qty, formatOpts, RULES);
    const snapshotDisplay = formatBomItemQty(opts.requiredQtySnapshot, formatOpts, RULES);
    const snapshotNote = reason ? null : describeSnapshotNote(display.text, snapshotDisplay.text);
    return { applied, reason, display, snapshotNote };
  }

  it('사용자 보고 재현: 스냅샷 0 + 총수량 499 + 요척 1 + 단위 EA(공통색) → 주 값 499, "다시 저장 필요" 문구 없음, 스냅샷은 보조로만 "저장 당시 값 0"', () => {
    const r = liveQtyScreen({ consumption: 1, requiredQtySnapshot: 0, totalQty: 499, itemUnit: 'EA' });
    expect(r.reason).toBeNull();
    expect(r.display.text).toBe('499');
    expect(r.snapshotNote).toBe('저장 당시 값 0');
    expect(r.snapshotNote).not.toContain('다시 저장');
  });

  it('스냅샷과 지금 계산값이 같으면 보조 표시가 없다', () => {
    const r = liveQtyScreen({ consumption: 1, requiredQtySnapshot: 499, totalQty: 499, itemUnit: 'EA' });
    expect(r.display.text).toBe('499');
    expect(r.snapshotNote).toBeNull();
  });

  it('색상이 있고 수량표에 그 색상 합계가 있으면 색상 합계 × 요척이 주 값이다(basis=color-qty)', () => {
    const colorQtyMap = buildColorQtyMap([{ color: 'BLACK', qty: 300 }]);
    const r = liveQtyScreen({ consumption: 2, requiredQtySnapshot: 0, totalQty: 1000, itemUnit: 'EA', colorCode: 'BLACK', colorQtyMap });
    expect(r.applied.basis).toBe('color-qty');
    expect(r.reason).toBeNull();
    expect(r.display.text).toBe('600');
  });

  it('색상이 있고 수량표에 없는데 단위 맞는 작지 값이 있으면 작지 값이 주 값이다(basis=sheet)', () => {
    const r = liveQtyScreen({
      consumption: 2, requiredQtySnapshot: 0, totalQty: 1000, itemUnit: 'M', colorCode: 'RED',
      colorQtyMap: buildColorQtyMap([{ color: 'BLACK', qty: 300 }]),
      sheetQty: 250, sheetQtyUnit: 'M',
    });
    expect(r.applied.basis).toBe('sheet');
    expect(r.reason).toBeNull();
    expect(r.display.text).toBe('250');
  });

  it('색상이 있고 수량표에도 작지에도 근거가 없으면 "색상별 수량 확인 필요"만 보여준다(숫자 0이 아니다)', () => {
    const r = liveQtyScreen({ consumption: 2, requiredQtySnapshot: 0, totalQty: 1000, itemUnit: 'EA', colorCode: 'RED', colorQtyMap: new Map() });
    expect(r.applied.basis).toBe('unknown');
    expect(r.reason).toBe('needs-color-qty');
  });

  it('공통색인데 스타일 총수량이 없으면 "스타일 총수량 미입력"만 보여준다(숫자 0이 아니다)', () => {
    const r = liveQtyScreen({ consumption: 1.5, requiredQtySnapshot: 318, totalQty: null, itemUnit: 'M' });
    expect(r.applied.basis).toBe('computed');
    expect(r.reason).toBe('missing-total-qty');
  });

  it('요척이 진짜 0이면 총수량이 있어도 그냥 "0"을 보여준다(이유 문구 없음)', () => {
    const r = liveQtyScreen({ consumption: 0, requiredQtySnapshot: 0, totalQty: 1000, itemUnit: 'EA' });
    expect(r.reason).toBeNull();
    expect(r.display.text).toBe('0');
  });

  it('실/테이프 행은 주 값에도 포장단위 환산이 적용된다(N콘/N롤) — 계산 로직은 바꾸지 않는다', () => {
    const r = liveQtyScreen({
      consumption: 2.6, requiredQtySnapshot: 0, totalQty: 500, itemUnit: 'M', subtype: 'COA_SA', itemName: '코아사',
    });
    // 2.6 * 500 = 1300m, 2500m/콘 기준 ceil → 1콘
    expect(r.display.kind).toBe('PACKAGED');
    expect(r.display.text).toBe('1콘');
  });

  it('종류 미지정 실/테이프는 "종류 확인 필요" 경고와 함께 소수 표시(올림 전) — 포장 계산을 하지 않는다', () => {
    const r = liveQtyScreen({ consumption: 2.6, requiredQtySnapshot: 0, totalQty: 500, itemUnit: 'M', itemName: '배색 실' });
    expect(r.display.kind).toBe('SUBTYPE_NEEDED');
  });
});
