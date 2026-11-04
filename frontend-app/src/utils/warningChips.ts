// PR-221: 수주등록 저장 화면(자재명세 초안)의 "확인 필요" 열은 행마다 0~6개의 경고
// 칩을 보여준다. 3개 넘으면 기본 2개만 보이고 나머지는 "+N"으로 접는다(행별 펼침
// 상태는 컴포넌트의 useState가 들고 있다) — 여기서는 그 선택 로직만 순수 함수로 뗀다.
export interface WarningChipLike {
  text: string;
}

export function buildChipsTitle(chips: WarningChipLike[]): string {
  return chips.map((c) => c.text).join(' · ');
}

export function selectVisibleChips<T>(
  chips: T[],
  expanded: boolean,
): { visible: T[]; hiddenCount: number; canCollapse: boolean } {
  const canCollapse = chips.length > 2;
  const visible = expanded || !canCollapse ? chips : chips.slice(0, 2);
  return { visible, hiddenCount: chips.length - visible.length, canCollapse };
}
