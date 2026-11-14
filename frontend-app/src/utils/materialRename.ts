// PR-241: 자재마스터 이름 변경(모든 스타일 적용) 전에 영향 범위를 보여준다 —
// GET /items/:id/usage의 결과를 사용자가 읽을 수 있는 확인 문구로 바꾸는 순수 함수.
export interface ItemUsage {
  styleCount: number;
  bomItemCount: number;
  orderCount: number;
}

export function buildMasterRenameConfirmMessage(usage: ItemUsage): string {
  return (
    `이 이름이 바뀌면 스타일 ${usage.styleCount}개·BOM 행 ${usage.bomItemCount}개에 적용됩니다. ` +
    `발주/입고/선적 ${usage.orderCount}건이 연결돼 있습니다(품목 id로 연결돼 있어 이름이 따라 바뀝니다). ` +
    `계속할까요?`
  );
}

// "품목 마스터 관리" 화면의 수정 폼처럼, 이름 칸이 실제로 바뀌었을 때만 사용 현황
// 확인을 받는다(안 바뀌었으면 매번 확인창을 띄우지 않는다) — bomQtyReason.ts의
// isUnitChanged와 같은 원칙.
export function isNameChanged(originalName: string | null | undefined, newName: string): boolean {
  return newName.trim() !== (originalName ?? '').trim();
}
