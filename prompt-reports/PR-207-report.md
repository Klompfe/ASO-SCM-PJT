# PR-207 — 납기 연도 보정: 결과가 오늘보다 과거이면 항상 다음 해로 올린다

브랜치: `fix/target-rdd-always-future` (분기점 `origin/main` `c1269d3`). **main에 병합하지 않음.**

## 배경

1단계 진단에서 확인된 `computeRollover`(PR-201/201d)의 `past-kept` 설계는 "작성일이 신뢰 가능하고 납기가 작성일보다 뒤면 — 오늘보다 과거여도 보정하지 않는다"는 규칙이었다. 사용자 결정: 이 업무에서 새로 올리는 작지의 납기는 항상 미래이므로, 결과가 오늘(Asia/Seoul)보다 과거이면 **항상** 다음 해로 올린다.

## 변경 파일 (13개)

| 파일 | 내용 |
|---|---|
| `src/sales-orders/utils/target-rdd-year-rollover.util.ts` | 1단계(작성일 기준 보정)는 그대로 두고, 2단계(`bumpYearToAtLeast`)를 새로 추가 — 결과가 오늘보다 과거면 월/일 유지하고 연도만 "오늘 이상이 되는 가장 작은 연도"까지 올린다. `TargetRddNotice`에서 `'past-kept'` 제거 |
| `src/sales-orders/utils/target-rdd-year-rollover.util.spec.ts` | 전면 재작성 — 기존 `past-kept` 기대값을 전부 새 결과로 교체, 지시서 명시 합성 입력 추가 |
| `src/sales-orders/utils/vision-guardrails.util.ts` | `checkDocumentDateSuspicious`의 과거 기준 18개월→12개월, 상수화(`DOCUMENT_DATE_SUSPICIOUS_PAST_MONTHS`), 경고 문구에 "옛 문서를 올린 것일 수 있습니다" 추가 |
| `src/sales-orders/utils/vision-guardrails.util.spec.ts` | 12개월 경계 테스트(11개월=경고없음, 13개월=경고) + 문구 테스트 추가 |
| `src/sales-orders/utils/target-rdd-validation.util.ts` | **버그 수정(이번 PR에서 새로 발견)**: `isSuspiciousTargetRdd`에 `rawTargetRdd`(보정 전 원본) 파라미터 추가 — 상세는 아래 "발견한 회귀" 참고 |
| `src/sales-orders/utils/target-rdd-validation.util.spec.ts` | 위 수정에 대한 테스트 2건 추가 |
| `src/sales-orders/vision.service.ts` | `applyTargetRddValidation`에서 보정 전 원본(`rawTargetRdd`)을 저장해 `isSuspiciousTargetRdd` 호출 시 함께 넘김(PROMPT/RESPONSE_SCHEMA는 변경 없음) |
| `src/sales-orders/vision.service.spec.ts` | `past-kept` 기대값 2건을 새 결과로 교체, 18개월→12개월 주석 수정 |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `targetRddNotice` 타입에서 `'past-kept'` 제거 |
| `frontend-app/src/api/salesOrders.service.ts` | 동일 타입 수정 |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | `past-kept` 안내 블록 삭제, `bumped-today` 안내 문구를 "오늘보다 이전이라 올렸다/직접 고치라" 취지로 변경(작지 표기 M/D 포함) |
| `frontend-app/src/utils/salesOrderOverviewEdit.ts` | `originalMonthDay()` 순수 함수 추가(YYYY-MM-DD → M/D) |
| `frontend-app/src/utils/salesOrderOverviewEdit.test.ts` | 위 함수 테스트 3건 추가 |

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**, `PROMPT`/`RESPONSE_SCHEMA`(vision.service.ts) 변경 **0건**(`git diff` 확인).

## 규칙 전/후 (입력 → 출력)

| 입력(targetRdd, documentDate, 오늘) | 이전(PR-201d) | 이번(PR-207) |
|---|---|---|
| `2026-02-17`, `2026-01-01`, `2026-10-14` | 변경 없음, `past-kept` | **`2027-02-17`**, `bumped-today` |
| `2026-02-17`(==documentDate), `2026-02-17`, `2026-10-14` | 변경 없음, `past-kept` | **`2027-02-17`**, `bumped-today` |
| `2024-02-17`(2년↑ 과거), `null`, `2026-10-14` | 변경 없음, `past-kept` | **`2027-02-17`**(PR-190 원래 의도 복원), `bumped-today` |
| `2024-02-29`(윤년), `null`, `2026-10-14` | 변경 없음(다음 해 평년이라 포기) | **`2028-02-29`**(다음 2/29까지 건너뜀), `bumped-today` |
| `2026-12-30`, `2026-01-01`, `2026-10-14` | 변경 없음, `none` | 변경 없음(동일), `none` |
| `2026-02-17`, `2026-07-01`, `2026-10-14` | `2027-02-17`, `bumped-written` | 변경 없음(동일) |

## 작성일 의심 기준 영향(18→12개월)

18→12개월로 좁히면서, **기존에 "작성일 기준(DOCUMENT_DATE)"으로 분류되던 일부 케이스가 "오늘 기준(TODAY)"으로 재분류**된다 — 작성일이 12~18개월 전인 문서가 그 경계다. 실제로 하네스/스펙에서 이 재분류가 드러난 사례 2건(아래 "고친 기존 테스트" 참고)이 전부 이 때문에 결과가 바뀌었다. API 호출 없이 코드 레벨로만 확인했다.

## 발견한 회귀 — `isSuspiciousTargetRdd`가 PR-158 오인식 탐지를 놓치게 됨

진행 중 백엔드 전체 테스트를 돌리다 `vision.service.spec.ts`의 "납기가 문서작성일과 같으면 targetRddSuspicious: true" 테스트가 **실패**하는 것을 발견했다. 원인: `applyTargetRddValidation`이 `isSuspiciousTargetRdd`를 **보정(rollover) 이후의** `targetRdd`로 호출하는데, PR-207부터는 보정이 항상 미래로 밀어 올리므로 `targetRdd === documentDate`(PR-158의 오인식 패턴) 또는 `targetRdd <= documentDate` 조건이 더 이상 걸리지 않게 된다. **지시서에 없던 범위지만, 이 PR의 핵심 변경이 직접 유발한 회귀라 함께 고쳤다**(`target-rdd-validation.util.ts`에 `rawTargetRdd` 선택 파라미터 추가, `vision.service.ts`에서 보정 전 원본을 넘김). 기존 호출 호환(파라미터 생략 시 기존과 동일 동작) — 테스트 2건 추가.

## 고친 기존 테스트 목록

| 파일 | 테스트 | 이전 기대값 | 새 기대값 | 이유 |
|---|---|---|---|---|
| `target-rdd-year-rollover.util.spec.ts` | 작성일 2026-01-01+납기 2026-02-17(오늘 10-14) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today` | PR-207 2단계 |
| 〃 | 작성일 2025-09-08+납기 2026-03-17(오늘 10-14) | 변경없음/`past-kept`(작성일 기준 신뢰) | `2027-03-17`/`bumped-today`(basis=TODAY) | 18→12개월로 작성일이 의심스러워짐 |
| 〃 | 납기==작성일(PR-158 패턴, 오늘 10-14) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today` | PR-207 2단계(예외도 불변식 적용) |
| 〃 | 2/29(2024, 오늘 10-14) | 변경없음 | `2028-02-29` | PR-207 2단계(유효한 연도까지 탐색) |
| 〃 | 2024-02-17(2년↑ 과거, 오늘 10-14) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today` | PR-190 원래 동작 복원 |
| 〃 | 2025-10-14(기준일과 정확히 같아짐, 오늘 10-14) | 변경없음/`past-kept` | `2026-10-14`/`bumped-today` | PR-207 2단계(오늘 이상이면 충분) |
| 〃 | w=2025-09-08, d=2026-03-17(오늘 10-24) | 변경없음/`past-kept` | `2027-03-17`/`bumped-today` | 18→12개월 |
| 〃 | ③ w=2025-09-01, d=2026-03-17(오늘 10-24) | 변경없음/`past-kept` | `2027-03-17`/`bumped-today` | 18→12개월 |
| 〃 | w=2021-01-01(4~5년 전), d=2021-02-17(오늘 10-24) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today` | PR-207 2단계 |
| 〃 | d=w=2026-02-17(오늘 10-24, PR-158 패턴) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today` | PR-207 2단계 |
| `vision.service.spec.ts` | MB74BLM107 재현(작성일 2026-01-01, 납기 2026-02-17, 오늘 10-14) | 변경없음/`past-kept` | `2027-02-17`/`bumped-today`, basis=`TODAY` | PR-207 2단계 |
| 〃 | 작성일 2025-09-08+납기 2026-03-17(오늘 10-23) | 변경없음/`past-kept` | `2027-03-17`/`bumped-today` | 18→12개월 |

**PR-190 원래 기대값(2027로 올림) 복원 확인**: 위 "2024-02-17(2년↑ 과거)" 테스트가 정확히 이 경우다 — PR-201이 추가했던 "2년 이상 이전이면 보정 금지" 규칙이 이번에 없어지면서 PR-190이 원래 의도했던 2027 보정이 복원됐다.

## 받아들인 단점(지시서에서 요구한 명시)

이미 납품·선적이 끝난 오래된 문서를 다시 올리면, 그 과거 납기가 다음 해로 올라가 버린다(이 업무에서는 모든 새 작지의 납기가 미래라는 전제를 쓰기 때문). 12개월 경고(`DOCUMENT_DATE_SUSPICIOUS`, 문구에 "옛 문서를 올린 것일 수 있습니다" 포함)와 `bumped-today` 파란 안내 배지로 사람이 알아보게 한다. **이미 저장된 기존 스타일에는 소급 적용하지 않는다**(이번 PR은 새로 분석하는 문서에만 적용 — DB를 건드리지 않음).

## 테스트 숫자 (전/후)

| 항목 | 하한 | 이번 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 1012 이상 | **1024** |
| e2e(`--maxWorkers=2`) | 557 이상 | **557** |
| 프런트 `vitest run` | 495 이상 | **498** |
| 백엔드/프런트 `tsc`·`build` | 통과 | **통과** |

전부 하한 충족, 실패 0건.

## 사람이 화면에서 확인할 것

1. 납기가 `2/17`인 작지를 올리면 납기가 `2027-02-17`로 채워지고 파란 안내("납기가 오늘보다 이전이라 2027-02-17로 올렸습니다(작지 표기: 2/17). 틀리면 직접 고치세요.")가 보인다.
2. 납기 `12/20`인 작지는 안내 없이 `2026-12-20`.
3. 작성일이 1년(12개월) 넘게 과거인 작지는 "옛 문서를 올린 것일 수 있습니다" 경고가 보인다.

## 이번 PR에서 하지 않은 것

납기 칸 크롭 재독(1-b), 이미 저장된 스타일의 납기 소급 수정, 프롬프트/RESPONSE_SCHEMA 변경 — 전부 손대지 않음.

## 브랜치 상태

병합하지 않음 — `fix/target-rdd-always-future`만 push됨.
