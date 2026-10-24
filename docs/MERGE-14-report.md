# MERGE-14 반영 보고서

지시서: "MERGE-14 — PR-203 병합(자재 포장단위 규칙 쓰기 권한을 MANAGER/ADMIN으로 제한, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `fix/packaging-unit-rules-admin-only`, head `3460f65`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `957f540`(MERGE-13 보고서 커밋)
- 병합 후 main SHA: `3460f65`
- 병합 방식: `git merge --ff-only fix/packaging-unit-rules-admin-only` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `fix/packaging-unit-rules-admin-only^{tree}`와 정확히 일치함을 확인(`abc3cca`).

## 변경 파일 (6개, `origin/main...origin/fix/packaging-unit-rules-admin-only`)

1. `src/material-packaging-unit-rules/material-packaging-unit-rules.controller.ts` — POST/PATCH/DELETE 3개에 `@UseGuards(RolesGuard)` `@Roles(UserRole.MANAGER, UserRole.ADMIN)` 추가, GET은 무제한 유지
2. `frontend-app/src/components/Sidebar.tsx` — "자재 포장단위" 메뉴에 `adminOnly: true` + `isManagerOrAdmin` 분기 추가
3. `frontend-app/src/components/Sidebar.test.tsx`(신규) — USER에게 숨김/MANAGER·ADMIN에게 표시 회귀 테스트
4. `test/material-packaging-unit-rules-flow.e2e-spec.ts` — 기존 CRUD를 MANAGER 토큰으로 전환, USER 권한(GET 200/쓰기 403) 테스트 추가
5. `test/invoice-thread-tape-price-conversion-flow.e2e-spec.ts` — 시드용 테스트 사용자를 MANAGER로 전환(최소 변경)
6. `prompt-reports/PR-203-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**. GET 핸들러에는 역할 제한이 걸리지 않음(확인됨). **DB 데이터는 이 병합으로 바뀌지 않는다**(권한 로직만 변경).

## 충돌 해결 내역

**없음.** main이 분기점(`957f540`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(PR-202/MERGE-13 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1002 | 1002 이상 | **1002** |
| e2e(`--maxWorkers=2`) | 555 | 557 이상 | **557** |
| 프런트 `vitest run` | 487 | 490 이상 | **490** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. **일반 사용자(USER) 계정**으로 로그인하면 사이드바에 "자재 포장단위"가 보이지 않는다. **MANAGER 또는 ADMIN 계정**에서는 보이고 포장단위 등록·수정·삭제가 정상 동작한다(역할 기준은 `prompt-reports/PR-203-report.md`의 비교 표 참고).
3. 작지 분석 검토 화면/품목 화면의 포장단위 드롭다운, 다중 스타일 발주 화면, 실·테이프 분류 화면 등 **조회 기능은 USER 계정에서도 그대로 동작**한다(GET은 제한하지 않음).
