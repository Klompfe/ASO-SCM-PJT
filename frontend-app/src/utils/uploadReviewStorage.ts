// PR-237: 승인 전/실패 스타일 목록이 ItemsManager의 컴포넌트 로컬 state(useState)에만
// 있어, 메뉴를 이동했다 돌아오거나(이 컴포넌트가 unmount됨 — App.tsx가 activeTab에 따라
// 아예 다른 JSX를 반환하는 switch라 조건에서 빠지면 React가 통째로 지운다) 새로고침하면
// 그대로 사라졌다. 이 파일은 그 상태를 sessionStorage에 보관/복원한다 — 로그인별로 보관할
// 필요는 없고(같은 브라우저 세션 안에서만 유효하면 됨) 탭/창을 닫으면 사라지는 것으로
// 충분하다는 요구사항에 맞춰 sessionStorage를 쓴다(localStorage였다면 다른 계정으로
// 로그인해도 남을 수 있어 부적절).
import type { ParsedStyleResult } from '../api/mapping.service';
import type { ApprovalFailureReason } from './uploadReviewStatus';

const STORAGE_KEY = 'materialUploadReview:v1';
// sessionStorage 총 할당량은 보통 5~10MB — 시트가 많이 든 큰 파일을 여러 번 올리면 넘칠
// 수 있다. 저장을 시도하기 전에 미리 글자 수로 가드해, 큰 입력이 "조용히 실패"하는 대신
// 호출하는 쪽이 안내 문구를 보여줄 수 있게 false를 돌려준다.
const MAX_STORED_LENGTH = 4_000_000;

export interface StoredUploadReview {
  styles: ParsedStyleResult[];
  existsMap: Record<string, boolean>;
  // 키: style.sheetName(모든 파싱 결과가 항상 가지는 유일 식별자 — styleNo가 없는
  // 파싱 실패 행도 이 키로는 가리킬 수 있다).
  failuresBySheet: Record<string, ApprovalFailureReason>;
}

export interface SaveUploadReviewResult {
  saved: boolean;
  // saved===false일 때만 의미 있음 — 화면에 보여줄 안내 문구.
  reason?: string;
}

export function saveUploadReview(state: StoredUploadReview): SaveUploadReviewResult {
  try {
    const json = JSON.stringify(state);
    if (json.length > MAX_STORED_LENGTH) {
      return { saved: false, reason: '이 목록은 너무 커서 이 브라우저에만 임시로 보관되며 창을 닫으면 사라질 수 있습니다.' };
    }
    sessionStorage.setItem(STORAGE_KEY, json);
    return { saved: true };
  } catch {
    return { saved: false, reason: '이 목록은 이 브라우저에만 임시로 보관되며 창을 닫으면 사라질 수 있습니다.' };
  }
}

export function loadUploadReview(): StoredUploadReview | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.styles)) return null;
    return {
      styles: parsed.styles,
      existsMap: parsed.existsMap ?? {},
      failuresBySheet: parsed.failuresBySheet ?? {},
    };
  } catch {
    return null;
  }
}

export function clearUploadReview(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 보관소 접근 자체가 안 되면(프라이빗 모드 등) 지울 것도 없다 — 무시한다.
  }
}

// App.tsx(항상 마운트돼 있음)의 beforeunload 판단에 쓴다 — ItemsManager가 지금
// 마운트돼 있지 않아도(다른 탭을 보는 중이어도) 저장된 값만으로 판단할 수 있어야
// 하므로, React state가 아니라 sessionStorage를 직접 읽는다.
export function hasPendingUploadReviewWork(): boolean {
  const stored = loadUploadReview();
  return !!stored && stored.styles.length > 0;
}
