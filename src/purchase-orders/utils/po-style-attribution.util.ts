import { pickActiveBom } from '../../boms/utils/active-bom.util';

// PR-196: 발주(PurchaseOrder)는 PR-185부터 styleNo(스타일 연결)를 저장하지만, 기존 코드
// 여러 곳(점검표, 인보이스, 포장내역)이 아직 품목(itemId)만 보고 발주를 찾아 "다른
// 스타일의 같은 품목 발주가 섞여 보이는" 버그가 있었다. 이 파일이 "발주 하나가 어느
// 스타일 몫인지" 판단하는 규칙을 한 곳에 모은다 — 아래 세 곳이 전부 이 함수만 쓴다.
//
// 규칙:
// - 연결 발주(po.styleNo === S): S 몫.
// - 미연결 발주(po.styleNo == null): 활성 BOM 기준으로 그 자재(itemId)를 쓰는 스타일이
//   정확히 1개면 그 스타일 몫으로 "자동 귀속"한다(모호함이 없으므로). 2개 이상이면
//   누구 몫으로도 세지 않는다(추측 금지) — "모호"로 표시해 화면에 안내만 한다. 0개면
//   어떤 활성 BOM에도 안 쓰이는 고아(ORPHAN) 발주다.
// - 다른 스타일로 연결된 발주는 절대 세지 않는다.
// - 취소(CANCELLED) 발주를 제외하는 것은 호출자의 책임이다(이 유틸은 상태를 보지 않는다
//   — styleNo 귀속 판단과 상태 필터링을 분리해 둬야 재사용하기 쉽다).

export interface BomLike {
  id: number;
  isActive?: boolean | null;
  style?: { styleNo: string } | null;
  items?: { material?: { id: number } | null }[] | null;
}

export interface PurchaseOrderLike {
  itemId: number;
  styleNo?: string | null;
}

// 스타일별로 pickActiveBom(활성 BOM 중 최신)만 반영해 "이 자재를 실제로 쓰는 스타일들"을
// 구한다 — 같은 스타일에 BOM이 여러 개 있어도 비활성/구버전 BOM의 자재 목록은 반영하지
// 않는다(기존 getMaterialReadiness/getProcurementStatusReport의 pickActiveBom 규칙과 동일).
export function buildItemStyleUsage(boms: BomLike[]): Map<number, Set<string>> {
  const bomsByStyle = new Map<string, BomLike[]>();
  for (const bom of boms) {
    const styleNo = bom.style?.styleNo;
    if (!styleNo) continue;
    const list = bomsByStyle.get(styleNo) ?? [];
    list.push(bom);
    bomsByStyle.set(styleNo, list);
  }

  const usage = new Map<number, Set<string>>();
  for (const [styleNo, styleBoms] of bomsByStyle) {
    const active = pickActiveBom(styleBoms);
    if (!active) continue;
    for (const item of active.items ?? []) {
      const materialId = item.material?.id;
      if (materialId == null) continue;
      const set = usage.get(materialId) ?? new Set<string>();
      set.add(styleNo);
      usage.set(materialId, set);
    }
  }
  return usage;
}

export type PoAttribution =
  | { kind: 'LINKED'; styleNo: string }
  | { kind: 'AUTO'; styleNo: string }
  | { kind: 'AMBIGUOUS'; candidates: string[] }
  | { kind: 'ORPHAN' };

export function attributePo(po: PurchaseOrderLike, itemStyleUsage: Map<number, Set<string>>): PoAttribution {
  if (po.styleNo) return { kind: 'LINKED', styleNo: po.styleNo };

  const candidates = [...(itemStyleUsage.get(po.itemId) ?? new Set<string>())];
  if (candidates.length === 0) return { kind: 'ORPHAN' };
  if (candidates.length === 1) return { kind: 'AUTO', styleNo: candidates[0] };
  return { kind: 'AMBIGUOUS', candidates };
}

// 편의 함수: 이 발주가 styleNo 몫으로 셀 수 있는지(LINKED 또는 AUTO가 그 스타일일 때만).
// AMBIGUOUS/ORPHAN은 어느 스타일 몫으로도 세지 않는다(추측 금지).
export function poBelongsToStyle(po: PurchaseOrderLike, styleNo: string, itemStyleUsage: Map<number, Set<string>>): boolean {
  const attribution = attributePo(po, itemStyleUsage);
  return (attribution.kind === 'LINKED' || attribution.kind === 'AUTO') && attribution.styleNo === styleNo;
}
