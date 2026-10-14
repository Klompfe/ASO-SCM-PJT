import type { UnlinkedPurchaseOrderRow } from '../api/purchaseOrders.service';

// PR-196: "미연결 발주 정리" 화면의 판단 로직을 컴포넌트 밖으로 뽑아 DOM 없이 유닛
// 테스트할 수 있게 한다(이 환경은 상호작용 렌더 테스트를 지원하지 않는다 — 기존 여러
// PR과 동일한 제약).

// 목록을 처음 불러왔을 때 AUTO(후보 1개) 행만 그 스타일을 미리 골라 둔다 — 저장은
// 사람이 체크하고 버튼을 눌러야만 이뤄진다(자동 저장 아님).
export function buildInitialChosenStyleNo(rows: UnlinkedPurchaseOrderRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.attribution === 'AUTO' && r.candidateStyles[0]) {
      map.set(r.poId, r.candidateStyles[0].styleNo);
    }
  }
  return map;
}

export interface StyleLinkResolution {
  // 실제로 저장 요청에 포함할 (poId, styleNo) 목록 — 체크됐고 스타일도 지정된 행만.
  targets: { poId: number; styleNo: string }[];
  // 체크는 됐는데 스타일이 비어 있는 행이 있으면 true(이 경우 아무것도 저장하지 않고 안내만 한다).
  hasIncompleteSelection: boolean;
}

// "체크된 행 중 스타일이 없는 행이 있으면 아무것도 저장하지 않는다"는 규칙을 한 곳에 둔다.
export function resolveStyleLinkTargets(selected: Set<number>, chosenStyleNo: Map<number, string>): StyleLinkResolution {
  const selectedIds = [...selected];
  const targets = selectedIds
    .filter((poId) => chosenStyleNo.has(poId))
    .map((poId) => ({ poId, styleNo: chosenStyleNo.get(poId)! }));
  return {
    targets,
    hasIncompleteSelection: targets.length !== selectedIds.length,
  };
}

export function filterUnlinkedRows(
  rows: UnlinkedPurchaseOrderRow[],
  opts: { itemKeyword?: string; status?: '' | 'PENDING' | 'RECEIVED'; attribution?: '' | UnlinkedPurchaseOrderRow['attribution'] },
): UnlinkedPurchaseOrderRow[] {
  const keyword = (opts.itemKeyword ?? '').trim().toLowerCase();
  return rows.filter((r) => {
    if (keyword && !(r.itemName ?? '').toLowerCase().includes(keyword) && !(r.itemCode ?? '').toLowerCase().includes(keyword)) return false;
    if (opts.status && r.status !== opts.status) return false;
    if (opts.attribution && r.attribution !== opts.attribution) return false;
    return true;
  });
}
