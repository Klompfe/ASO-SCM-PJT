# PR-203 — 자재 포장단위 규칙 쓰기 권한을 MANAGER/ADMIN으로 제한

브랜치: `fix/packaging-unit-rules-admin-only` (분기점 `origin/main` `957f540`). **main에 병합하지 않음.**

## 배경

PILOT-8b에서 확인된 문제: `material-packaging-unit-rules.controller.ts`의 4개 엔드포인트(GET/POST/PATCH/DELETE)가 전역 `JwtAuthGuard`만 걸려 있어 **로그인한 USER 역할도 포장단위(롤 길이)를 바꿀 수 있었다.** 이 값은 발주 롤수 계산과 수출선적 단가 환산에 쓰이므로 다른 관리 메뉴와 같은 기준으로 제한한다.

## 변경 파일 (4개 수정 + 1개 신규)

| 파일 | 내용 |
|---|---|
| `src/material-packaging-unit-rules/material-packaging-unit-rules.controller.ts` | POST/PATCH/DELETE 3개 핸들러에 `@UseGuards(RolesGuard)` `@Roles(UserRole.MANAGER, UserRole.ADMIN)` 추가. **GET은 그대로 둠** |
| `frontend-app/src/components/Sidebar.tsx` | `materialPackagingUnitRules` 항목에 `adminOnly: true` 추가, `isItemVisible`에 `isManagerOrAdmin` 분기 추가 |
| `frontend-app/src/components/Sidebar.test.tsx`(신규) | USER에게는 메뉴가 숨고 MANAGER/ADMIN에게는 보이는지 회귀 테스트 |
| `test/material-packaging-unit-rules-flow.e2e-spec.ts` | 기존 CRUD 테스트를 MANAGER 토큰으로 전환(쓰기가 막혀 회귀 방지), USER GET 200 / USER POST·PATCH·DELETE 403 테스트 추가 |
| `test/invoice-thread-tape-price-conversion-flow.e2e-spec.ts` | 이 e2e의 시드용 사용자도 POST로 포장단위 규칙을 등록하므로, 등록 전에 해당 사용자를 MANAGER로 올리는 한 줄 추가(이 describe는 RBAC이 아니라 환산 로직을 검증하는 파일이라 최소 변경) |

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**(`git diff origin/main --stat` 확인).

## 적용한 데코레이터와 다른 메뉴와의 비교

| 컨트롤러 | 적용 단위 | 역할 |
|---|---|---|
| `users.controller.ts` | 클래스 전체 | MANAGER, ADMIN |
| `status-codes.controller.ts` | 메서드별(3곳) | MANAGER, ADMIN |
| `export-shipment-defaults.controller.ts` | 메서드별(쓰기 1곳, GET은 제외) | MANAGER, ADMIN |
| **`material-packaging-unit-rules.controller.ts`(이번)** | **메서드별(쓰기 3곳, GET은 제외)** | **MANAGER, ADMIN** — `export-shipment-defaults`와 동일한 "조회는 누구나/쓰기만 제한" 패턴 |

프런트 사이드바도 다른 `adminOnly` 항목(`exportShipmentDefaults`, `statusCodes`)과 동일하게 `isManagerOrAdmin`(= MANAGER 또는 ADMIN) 기준을 그대로 썼다 — `users`만 별도로 `canManageUsers`를 쓰지만 현재 두 플래그의 실제 값은 같다(`App.tsx:115`).

`TopNav.tsx`는 PR-109에서 Sidebar.tsx로 완전히 대체되어 저장소에 더 이상 존재하지 않는다(확인만, 변경 없음). `App.tsx`의 탭 렌더링(`switch`문)에는 다른 관리자 전용 탭(`users`/`statusCodes`/`exportShipmentDefaults`)도 포함해 역할 기반 렌더 가드가 없다 — 사이드바에서 숨기는 것이 유일한 방어선이며, 이번 변경도 그 기존 방식과 동일하게 맞췄다(새로운 방식을 도입하지 않음).

## GET 호출처 확인(제한에서 뺀 이유)

HTTP로 이 GET을 직접 호출하는 화면(일반 사용자 화면):
- `frontend-app/src/components/ItemsManager.tsx`
- `frontend-app/src/components/MultiStyleBulkOrder.tsx`
- `frontend-app/src/components/ThreadTapeClassificationManager.tsx`

모두 관리자 전용이 아닌 일반 로그인 사용자 화면이라 GET을 제한하면 깨진다. (백엔드 내부에서 서비스/리포지토리를 직접 주입해 쓰는 `work-orders.service.ts`, `mido-price-table.service.ts`, `purchase-order-document.service.ts`, `price-reference.service.ts`, `items.service.ts`는 컨트롤러를 거치지 않으므로 가드와 무관.)

## 403 시 프런트 안내

별도 변경 불필요 — `MaterialPackagingUnitRulesManager.tsx`는 이미 모든 쓰기 동작(`handleCreate`/`saveEdit`/`handleDelete`)에서 `catch` 시 `getErrorMessage(err, fallback)` + `toast.error`를 쓰고, `getErrorMessage`는 서버 응답의 `message`를 그대로 노출한다. 403 응답의 `message`("관리자 권한이 필요한 요청입니다.")가 그대로 토스트에 뜬다(실제 e2e 로그로 확인됨).

## 테스트 숫자(전/후)

| 항목 | 하한 | 결과 |
|---|---|---|
| 백엔드 `jest` 전체 | 1002 이상 | **1002**(변경 없음 — unit 테스트 파일 변경 없음) |
| e2e(`--maxWorkers=2`) | 555 이상 | **557**(+2, RBAC 테스트 추가) |
| 프런트 `vitest run` | 487 이상 | **490**(+3, Sidebar 가시성 테스트 추가) |
| 백엔드/프런트 `tsc`·`build` | 통과 | **통과** |

실패 0건.

## 사람이 화면에서 확인할 것

1. 일반 USER 계정으로 로그인 → 사이드바 "마스터·설정" 그룹에 **"자재 포장단위" 메뉴가 보이지 않는다**.
2. MANAGER 또는 ADMIN 계정으로 로그인 → 메뉴가 보이고, 등록/수정/삭제가 정상 동작한다.
3. (선택, API 직접 호출로만 확인 가능) USER 토큰으로 `POST/PATCH/DELETE /material-packaging-unit-rules`를 호출하면 403 + "관리자 권한이 필요한 요청입니다." — `GET`은 USER도 200.
4. `ItemsManager`/다중 스타일 발주/실·테이프 분류 화면은 역할과 무관하게 평소처럼 동작한다(읽기만 해서 영향 없음).

## 브랜치 상태

병합하지 않음 — `fix/packaging-unit-rules-admin-only`만 push됨.
