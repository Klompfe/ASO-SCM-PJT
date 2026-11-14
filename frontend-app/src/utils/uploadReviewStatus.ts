// PR-237: 엑셀 업로드 → 스타일 승인 화면의 상태를 "확인 대기/이미 등록됨/승인 실패(이유)"
// 로 구분한다(승인 완료는 목록에서 즉시 빠지므로 별도 상태로 표시하지 않는다 — 요구사항
// "승인 완료된 스타일은 즉시 삭제"). 실패 이유는 PR-236이 이미 한글로 바꿔 준 문구는 그대로
// 쓰고, 아직 영문 그대로 샐 수 있는 경우를 위한 안전망(알려진 패턴 번역)과 네트워크 오류
// 구분을 추가한다 — "사용자 주의"가 아니라 화면이 알아서 분류해 보여준다.
import { getErrorMessage } from './errorMessage';

export type UploadReviewStatus = 'pending' | 'alreadyRegistered' | 'parseFailed' | 'approvalFailed';

export type ApprovalFailureKind = 'validation' | 'network' | 'unknown';

export interface ApprovalFailureReason {
  kind: ApprovalFailureKind;
  // 화면에 한 줄로 보여줄 한글 문구.
  message: string;
  // kind==='unknown'일 때만 의미 있음 — "자세히" 펼침에 원문(서버 응답)을 보여준다.
  detail?: string;
}

// PR-236의 BomItemValidationErrorFilter가 번역하지 못한(필터가 안 걸린 다른 경로 등)
// 영문 패턴에 대한 안전망 — 서버가 한글로 이미 바꿔 줬으면 이 정규식에 걸리지 않고
// 그대로 통과한다.
const ROW_FIELD_ERROR_REGEX = /^bomItems\.(\d+)\.(\w+)\s+must be/i;
const FIELD_LABELS: Record<string, string> = {
  colorOf: '색상', spec: '규격', category: '구분', colorCode: '색상코드',
  supplier: '공급처', remarks: '비고', englishName: '영문명', itemName: '자재명',
  consumption: '요척', requiredQty: '소요량',
};

function translateKnownValidationPattern(raw: string): string | null {
  const m = raw.match(ROW_FIELD_ERROR_REGEX);
  if (!m) return null;
  const rowNumber = Number(m[1]) + 1;
  const label = FIELD_LABELS[m[2]] ?? m[2];
  return `${rowNumber}번째 자재 행의 '${label}' 값이 올바르지 않습니다`;
}

// 서버 응답(err.response)이 전혀 없으면(타임아웃·연결 끊김·서버가 깨어나는 중 등) 자료
// 문제가 아니라 네트워크/서버 문제로 본다 — "엑셀 확인" 대신 "잠시 후 다시 시도"를 안내한다.
function hasHttpResponse(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'response' in (err as Record<string, unknown>) && (err as { response?: unknown }).response != null;
}

export function describeApprovalFailure(err: unknown): ApprovalFailureReason {
  if (!hasHttpResponse(err)) {
    return { kind: 'network', message: '서버 응답이 없습니다 — 잠시 후 다시 시도해 주세요(서버가 깨어나는 중일 수 있습니다).' };
  }
  const raw = getErrorMessage(err, '');
  if (!raw) {
    return { kind: 'unknown', message: '저장 중 오류가 발생했습니다', detail: '(서버가 오류 메시지를 보내지 않았습니다)' };
  }
  // 이미 한글로 번역된 문구(PR-236)는 그대로 쓴다 — 자료 문제이므로 엑셀 확인을 안내한다.
  if (/번째 자재 행의 '.+' 값이 올바르지 않습니다/.test(raw)) {
    return { kind: 'validation', message: raw };
  }
  const translated = translateKnownValidationPattern(raw);
  if (translated) {
    return { kind: 'validation', message: translated };
  }
  return { kind: 'unknown', message: '저장 중 오류가 발생했습니다', detail: raw };
}

export interface StyleReviewStatusInput {
  parseError?: string | null;
  approvalFailure?: ApprovalFailureReason | null;
  alreadyRegistered: boolean;
}

export function resolveUploadReviewStatus(input: StyleReviewStatusInput): UploadReviewStatus {
  if (input.parseError) return 'parseFailed';
  if (input.approvalFailure) return 'approvalFailed';
  if (input.alreadyRegistered) return 'alreadyRegistered';
  return 'pending';
}

// 실패 내용 복사 — 스타일번호·이유만 담는다(자재명·수량 등 업무 데이터는 포함하지 않음).
export function buildFailureCopyText(entries: { styleNo: string; reason: string }[]): string {
  return entries.map((e) => `${e.styleNo} — 승인 실패: ${e.reason}`).join('\n');
}

export type ApprovalOutcome = { success: true } | { success: false; reason: ApprovalFailureReason };

export interface ApprovalOutcomeEntry {
  sheetName: string;
  outcome: ApprovalOutcome;
}

// PR-237: 일괄 승인/개별 재승인/모달 승인이 공통으로 쓰는 결과 반영 — 성공한 스타일은
// 목록에서 지우고(요구사항: "승인 완료된 스타일은 즉시 삭제") 실패 기록도 지운다(재시도
// 끝에 성공했을 수 있으므로). 실패한 스타일은 목록에 그대로 남기고 이유를 기록한다
// (사라졌던 문제의 핵심 수정) — 호출하는 쪽(ItemsManager)이 어디서 왔는지(일괄/개별/
// 모달)와 무관하게 이 한 함수로 상태를 갱신해, 세 진입 경로가 서로 다르게 동작하지
// 않게 한다.
export function applyApprovalOutcomes<T extends { sheetName: string }>(
  styles: T[],
  failuresBySheet: Record<string, ApprovalFailureReason>,
  outcomes: ApprovalOutcomeEntry[],
): { styles: T[]; failuresBySheet: Record<string, ApprovalFailureReason> } {
  const succeededSheets = new Set(outcomes.filter((o) => o.outcome.success).map((o) => o.sheetName));
  const nextStyles = styles.filter((s) => !succeededSheets.has(s.sheetName));
  const nextFailures = { ...failuresBySheet };
  for (const o of outcomes) {
    if (o.outcome.success) delete nextFailures[o.sheetName];
    else nextFailures[o.sheetName] = o.outcome.reason;
  }
  return { styles: nextStyles, failuresBySheet: nextFailures };
}

// PR-237 보충: "목록 비우기"는 승인되지 않은 건(목록에 남아 있는 모든 스타일 — 성공한
// 건은 이미 applyApprovalOutcomes가 지워 남아 있지 않음)이 있으면 확인을 받는다.
// 남은 게 없으면(0건) null을 돌려줘 확인 없이 바로 비울 수 있게 한다 — 호출하는 쪽
// (ItemsManager)이 null이 아니면 window.confirm에 그대로 띄운다.
export function buildClearListConfirmMessage(pendingCount: number): string | null {
  if (pendingCount <= 0) return null;
  return `승인되지 않은 ${pendingCount}건이 목록에서 사라집니다. 비우시겠습니까?`;
}
