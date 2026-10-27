# MERGE-12 반영 보고서

지시서: "MERGE-12 — PR-201 병합(마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `feat/pr-201-review-screen-fixes`(PR-201 + PR-201c + PR-201d), head `736f2d2`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `7f1d906`(분기점, PR-200 반영 직후와 동일)
- 병합 후 main SHA: `736f2d2`
- 병합 방식: `git merge --ff-only feat/pr-201-review-screen-fixes` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `feat/pr-201-review-screen-fixes^{tree}`와 정확히 일치함을 확인.

## 변경 파일 (16개, `origin/main...origin/feat/pr-201-review-screen-fixes`)

1. `frontend-app/src/api/salesOrders.service.ts`
2. `frontend-app/src/components/SalesOrderUploadModal.tsx`
3. `frontend-app/src/utils/salesOrderBomReview.test.ts`
4. `frontend-app/src/utils/salesOrderBomReview.ts`
5. `frontend-app/src/utils/salesOrderOverviewEdit.test.ts`
6. `frontend-app/src/utils/salesOrderOverviewEdit.ts`
7. `frontend-app/src/utils/visionGuardrails.test.ts`
8. `frontend-app/src/utils/visionGuardrails.ts`
9. `prompt-reports/PR-201-report.md`
10. `src/sales-orders/dto/ai-analysis.dto.ts`
11. `src/sales-orders/utils/target-rdd-year-rollover.util.spec.ts`
12. `src/sales-orders/utils/target-rdd-year-rollover.util.ts`
13. `src/sales-orders/utils/vision-guardrails.util.spec.ts`
14. `src/sales-orders/utils/vision-guardrails.util.ts`
15. `src/sales-orders/vision.service.spec.ts`
16. `src/sales-orders/vision.service.ts`

마이그레이션 변경 **0건**(`src/migrations/`). `package.json`/락 파일 변경 **0건**. `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` **없음**. 전부 `src/sales-orders/`(작지 AI 분석 경로) + 작지 검토 화면 관련 `frontend-app/` 순수 함수·테스트 + `prompt-reports/`로 한정(`boms/`·`work-orders/`·`mapping/`·`purchase-orders/` 등 변경 없음). `vision.service.ts`의 `PROMPT`·`RESPONSE_SCHEMA`는 변경 없음(grep으로 확인).

## 충돌 해결 내역

**없음.** main이 분기점(`7f1d906`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽으로의 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run에서도 CONFLICT 0건 확인됨).

## 테스트 숫자(전/후)

| 항목 | 직전(PR-201c 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 994 | 1002 이상 | **1002** |
| e2e(`--maxWorkers=2`) | 555 | 555 이상 | **555** |
| 프런트 `vitest run` | 485 | 485 이상 | **485** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 화면에서 확인할 것 (배포 후, 작지를 올려 분석 결과만 보고 저장은 누르지 않아도 됨)

1. 겉감이 2색 이상인 작지: 두 색상 행에 "요척 × 수량 … 와 다릅니다" 경고가 사라지거나, 남더라도 "같은 자재 N개 색상 행의 출고량 합 …" 문구로 묶음 단위로 나온다. 어떤 경우에도 **"요척 N로" 버튼이 나타나지 않는다.**
2. 출고량이 실제로 틀린 단일 행: 경고는 그대로 나오고 문구에 "출고량"이 들어 있다(버튼 없음).
3. 작성일이 과거인 작지(보관·시험 문서): 납기가 오늘보다 과거여도 **값이 바뀌지 않고** "오늘보다 이른 날짜입니다" 안내(주황색)가 나온다. 새 작지(작성일이 최근)는 납기가 미래이면 안내가 없다. 납기가 작성일보다 이른 경우는 연도가 보정되고 보정 안내(파란색)가 나온다.
4. 저장 버튼이 비활성일 때 버튼 옆에 이유 문장이 항상 보이고, 스타일번호 대조 체크박스가 같은 영역에 있으며, 체크하면 곧바로 저장이 활성화된다(별도 확인 단계 없음). 스타일번호를 직접 수정하면 대조 완료로 바뀐다.
5. Cloudflare 빌드 성공, Render Live.
