# PR-190 완료 보고: 작업지시서 납기 연도 자동 보정

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과를 확인하려는 사람).

- 브랜치: `fix/target-rdd-year-rollover` (`origin/main` `00138e0`에서 분기)
- **마이그레이션 없음** — DTO 선택 필드 2개 추가뿐, 스키마 변경 없음(`git diff origin/main --stat`로 확인 — `src/migrations/`에 새 파일 없음).
- **운영 DB에 전혀 접속하지 않았습니다.** 서버·마이그레이션·스크립트 어느 것도 `.env`(운영) 설정으로 실행하지 않았음 — 검증은 백엔드 단위/e2e + 프론트 단위/빌드만으로 수행.

## 1. 배경과 원인

작업지시서 업로드 화면에서 스타일 MB74BLM107의 문서 작성일이 2026-07-01인데 납기가 2026-02-17로 인식돼 "납기가 문서 작성일보다 빠르거나 과거 날짜입니다" 경고가 떴다. 원본 작지에는 납기가 "2/17"처럼 연도 없이 적혀 있어, AI가 (프롬프트 지시대로) 연도만 문서 작성일 연도로 보충한 결과다. 도메인 규칙(제시님 확인): 납기는 항상 작성일 이후이므로, 월/일이 작성일보다 앞서면 다음 해(2027)의 날짜다.

## 2. 변경 요약

| 영역 | 내용 |
|---|---|
| A. 프롬프트 보강 | `vision.service.ts`의 targetRdd 설명에 "연도가 안 보이면 작성일 이후 가장 가까운 해당 월/일로 변환, 작성일 이전 날짜로 만들지 말 것"을 명시하고 구체적인 예시(2026-07-01 기준 "2/17"→2027-02-17, "12/30"→2026-12-30)를 추가했다. 프롬프트만으로는 불충분하다는 전제 아래 B가 실제 안전장치다. |
| B. 결정적 보정 로직(핵심) | 새 순수 함수 `src/sales-orders/utils/target-rdd-year-rollover.util.ts`의 `rolloverTargetRddYear(targetRdd, documentDate)`. `applyTargetRddValidation()`이 `isSuspiciousTargetRdd` 계산 **전에** 먼저 이 함수로 보정을 적용한다. |
| C. DTO/화면 | `AiOverviewDto`에 `targetRddYearAdjusted?: boolean`, `targetRddOriginal?: string \| null`(서버 계산, `commitAnalysis()`는 기존 `targetRddSuspicious`와 동일하게 이 필드들을 읽지 않으므로 코드 변경 없이 자동으로 "무시"됨 — `commitAnalysis()`가 필요한 필드만 명시적으로 골라 쓰는 구조라서). 프론트 `SalesOrderUploadModal.tsx`에 파란/회색 안내 추가, `updateOverviewField`가 사용자의 직접 수정 시 안내를 지운다. |

## 3. 보정 규칙 표

| 입력 조건 | 결과 |
|---|---|
| `targetRdd` 또는 `documentDate`가 없음 | 변경 없음 |
| 둘 중 하나라도 `YYYY-MM-DD` 형식이 아니거나 달력에 없는 날짜(예: 평년의 2/29) | 변경 없음 |
| `targetRdd === documentDate` | **절대 보정하지 않음**(PR-158의 "작성일을 납기로 잘못 인식" 패턴이므로 의심 경고만 유지) |
| `targetRdd > documentDate`(이미 미래) | 변경 없음 |
| `targetRdd < documentDate`이고, 연도 +1한 날짜가 달력에 존재하며 `documentDate`보다 뒤 | **연도 +1로 보정**(`adjusted: true`, `original`에 원래 값) |
| 연도 +1한 날짜가 달력에 없음(윤년 2/29 → 다음 해가 평년) | 변경 없음(의심 표시는 `isSuspiciousTargetRdd`가 그대로 계산) |
| 연도 +1해도 여전히 `documentDate` 이하(원래 연도가 2년 이상 이전 등) | 변경 없음(2년 이상 보정 금지 — 억지로 더 보정하지 않음) |

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **63 suites / 808 tests** 통과 — 신규: `target-rdd-year-rollover.util.spec.ts` 11건(실사례·경계값 포함), `vision.service.spec.ts`에 2건 추가 + 기존 1건 업데이트(새 필드 포함하도록) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **65 suites / 507 tests** 통과(회귀 없음 — sales-orders 관련 e2e는 overview 전체를 엄격 비교하는 곳이 없어 영향받지 않음) |
| 프론트 `tsc -b` | 통과 |
| 프론트 `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **51 files / 329 tests** 통과 — 신규: `salesOrderOverviewEdit.test.ts`에 2건("직접 수정 시 안내가 지워진다" / "다른 필드 수정 시 안내는 유지된다") |

### 프론트 렌더 테스트에 대해
`SalesOrderUploadModal`의 납기 안내 UI(`targetRddYearAdjusted` 조건부 렌더)는 `results` state가 비동기 분석 완료 후에만 채워지는데, 이 환경은 `renderToStaticMarkup`(동기 초기 렌더만) 외의 DOM 상호작용/useEffect 실행을 지원하지 않는다 — 기존 `targetRddSuspicious`(PR-158) 경고도 같은 이유로 렌더 테스트가 없다. 대신 그 조건부 표시를 구동하는 로직(`updateOverviewField`가 납기 직접 수정 시 안내를 지우는 것)은 순수 함수 테스트로 확인했고, 서버가 내려주는 값 자체(`targetRddYearAdjusted`/`targetRddOriginal`)는 `vision.service.spec.ts`로 끝까지 검증했다.

## 5. 하지 않은 것(명시적 지시 준수)

- 이미 저장된 스타일/계약의 납기 소급 수정 없음(이번 보정은 분석 응답 단계에서만 적용 — `commitAnalysis()` 자체는 건드리지 않았고, 사람이 화면에서 확인 후 저장하는 기존 흐름 그대로).
- 다른 날짜 필드(발주 납기 등)의 연도 추정 변경 없음.
- 운영 DB 접속 없음.

## 6. 브랜치 SHA(최초 구현)

커밋 `159d393`. 병합하지 않음(`pause-after`).

---

## 7. 보강 — 납기 연도 보정을 "오늘(한국시간)" 기준으로 단순화

### 배경(실제로 확인된 사각지대)
작지(MB74BLM107)를 다시 올려보니 작성일(참고) 2026-01-01, 납기 2026-02-17로 나왔는데도 빨간 의심 경고만 뜨고 보정되지 않았다. 최초 버전은 `targetRdd < documentDate`일 때만 보정했는데, 이 사례는 **작성일 자체가 2026-01-01로(납기 2026-02-17보다 더 이른 값으로) 인식**돼 있어 보정 조건(납기 < 작성일)에 걸리지 않았다 — 하지만 오늘(조회 시점 2026-10-14) 기준으로는 납기가 이미 8개월 넘게 지난 날짜였다. 또한 `applyTargetRddValidation`의 `today`가 `new Date().toISOString().slice(0,10)`(UTC)라 한국 00:00~09:00 사이에는 어제 날짜로 계산되는 문제도 있었다.

### 사용자 결정
- 문서 작성일 값은 절대 건드리지 않는다 — 고칠 것은 납기뿐.
- 기준은 **오늘 날짜(한국시간, KST)**.
- 납기가 오늘(KST)보다 빠르면 다음 해로 보정한다.

### 변경 내용
- `rolloverTargetRddYear(targetRdd, documentDate, today)` — `today`(KST YYYY-MM-DD, 필수)를 추가하고, 보정 여부 판단 기준을 **작성일 → 오늘**로 전부 바꿨다. 작성일은 PR-158 예외 하나(`targetRdd === documentDate`일 때 보정하지 않음)에만 "같은 값인지" 비교로 쓰이고, 값 자체는 절대 읽거나 바꾸지 않는다.
- `vision.service.ts`에 `todayKstIso(now = new Date())` 헬퍼 추가(`new Date(now.getTime() + 9*3600*1000).toISOString().slice(0,10)`) — `rolloverTargetRddYear`와 `isSuspiciousTargetRdd` 둘 다에 같은 KST "오늘" 값을 넘긴다. `documentDate` 필드 자체는 어떤 경우에도 수정하지 않는다.
- 프론트 파란 안내 문구를 "납기가 오늘(한국시간)보다 이른 날짜로 인식되어 연도를 다음 해로 자동 보정했습니다(원래 인식값: {targetRddOriginal}) — 확인해주세요"로 변경(기존 "작성일 이후 날짜로..." 문구 대체). `data-testid`는 그대로, 납기를 직접 고치면 안내가 사라지는 동작도 그대로.

### 보정 규칙 표(갱신 — 오늘 기준)

| 입력 조건 | 결과 |
|---|---|
| `targetRdd`가 없거나 형식이 틀리거나 달력에 없는 날짜 | 변경 없음 |
| `today`가 없거나 형식이 틀림 | 변경 없음 |
| `targetRdd === documentDate` | **절대 보정하지 않음**(PR-158 예외, 작성일은 이 비교에만 쓰임) |
| `targetRdd >= today`(오늘 당일 포함, 이미 미래) | 변경 없음 |
| `targetRdd < today`이고 연도 +1한 날짜가 달력에 존재하며 `today`보다 뒤 | **연도 +1로 보정** |
| 연도 +1한 날짜가 달력에 없음(윤년 2/29 → 다음 해 평년) | 변경 없음 |
| 연도 +1해도 여전히 `today` 이하(2년 이상 지난 날짜 등) | 변경 없음(2년 이상 보정 금지) |

### 테스트 결과
| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **63 suites / 815 tests** 통과 — `target-rdd-year-rollover.util.spec.ts`를 오늘(2026-10-14 고정) 기준 14건으로 전면 재작성(실사례, 미래 납기, 당일 경계, PR-158 예외, documentDate null, 형식 오류, 존재하지 않는 날짜, 2년 이상 경계, 보정 결과가 오늘과 정확히 같아지는 경계), `vision.service.spec.ts`에 KST 자정 경계 3건 + 실사례 재작성 2건 추가(총 18건) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **65 suites / 507 tests** 통과(회귀 없음) |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **51 files / 329 tests** 통과(회귀 없음 — 안내 문구를 검사하는 프론트 테스트는 원래 없었음, "프론트 렌더 테스트에 대해" 절 참고) |

### 기존 PR-190 테스트 중 의미가 사라진 것
"납기 == 작성일" 외의 모든 기존 케이스는 비교 기준이 작성일에서 오늘로 바뀌었으므로 그대로 둘 수 없어 전부 오늘(2026-10-14) 고정 기준으로 다시 작성했다(완전히 새로 교체 — 옛 "작성일보다 미래" 테스트는 "오늘 기준 아직 미래" 테스트로, "작성일 대비 2년 전" 테스트는 "오늘 대비 2년 전" 테스트로 의미를 바꿔 유지).

### 알려진 한계(지시대로 그대로 적음)
- 오래된 작지를 뒤늦게 입력하면(납기가 실제로 과거) 다음 해로 보정된다. 파란 안내와 원래 인식값이 항상 함께 보이고, 납기를 직접 고치면 안내가 사라진다.
- 이전 버전은 "납기 < 작성일"이면 오늘과 무관하게 보정했다. 이번 변경으로 **납기가 아직 미래인데 작성일보다 이르면 보정하지 않는다**(빨간 의심 경고만) — 의도된 변화다.

### 화면에서 확인할 것
- 작성일 2026-01-01 / 납기 2/17(연도 없음)인 작지를 올리면: 납기가 2027-02-17로 채워지고, 작성일은 2026-01-01 그대로이며, 파란 안내("납기가 오늘(한국시간)보다 이른 날짜로 인식되어...")가 보인다.
- 납기 입력란을 직접 고치면 파란 안내가 사라진다(기존 동작 그대로).

### 브랜치 SHA(보강)
커밋 완료 후 `fix/target-rdd-year-rollover` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
