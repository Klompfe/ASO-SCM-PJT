# MERGE-18 반영 보고서

지시서: "MERGE-18 — PR-211 병합(MATERIAL LIST 재업로드가 기존 총수량을 0으로 지우지 않게 막기, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `fix/overview-totalqty-no-zero-overwrite`, head `43a9947`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `a55c497`(MERGE-17 보고서 커밋)
- 병합 후 main SHA: `43a9947`
- 병합 방식: `git merge --ff-only fix/overview-totalqty-no-zero-overwrite` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `fix/overview-totalqty-no-zero-overwrite^{tree}`와 정확히 일치함을 확인(`d34c6a2`).

## 변경 파일 (6개, `origin/main...origin/fix/overview-totalqty-no-zero-overwrite`)

1. `src/mapping/services/mapping-commit.service.ts` — `mergeOverview`의 totalQty 조건을 `Number.isFinite(...) && ... > 0`으로 변경
2. `src/mapping/services/mapping-commit.service.spec.ts` — 보호 테스트 8건 추가
3. `frontend-app/src/components/MappingPreviewModal.tsx` — 0이면 "미기재" 표시
4. `frontend-app/src/components/MappingApprovalScreens.test.tsx` — 표시 테스트 2건 추가
5. `test/mapping-reapprove-merge-flow.e2e-spec.ts` — 재업로드 플로우 e2e 테스트 1건 추가
6. `prompt-reports/PR-211-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**, `PROMPT`/`RESPONSE_SCHEMA`(vision.service.ts) 변경 **0건**. **DB 데이터는 이 병합으로 바뀌지 않는다** — 이미 0으로 덮어써졌을 수 있는 기존 스타일은 이 PR로 복구되지 않는다(스타일 관리 화면에서 직접 확인·수정 필요).

## 충돌 해결 내역

**없음.** main이 분기점(`a55c497`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(MERGE-17 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1049 | 1057 이상 | **1057** |
| e2e(`--maxWorkers=2`) | 557 | 558 이상 | **558** |
| 프런트 `vitest run` | 498 | 500 이상 | **500** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. **시험용 스타일(운영 스타일 사용 금지)**에서: 총수량이 있는 스타일에 같은 MATERIAL LIST를 다시 올려도(미리보기 → 저장) 스타일 관리의 총수량이 그대로다. 미리보기 화면에는 총 생산수량 0이 "미기재 (기존 값이 있으면 유지됩니다)"로 보인다.
3. 새 스타일을 MATERIAL LIST로 올릴 때의 동작(총수량 0 저장)은 이전과 같다. 이후 PR-212에서 색상×사이즈 수량으로 총수량을 채운다.
