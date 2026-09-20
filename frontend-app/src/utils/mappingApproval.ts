// PR-130: 엑셀 작업지시서 업로드 → 스타일 미리보기/승인 화면의 문구와 일괄승인 대상 선정.
// 문구는 mapping-commit.service.ts의 실제 commit() 동작(PR-098 병합, PR-123 활성 BOM 재사용)을 그대로 설명한다.

export const APPROVE_LABEL = '저장 및 승인';
// "덮어쓰기"가 아니라 병합이다: 기존 자재를 지우거나 갈아엎지 않고, 스타일 정보는 값이 있는 항목만 갱신한다.
export const REAPPROVE_LABEL = '재승인(병합)';

export const REAPPROVE_NOTICE_TITLE = '이 Style No는 이미 등록되어 있습니다. 재승인하면 기존 데이터에 "병합"됩니다(덮어쓰지 않고, 자재가 중복으로 쌓이지도 않습니다).';

export const REAPPROVE_NOTICE_POINTS: readonly string[] = [
  '스타일 정보(총 생산수량·바이어·선적일 등): 이번 파일에 값이 있는 항목만 새 값으로 갱신되고, 비어 있는 항목은 기존 값이 유지됩니다. 단, 공장은 기존 값이 이미 있으면 바뀌지 않습니다.',
  '자재명세: (자재명·색상·규격)이 같은 자재는 그대로 두고, 이번 파일에서 새로 나온 자재만 추가됩니다. 기존 자재는 삭제되지 않습니다.',
  '같은 자재라도 요척/필요량이 이번 파일과 다르면 자동으로 바뀌지 않습니다. 이 화면은 그 차이를 알려주지 않으므로, 승인 후 자재명세를 직접 확인하고 필요하면 수정하세요.',
];

// 목록 배지 문구
export const BADGE_PENDING = '확인 대기';
export const BADGE_ALREADY_REGISTERED = '이미 등록됨';
export const BADGE_PARSE_FAILED = '파싱 실패';

interface StyleLike {
  styleNo?: string | null;
  parseError?: string | null;
}

// 일괄승인 대상: 파싱에 성공했고 styleNo가 있으며 "아직 등록되지 않은(신규)" 스타일만.
// 재승인이 병합이라 자재가 중복으로 쌓이지는 않지만, 여러 스타일을 개별 확인 없이 한 번에 승인하면 이미 등록된 스타일의
// 스타일 정보가 이번 파일 값으로 갱신될 수 있다(잘못된 파일이면 그대로 반영). 그래서 이미 등록된 스타일은 일괄승인에서 계속 제외하고,
// 목록에서 한 줄씩 열어 내용을 확인한 뒤 개별로 재승인하게 한다.
export function selectBulkApproveTargets<T extends StyleLike>(styles: T[], existsMap: Record<string, boolean>): (T & { styleNo: string })[] {
  return styles.filter((s): s is T & { styleNo: string } => !!s.styleNo && !s.parseError && !existsMap[s.styleNo]);
}
