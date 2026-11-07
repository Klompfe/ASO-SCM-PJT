// PR-227: 자재·BOM 조회 표의 "소요수량"(BomItem.requiredQty)은 실시간 계산값이
// 아니라 저장 시점의 스냅샷이다(boms.service.ts updateItem()의 주석 — "실제 소요량
// 계산(work-orders 쪽 calculateMaterialRequirements)은 BomItem.requiredQty가 아니라
// 매번 consumption × targetQuantity로 다시 계산" — 이 컬럼을 읽는 건 아님). 요척이
// 0이 아닌데 저장된 소요수량이 0이면 "계산이 안 된" 게 아니라 "저장 시점에 총수량이
// 없었거나(있었어도 색상별 수량을 반영하지 않는 단순 공식) 작지 출고량이 비어 있었던"
// 스냅샷 — 숫자 0 대신 그 사실을 보여준다. 계산 로직 자체는 바꾸지 않는다(표시만).
export type ZeroQtyReasonKind = 'genuine-zero' | 'missing-total-qty' | 'stale-snapshot';

export interface ZeroQtyReasonInput {
  consumption: number;
  requiredQty: number;
  // 현재 스타일의 총수량(StyleOverview.totalQty) — 없으면 null.
  styleTotalQty: number | null;
}

// requiredQty가 0이 아니면 "이유"가 필요 없다(null). 0이면 세 가지로 구분한다:
// ① 요척 자체가 0(genuine-zero, 정상적인 0 — 문구를 보여줄 필요 없음)
// ② 스타일 총수량이 없어서(missing-total-qty) — 가장 흔하고, "스타일 관리에서
//    총수량을 입력하라"는 구체적인 해결책을 줄 수 있는 경우
// ③ 총수량은 있는데도 0이면(stale-snapshot) — 저장 시점에 작지 출고량이 비어
//    있었거나 그 뒤로 totalQty가 바뀌었을 가능성 — "요척을 다시 저장해 갱신하라"는
//    해결책을 줄 수 있는 경우(boms.service.ts updateItem()이 재계산하므로 사실임)
export function resolveZeroQtyReason(input: ZeroQtyReasonInput): ZeroQtyReasonKind | null {
  if (input.requiredQty !== 0) return null;
  if (input.consumption === 0) return 'genuine-zero';
  if (input.styleTotalQty == null || input.styleTotalQty <= 0) return 'missing-total-qty';
  return 'stale-snapshot';
}

export interface ZeroQtyReasonText {
  text: string;
  title: string;
}

const MESSAGES: Record<Exclude<ZeroQtyReasonKind, 'genuine-zero'>, ZeroQtyReasonText> = {
  'missing-total-qty': {
    text: '스타일 총수량 미입력',
    title: '이 스타일의 총수량이 입력되지 않아 저장 시점에 소요수량이 계산되지 않았습니다 — 스타일 관리에서 총수량을 입력한 뒤, 이 행의 요척을 다시 저장하면(수정 → 저장) 갱신됩니다.',
  },
  'stale-snapshot': {
    text: '저장된 값 0(다시 저장 필요)',
    title: '소요수량은 저장 시점의 스냅샷입니다 — 작지에 이 자재의 출고량이 인쇄되어 있지 않았거나 그 뒤 총수량이 바뀌었을 수 있습니다. 이 행의 요척을 다시 저장하면(수정 → 저장) 현재 총수량 기준으로 갱신됩니다.',
  },
};

// genuine-zero는 문구를 보여줄 필요가 없다(진짜 0) — null을 돌려준다.
export function describeZeroQtyReason(kind: ZeroQtyReasonKind | null): ZeroQtyReasonText | null {
  if (kind == null || kind === 'genuine-zero') return null;
  return MESSAGES[kind];
}

// PR-227: 단위는 BomItem이 아니라 자재(Item) 마스터 값이라 이 자재를 쓰는 모든 스타일에
// 적용된다 — 수정 모드에서 단위를 실제로 바꿨을 때만(원래 값과 다를 때만) 저장 전 확인을
// 받는다. ItemsManager.tsx의 handleUpdateBomItem과 테스트가 같은 문구를 쓴다.
export const UNIT_CHANGE_CONFIRM_TEXT =
  '단위는 자재(품목) 마스터 값입니다. 이 자재를 쓰는 모든 스타일에 적용됩니다. 계속할까요?';

export function isUnitChanged(originalUnit: string | null | undefined, newUnit: string): boolean {
  return newUnit.trim() !== (originalUnit ?? '').trim();
}

// PR-229: 자재·BOM 조회 표의 "소요수량" 주 값을 저장 스냅샷이 아니라 지금 규칙으로
// 계산한 값(appliedQuantity.ts의 resolveAppliedQuantity)으로 바꾼다 — 계산 자체가 안
// 되는 두 경우에만(색상 수량표에도 작지 값에도 근거가 없음 / 스타일 총수량 미입력)
// 숫자 대신 이유를 보여준다. resolveZeroQtyReason(PR-227, 스냅샷용)과는 별개다 —
// 스냅샷을 더 이상 주 값으로 쓰지 않으므로 "저장된 값 0(다시 저장 필요)" 문구는
// 쓰지 않는다(요구사항: 사용자에게 다시 저장을 요구하지 않는다).
export type LiveQtyReasonKind = 'needs-color-qty' | 'missing-total-qty';

export interface LiveQtyReasonInput {
  basis: 'sheet' | 'color-qty' | 'computed' | 'manual' | 'unknown';
  styleTotalQty: number | null;
}

// basis==='unknown'(색상은 있는데 수량표에도 없고 단위 맞는 작지 값도 없음)이거나,
// basis==='computed'(공통/무색상)인데 총수량이 아직 없으면(0 이하 포함) 이유를
// 돌려준다. 'sheet'/'color-qty'는 총수량과 무관하게 이미 값이 있으므로 이유가 없다.
// PR-231: 'manual'(수동 지정)도 항상 값이 있으므로(사람이 직접 넣음) 이유가 없다.
export function resolveLiveQtyReason(input: LiveQtyReasonInput): LiveQtyReasonKind | null {
  if (input.basis === 'unknown') return 'needs-color-qty';
  if (input.basis === 'computed' && (input.styleTotalQty == null || input.styleTotalQty <= 0)) {
    return 'missing-total-qty';
  }
  return null;
}

export interface LiveQtyReasonText {
  text: string;
  title: string;
}

const LIVE_QTY_MESSAGES: Record<LiveQtyReasonKind, LiveQtyReasonText> = {
  'needs-color-qty': {
    text: '색상별 수량 확인 필요',
    title: '이 색상의 수량을 스타일의 색상×사이즈 수량표에서 찾지 못했고, 단위가 맞는 작지 수량도 없어 지금은 계산할 수 없습니다 — 수량표 또는 작지 값을 확인하세요.',
  },
  'missing-total-qty': {
    text: '스타일 총수량 미입력',
    title: '이 스타일의 총수량이 입력되지 않아 지금은 계산할 수 없습니다 — 스타일 관리에서 총수량을 입력하세요.',
  },
};

export function describeLiveQtyReason(kind: LiveQtyReasonKind | null): LiveQtyReasonText | null {
  if (kind == null) return null;
  return LIVE_QTY_MESSAGES[kind];
}

// PR-229: 저장된 스냅샷(BomItem.requiredQty)은 더 이상 주 값이 아니지만, 지금 계산한
// 값과 다르면("스냅샷이 오래됐다"는 뜻) 작은 보조 표시로 남겨 둔다 — 같으면 표시하지
// 않는다(화면에 똑같은 숫자를 두 번 보여줄 필요가 없다).
export function describeSnapshotNote(liveText: string, snapshotText: string): string | null {
  return liveText === snapshotText ? null : `저장 당시 값 ${snapshotText}`;
}
