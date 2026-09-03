# HANDOFF — 2026-09-04 세션 종료 시점

## 대기 중인 브랜치 (모두 push 완료, 병합 안 함)

| 순서 | 브랜치 | PR | 내용 |
|---|---|---|---|
| 1 | `fix/po-inventory-sync` | PR-010 | PO RECEIVED 시 Inventory 자동 반영 |
| 2 | `fix/global-auth-guard` | PR-011 | items 컨트롤러 인증 누락 수정 + 전역 JwtAuthGuard 전환 |
| 3 | `chore/auth-cleanup` | PR-012 | auth 모듈 중복 파일 정리 + JWT_SECRET 통일 |

세 브랜치 모두 `main`에서 각각 독립적으로 분기했다. **머지는 반드시 위 순서(1 → 2 → 3)대로 진행할 것.**

## ⚠️ 병합 시 확인 필요 — `mapping.controller.ts` 충돌

`fix/global-auth-guard`와 `chore/auth-cleanup` 둘 다 `src/mapping/mapping.controller.ts`의 **같은 줄**(`JwtAuthGuard` import 및 `@UseGuards` 데코레이터)을 서로 다르게 수정한다:

- `fix/global-auth-guard`: `import { JwtAuthGuard } ...` 줄과 `@UseGuards(JwtAuthGuard)` 데코레이터 자체를 **제거** (전역 `APP_GUARD`로 대체되므로).
- `chore/auth-cleanup`: import 경로만 `../auth/guards/jwt-auth.guard` → `../auth/jwt-auth.guard`로 **교체**, `@UseGuards`는 그대로 유지 (이 브랜치는 `main` 기준이라 전역 가드가 아직 없어서 로컬 가드를 남겨둠).

순서대로(2번 다음 3번) 머지하면 3번째 머지에서 이 파일에 **conflict가 날 가능성이 높다.** 해결 시 `fix/global-auth-guard` 병합 후 상태(가드 제거됨, 전역 가드로 보호됨)를 기준으로 삼고, `chore/auth-cleanup`의 import 경로 수정 의도만 반영하면 됨 — 즉 최종적으로는 `@UseGuards` 없이 전역 가드만 적용된 상태가 맞다.

## 참고

- 세 브랜치 모두 워킹트리에 `src/auth/dto/login.dto.ts`, `src/styles/entities/style.entity.ts` 수정과 `docs/design/`(untracked)이 남아있음 — 이번 세션 내내 각 PR과 무관하다고 판단해 커밋에서 제외해온 사전 변경사항. 병합 작업과는 무관하니 그대로 두거나 별도로 처리할 것.
- 각 브랜치는 `npm run test`/`npm run test:e2e` 모두 통과 확인된 상태에서 push됨.
