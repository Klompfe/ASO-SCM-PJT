# PR-192 완료 보고: 작지 AI 분석 "결과 없이 멈춤" 수정 (Gemini 503 과부하 대응 + 진단)

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과를 확인하려는 사람).

- 브랜치: `fix/ai-analysis-timeout-diagnostics` (`origin/main` `00138e0`에서 분기)
- **마이그레이션 없음.**
- **운영 DB에 전혀 접속하지 않았습니다.** 서버·마이그레이션·스크립트 어느 것도 `.env`(운영) 설정으로 실행하지 않았음 — 검증은 백엔드 단위/e2e + 프론트 단위/빌드만으로 수행.
- 병합하지 않음(`pause-after`). 두 차례 커밋: 최초 구현(`ff21fee`) + 시간 예산 버그 보완(아래 "보완 커밋" 절).

## 1. 배경과 원인 (Render 로그 실측, 2026-10-13 16:51~17:14 KST)

수주등록(작지 업로드) AI 분석이 한참 돌다가 결과 없이 멈추는 문제. 로그 확인 결과 `[503 Service Unavailable] This model is currently experiencing high demand`(gemini-3.6-flash) — Google 쪽 일시 과부하이며, 당시 재시도(2초·5초, 총 3회)가 너무 짧아 모두 실패했다. 2번째 재시도는 응답까지 약 49초가 걸렸고, 20분 뒤 재시도도 같은 503으로 전부 실패해 일시 스파이크가 아니라 길게 이어지는 용량 부족으로 판단했다.

구조적 문제 3가지: ① `generateContent`에 요청 시간제한이 없어 몇 분간 응답이 없을 수 있음 ② `finishReason !== 'STOP'`이어도 곧바로 `JSON.parse`해 잘린 응답이 일반 500으로만 보임(원인·소요시간·파일 크기가 로그에 없음) ③ 프론트 `uploadSalesOrderImage`에 axios timeout이 없어 무한 대기.

## 2. 변경 요약

| 영역 | 내용 |
|---|---|
| 진단 로그 | 분석 시작(파일명/mimetype/크기KB) + 종료(경과ms/finishReason/토큰/결과건수/모델명) 로그 추가. 작지 내용·base64는 로그에 절대 포함 안 함(유닛 테스트로 확인). |
| 재시도 강화 | 대기 간격 `[5000, 15000, 30000]`ms(최대 4회 시도)로 확대. |
| 타임아웃 분리 | Gemini 호출이 시간 내 응답하지 않으면(abort) `GatewayTimeoutException`(504) — "AI 분석이 너무 오래 걸려 중단했습니다..." |
| 응답 잘림 분리 | `finishReason !== 'STOP'`이고 JSON 파싱 실패 시 `UnprocessableEntityException`(422) — "분석 결과가 너무 길어..." (과금 로그는 기존처럼 남기지 않음) |
| 503/429 소진 | `ServiceUnavailableException`(503) — "AI 서버가 일시적으로 혼잡합니다..." |
| 모델 폴백 | `GEMINI_MODEL`(기본 `gemini-3.6-flash`)/`GEMINI_FALLBACK_MODEL`(미설정 시 폴백 없음) 환경변수 도입. 기본 모델 재시도 소진 시 폴백 모델로 1회 더 시도, 성공하면 `modelUsed`/`fallbackUsed` 반환. |
| 프론트 | `uploadSalesOrderImage` axios timeout 270초. 분석 실패 시 토스트만이 아니라 닫기 전까지 유지되는 안내 영역(원인 분류/시도시각·경과초/다음 행동/다시 시도 버튼) 추가. 분석 중 경과초 표시. 폴백 모델 사용 시 파란 안내 배너. |

## 3. 보완 커밋 — 시간 예산이 실제로 지켜지지 않던 버그 수정

최초 구현 검토에서, `buildModel()`이 **시도마다** 고정 240초 타임아웃을 SDK에 주고 있어 "전체 240초를 기본 모델과 폴백 모델이 나눠 쓴다"는 설계가 실제로는 지켜지지 않는 문제를 발견했다. 503이 실측상 약 50초 만에 돌아오므로, 기본 모델이 재시도 3~4번을 쓰고 나면 이미 150~200초가 지나 있고, 그 뒤 폴백이 시작되면 또 240초까지 걸릴 수 있어 전체가 프런트의 270초 제한을 넘겨버릴 수 있었다(폴백이 설정돼도 기대처럼 살아나지 않을 위험).

### 고친 내용
- **시도별 타임아웃 = 그 순간 남은 예산**: `buildModel()`은 더 이상 고정 타임아웃을 SDK 모델 생성 시점에 주지 않고, `generateWithRetry`가 매 시도마다 `remainingMs = deadlineAt - Date.now()`를 계산해 `generateContent(parts, { timeout: remainingMs })`로 그대로 넘긴다. 남은 예산이 `MIN_ATTEMPT_TIMEOUT_MS`(10초) 미만이면 새 시도를 시작하지 않고 곧바로 재시도 소진으로 처리한다(시도 도중 타임아웃이 나버리면 재시도/폴백 판단 자체가 불가능해지는 것을 막기 위함).
- **폴백이 설정된 경우 기본 모델 단계는 전체 예산의 40%(`PRIMARY_STAGE_BUDGET_MS` = 96초)까지만**: `primaryDeadlineAt = startedAt + 96_000`(폴백 있음) 또는 `startedAt + TOTAL_BUDGET_MS`(폴백 없음, 기존과 동일하게 240초 전부). 폴백 단계는 `startedAt + TOTAL_BUDGET_MS`를 그대로 넘겨 남은 시간(약 144초)을 전부 쓴다.
- 전환 시 로그: `기본 모델 단계 마감(96초) — 폴백으로 전환 (경과 N ms)`.

### 추가 테스트(`vision.service.spec.ts`, 가짜 타이머)
- 기본 모델 응답이 느려(90초 가까이) 96초 단계 예산에 근접하면, 다음 시도를 시작하지 않고(남은 예산 < 10초) 곧바로 폴백으로 전환 → 폴백 성공 시 `fallbackUsed: true`.
- 폴백이 설정되어 있지 않으면 같은 "느린 응답" 상황에서도 96초가 아니라 전체 240초 예산을 그대로 써서 최대 시도(4회)까지 진행한다(기존 동작과 동일 — 회귀 없음).
- 각 `generateContent` 호출의 `timeout` 인자가 그 시점의 남은 예산과 정확히 같은지(폴백 설정 시 1차 호출 = 96,000ms, 미설정 시 = 240,000ms) 직접 검증.

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **62 suites / 805 tests** 통과 (최초 구현 7건 + 보완 커밋 3건 = `vision.service.spec.ts`에 PR-192 전용 테스트 10건) |
| 백엔드 e2e(`sales-orders-routes-flow`, 전체 1회 포함) | 통과(회귀 없음 — e2e는 Gemini를 실제로 호출하지 않음) |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **52 files / 337 tests** 통과 (업로드 타임아웃 설정 1건 + 실패 원인 분류 유틸 9건 포함) |
| `npm run lint` | 실행 불가 — 저장소 전체에 ESLint 설정 파일이 없음(이 PR과 무관한 기존 상태, 클린 체크아웃에서도 동일하게 재현 확인) |

## 로그 예시 (파일 내용 없음)

```
[VisionService] 작업지시서 분석 시작 — file=order.png, mimetype=image/png, size=842KB
[VisionService] [gemini-3.6-flash] Gemini 일시적 오류(1번째 재시도, 5000ms 대기, 경과 1203ms): [503 Service Unavailable] ...
[VisionService] 기본 모델 단계 마감(96초) — 폴백으로 전환 (경과 96000ms)
[VisionService] 폴백 모델로 처리: gemini-2.5-pro
[VisionService] 작업지시서 분석 완료 — 경과 101234ms, finishReason=STOP, promptTokens=3699, outputTokens=11765, 결과=6건, model=gemini-2.5-pro(fallback)
```

## 5. 하지 않은 것(명시적 지시 준수)

- 폴백 모델명을 코드에 하드코딩하지 않음(환경변수로만 — `GEMINI_FALLBACK_MODEL` 미설정 시 폴백 없음).
- 작지를 페이지 단위로 쪼개 병렬 호출하는 구조 변경 없음.
- 프롬프트, RESPONSE_SCHEMA, targetRdd/CMT 가드, 과금 로직 변경 없음.
- 운영 DB 접근, 마이그레이션 없음.

## 6. 브랜치 SHA

- 최초 구현: `ff21fee`
- 시간 예산 보완: 이 보고서 작성 직후 커밋 — 완료 메시지에서 SHA 확인. 병합하지 않음(`pause-after`).
