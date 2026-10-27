import type { ProcurementStatusRow } from '../api/orderProcessStages.service';
import { getSeasonDateRange, type Season } from './season';

// PR-194 보완: 점검표(발주·입고·출고 현황)에서 시즌/브랜드/바이어/상태로 걸러 다품번
// 일괄발주로 넘길 스타일을 고르는 순수 로직. 시즌·브랜드·상태 필터는 서버가 이미 내려준
// ProcurementStatusRow(targetRdd/brand/overallStatus, PR-196)만 보고 클라이언트에서 거른다
// (새 조회 API 없이 기존 점검표 응답 재사용).

export interface ProcurementStatusFilter {
  // 기존 스타일번호/바이어 키워드 검색(PR-089)과 같은 동작.
  keyword?: string;
  brand?: string | null;
  status?: string | null;
  season?: { year: number; season: Season } | null;
  // 시즌 필터가 걸려 있을 때, 납기(targetRdd)가 없는 스타일도 포함할지 — 기본은 제외
  // (시즌별로 보고 싶은 화면에서 납기 미정 스타일이 섞여 들어오면 오해하기 쉬움).
  includeNoDeliveryDate?: boolean;
}

export function filterProcurementStatusRows(
  rows: ProcurementStatusRow[],
  filter: ProcurementStatusFilter,
): ProcurementStatusRow[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase();
  const seasonRange = filter.season ? getSeasonDateRange(filter.season.year, filter.season.season) : null;

  return rows.filter((r) => {
    if (keyword && !r.styleNo.toLowerCase().includes(keyword) && !(r.buyer ?? '').toLowerCase().includes(keyword)) return false;
    if (filter.brand && r.brand !== filter.brand) return false;
    if (filter.status && r.overallStatus !== filter.status) return false;
    if (seasonRange) {
      if (!r.targetRdd) return !!filter.includeNoDeliveryDate;
      return r.targetRdd >= seasonRange.targetRddFrom && r.targetRdd <= seasonRange.targetRddTo;
    }
    return true;
  });
}

// 점검표에 나오는 고유 브랜드 목록(필터 드롭다운용) — null/빈 값은 제외, 가나다순.
export function extractDistinctBrands(rows: ProcurementStatusRow[]): string[] {
  return [...new Set(rows.map((r) => r.brand).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, 'ko'));
}

export const MULTI_STYLE_SELECTION_MAX = 30;

export interface StyleSelectionToggleResult {
  next: Set<string>;
  // true면 선택이 바뀌지 않았다(이미 30개 선택된 상태에서 새 스타일을 더 체크하려 한 경우).
  blockedAtMax: boolean;
}

// 체크박스 토글 — 이미 선택된 스타일은 항상 해제할 수 있고(제한과 무관), 새로 선택하려는
// 스타일은 이미 30개가 선택돼 있으면 막는다(자동으로 상위 30개만 남기는 동작은 하지 않음
// — 사용자가 어떤 스타일이 빠졌는지 모르게 되는 걸 막기 위해, 그냥 더 추가가 안 될 뿐).
export function toggleStyleSelection(
  current: Set<string>,
  styleNo: string,
  max: number = MULTI_STYLE_SELECTION_MAX,
): StyleSelectionToggleResult {
  if (current.has(styleNo)) {
    const next = new Set(current);
    next.delete(styleNo);
    return { next, blockedAtMax: false };
  }
  if (current.size >= max) {
    return { next: current, blockedAtMax: true };
  }
  const next = new Set(current);
  next.add(styleNo);
  return { next, blockedAtMax: false };
}
