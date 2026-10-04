import type { AiSalesOrderResult, AiOverview } from '../api/salesOrders.service';

// PR-158: 검토 화면(저장 전)에서 오더개요 필드를 직접 수정할 때 쓰는 순수 업데이트
// 함수 — 컴포넌트 밖으로 뽑아 DOM 없이 유닛 테스트할 수 있게 한다. index가 아닌
// 항목/필드는 절대 건드리지 않고, 불변으로 새 배열을 반환한다.
// PR-175: AI가 고르는 실/테이프 한글 라벨 → 저장용 enum 값. 서버 vision.service.ts의
// RESPONSE_SCHEMA enum과 같은 5개 라벨을 쓴다("스쿠이사"는 오바사로 매핑되도록 프롬프트에서 처리).
export const MATERIAL_SUB_TYPE_LABELS = {
  코아사: { field: 'threadType', value: 'COA_SA' },
  오바사: { field: 'threadType', value: 'OBA_SA_SKU_I_SA' },
  지누이도: { field: 'threadType', value: 'POLY_JINUIDO' },
  다데: { field: 'tapeType', value: 'DADE' },
  암홀: { field: 'tapeType', value: 'AMHOL' },
} as const;

export type MaterialSubTypeLabel = keyof typeof MATERIAL_SUB_TYPE_LABELS;

// 후보 라벨을 threadType/tapeType 중 어느 필드에 어떤 값으로 적용할지 결정한다. 알 수 없는
// 라벨이면 null — 추측해서 엉뚱한 필드에 넣지 않는다.
export function resolveMaterialSubTypeCandidate(
  candidate: string | null | undefined,
): { field: 'threadType' | 'tapeType'; value: string } | null {
  if (!candidate || !(candidate in MATERIAL_SUB_TYPE_LABELS)) return null;
  return MATERIAL_SUB_TYPE_LABELS[candidate as MaterialSubTypeLabel];
}

// 드롭다운에서 고른 enum 값(예: 'COA_SA', 'DADE')을 적용 대상 필드로 바꾼다. 모르는 값이면 null.
export function resolveSubTypeValue(value: string): { field: 'threadType' | 'tapeType'; value: string } | null {
  if (value === 'COA_SA' || value === 'OBA_SA_SKU_I_SA' || value === 'POLY_JINUIDO') return { field: 'threadType', value };
  if (value === 'DADE' || value === 'AMHOL') return { field: 'tapeType', value };
  return null;
}

// 자재명세(BOM) 한 행의 실/테이프 종류를 사람이 직접 고칠 때 쓰는 불변 업데이트. 한쪽 필드를
// 고르면 반대쪽 필드는 비워서(실과 테이프는 한 자재에 동시에 해당하지 않는다) 저장 값이 모순되지 않게 한다.
export function setBomItemSubType(
  results: AiSalesOrderResult[],
  resultIndex: number,
  bomIndex: number,
  target: { field: 'threadType' | 'tapeType'; value: string } | null,
): AiSalesOrderResult[] {
  return results.map((r, ri) => {
    if (ri !== resultIndex) return r;
    return {
      ...r,
      bomItems: r.bomItems.map((b, bi) => {
        if (bi !== bomIndex) return b;
        if (!target) return { ...b, threadType: null, tapeType: null };
        const other = target.field === 'threadType' ? 'tapeType' : 'threadType';
        return { ...b, [target.field]: target.value, [other]: null };
      }),
    };
  });
}

export function updateOverviewField<K extends keyof AiOverview>(
  results: AiSalesOrderResult[],
  index: number,
  field: K,
  value: AiOverview[K],
): AiSalesOrderResult[] {
  return results.map((r, i) => (i === index ? { ...r, overview: { ...r.overview, [field]: value } } : r));
}
