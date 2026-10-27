# MERGE-16 반영 보고서

지시서: "MERGE-16 — PR-207 병합(납기 연도 보정: 결과가 오늘보다 과거이면 항상 다음 해로 올림, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `fix/target-rdd-always-future`, head `90f5b84`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `c1269d3`(MERGE-15 보고서 커밋)
- 병합 후 main SHA: `90f5b84`
- 병합 방식: `git merge --ff-only fix/target-rdd-always-future` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `fix/target-rdd-always-future^{tree}`와 정확히 일치함을 확인(`45a61b5`).

## 변경 파일 (14개, `origin/main...origin/fix/target-rdd-always-future`)

1. `src/sales-orders/utils/target-rdd-year-rollover.util.ts` — 2단계(`bumpYearToAtLeast`) 추가, `past-kept` 제거
2. `src/sales-orders/utils/target-rdd-year-rollover.util.spec.ts` — 기대값 전면 교체
3. `src/sales-orders/utils/vision-guardrails.util.ts` — 작성일 의심 기준 18→12개월
4. `src/sales-orders/utils/vision-guardrails.util.spec.ts` — 12개월 경계 테스트 추가
5. `src/sales-orders/utils/target-rdd-validation.util.ts` — `isSuspiciousTargetRdd`에 `rawTargetRdd` 파라미터 추가(회귀 수정)
6. `src/sales-orders/utils/target-rdd-validation.util.spec.ts` — 위 수정 테스트 추가
7. `src/sales-orders/vision.service.ts` — 보정 전 원본값을 `isSuspiciousTargetRdd`에 함께 전달
8. `src/sales-orders/vision.service.spec.ts` — `past-kept` 기대값 교체
9. `src/sales-orders/dto/ai-analysis.dto.ts` — `targetRddNotice` 타입에서 `past-kept` 제거
10. `frontend-app/src/api/salesOrders.service.ts` — 동일 타입 수정
11. `frontend-app/src/components/SalesOrderUploadModal.tsx` — `past-kept` 안내 삭제, `bumped-today` 문구 변경
12. `frontend-app/src/utils/salesOrderOverviewEdit.ts` — `originalMonthDay()` 추가
13. `frontend-app/src/utils/salesOrderOverviewEdit.test.ts` — 위 함수 테스트 추가
14. `prompt-reports/PR-207-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**, `PROMPT`/`RESPONSE_SCHEMA`(vision.service.ts) 변경 **0건**. **DB 데이터는 이 병합으로 바뀌지 않는다** — 새로 분석하는 문서에만 적용되고, 이미 저장된 스타일의 납기는 소급 수정하지 않는다.

## 충돌 해결 내역

**없음.** main이 분기점(`c1269d3`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(MERGE-15 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1012 | 1024 이상 | **1024** |
| e2e(`--maxWorkers=2`) | 557 | 557 이상 | **557**(1회차 `import-shipments-dpkl-flow` 1건 실패 — 재실행 시 557/557 통과, PR-207과 무관한 기존 불안정 테스트로 확인, 해당 모듈은 이 PR에서 변경하지 않음) |
| 프런트 `vitest run` | 495 | 498 이상 | **498** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

하한 충족, 재현 가능한 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. 납기가 `2/17`처럼 오늘보다 과거로 읽히는 작지를 올리면 납기가 **2027-02-17**로 채워지고 파란 안내("납기가 오늘보다 이전이라 2027-02-17로 올렸습니다(작지 표기: 2/17). 틀리면 직접 고치세요.")가 보인다. 납기 `12/20`인 작지는 안내 없이 `2026-12-20`이다.
3. 작성일이 1년(12개월) 넘게 과거인 작지는 "옛 문서를 올린 것일 수 있습니다" 작성일 경고가 보인다. 이미 저장된 스타일의 납기는 바뀌지 않는다.
