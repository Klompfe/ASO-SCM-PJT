import type { OuterFabricAuditResponse, OuterFabricAuditStatus } from '../api/boms.service';

// PR-256: 겉감 혼용률 점검 목록 화면용 순수 로직(표시 문구·배지). 목록은 읽기 전용이다.

export const AUDIT_STATUS_BADGE: Record<OuterFabricAuditStatus, { label: string; className: string }> = {
  noRow: { label: '겉감 행 없음', className: 'bg-red-100 text-red-700 border border-red-300' },
  blank: { label: '겉감 혼용률 비어 있음', className: 'bg-red-100 text-red-700 border border-red-300' },
  noBom: { label: 'BOM 없음', className: 'bg-red-100 text-red-700 border border-red-300' },
};

// 예: "전체 120개 스타일 중 점검 대상 7개 — 겉감 행 없음 3 · 겉감 혼용률 비어 있음 2 · BOM 없음 2"
export function formatAuditSummary(res: Pick<OuterFabricAuditResponse, 'counts' | 'styleCount'>): string {
  const { counts, styleCount } = res;
  return `전체 ${styleCount}개 스타일 중 점검 대상 ${counts.total}개 — 겉감 행 없음 ${counts.noRow} · 겉감 혼용률 비어 있음 ${counts.blank} · BOM 없음 ${counts.noBom}`;
}

export const AUDIT_EMPTY_MESSAGE = '겉감 점검 대상이 없습니다 — 모든 스타일의 겉감 혼용률이 입력되어 있습니다';
export const AUDIT_ERROR_MESSAGE = '점검 목록을 불러오지 못했습니다 — 점검 결과를 확인할 수 없는 상태이며 "문제 없음"이 아닙니다. 다시 시도해 주세요.';
export const AUDIT_CATEGORY_HINT = '구분 값에 겉감과 비슷하지만 인식되지 않는 값(예: FABRIC)이 있는지 확인해 주세요.';

export const AUDIT_FILTER_OPTIONS: { value: 'all' | OuterFabricAuditStatus; label: string }[] = [
  { value: 'all', label: '전체 누락' },
  { value: 'noRow', label: '겉감 행 없음' },
  { value: 'blank', label: '겉감 혼용률 비어 있음' },
  { value: 'noBom', label: 'BOM 없음' },
];
