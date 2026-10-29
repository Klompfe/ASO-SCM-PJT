# MERGE-17 반영 보고서

지시서: "MERGE-17 — PR-208 병합(봉제·섬유 품목군 자모 오독 자동 교정, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `feat/term-autocorrect-category`, head `995bd45`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `e9c5774`(MERGE-16 보고서 커밋)
- 병합 후 main SHA: `995bd45`
- 병합 방식: `git merge --ff-only feat/term-autocorrect-category` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `feat/term-autocorrect-category^{tree}`와 정확히 일치함을 확인(`43e73a6`).

## 변경 파일 (12개, `origin/main...origin/feat/term-autocorrect-category`)

1. `src/sales-orders/utils/category-vocab.constants.ts`(신규) — 정적 어휘 115개
2. `src/sales-orders/utils/term-autocorrect.util.ts`(신규) — 자모 거리·품목군 추출·교정 판정 순수 함수
3. `src/sales-orders/utils/term-autocorrect.util.spec.ts`(신규) — 단위 테스트 23건
4. `src/sales-orders/vision.service.ts` — 후처리 연결, `NAME_AUTOCORRECTED` 경고
5. `src/sales-orders/vision.service.spec.ts` — 연결부 테스트 2건
6. `src/sales-orders/dto/ai-analysis.dto.ts` — `nameCorrection` 필드 추가
7. `frontend-app/src/api/salesOrders.service.ts` — 동일 타입 추가
8. `frontend-app/src/components/SalesOrderUploadModal.tsx` — "교정됨" 배지
9. `scripts/vision-eval/types.ts` — `AiBomItemLike.nameCorrection` 추가
10. `scripts/vision-eval/scoring/bom-match.ts` — 채점을 교정 전 원문으로 보호
11. `scripts/vision-eval/scoring/bom-match.spec.ts` — 위 보호 테스트 1건
12. `prompt-reports/PR-208-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**, `PROMPT`/`RESPONSE_SCHEMA`(vision.service.ts) 변경 **0건**. `category-vocab.csv` 등 CSV/xlsx/pdf/이미지 파일 추가 **0건**(상수 파일은 품목군 이름 문자열만 포함, 거래처명·스타일번호·단가 등 업무 데이터 없음 — 확인됨). **DB 데이터는 이 병합으로 바뀌지 않는다** — 이미 저장된 BOM은 소급 교정되지 않는다.

## 충돌 해결 내역

**없음.** main이 분기점(`e9c5774`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(MERGE-16 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1024 | 1049 이상 | **1049** |
| e2e(`--maxWorkers=2`) | 557 | 557 이상 | **557** |
| 프런트 `vitest run` | 498 | 498 이상 | **498** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. 이름에 `보봉사`가 든 작지를 올리면 `본봉사`로 바뀌고 "교정됨(보봉사→본봉사)" 배지가 보인다(원문은 배지에 함께 표시됨). 정상 이름은 변화가 없고, 사전에 없는 이름은 기존처럼 경고만 뜬다.
3. 납기·작성일·가격 등 이전 PR의 화면 동작(납기 2027-02-17 보정, 참고단가 후보)은 그대로다. 이미 저장된 스타일은 바뀌지 않는다.
