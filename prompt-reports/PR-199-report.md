# PR-199 완료 보고: 작지 AI 판독 정확도 측정 하네스 (DB 없음 · 읽기 전용 · 로컬 실행)

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/사용법을 보려는 사람) 및 하네스를 로컬에서 실행할 사용자.

- 브랜치: `chore/vision-eval-harness` (`origin/main` 최신 — PR-190/192/193/194/196/197/198/191 전부 반영된 상태에서 분기)
- **마이그레이션 없음. DB 접속·서버 기동·NestJS 앱 컨텍스트 생성 없음**(코드 수준 보장 — 아래 "DB 미접속 보장" 참고).
- **운영 DB(`.env`)에 전혀 접속하지 않았습니다.** 실제 업무 파일(작지 PDF·MATERIAL LIST 엑셀·실행 결과)은 저장소에 전혀 넣지 않았습니다.

## 1. 배경(이미 확인된 사실 — 지시서 그대로)

스타일 MB73SKM109Z(작지 2종 사본, 정답 = 완성 자재명세)에서 SCM 화면과 정답을 대조한 결과:

| 항목 | 작지 원본(사람이 읽음) | SCM 화면 | 유형 |
|---|---|---|---|
| 스타일번호 | MB73SKM109**Z**(끝 글자 Z, 손글씨로 분명) | Z 없이 인식 | 문자 누락 |
| 다데 요척 | 2.9 | 2.7 | 숫자 오독 |
| 오바사 | 220 | 230 | 숫자 오독 |
| 본봉사 | 본봉사 150 | 봉봉사 150 | 이름 1자 오독 |
| 스쿠이사 20 한 줄 | 한 줄 | 스쿠이사·스판사·스팽사 각 20(3행) | 중복 |
| 다데(면) 2.9 한 줄 | 한 줄 | 다데〈실크〉2.7 + 다이렉트선 2.7(2행) | 이름 오류 + 중복 |
| 안감 스트레치 1.61 한 줄 | 한 줄 | 노방다시·노방대시·노방테잎 각 1.61(3행) | 이름 오독 + 중복 |
| 걸고리 | 걸고리 | 겉고리 | 이름 1자 오독 |
| 작성일(MB74BLM107Z) | 26년 7월 1일 | 2026-01-01 | 숫자 오독(7→1) |
| 색상별·사이즈별 수량 | 표에 있음 | 저장 안 됨(총수량만) | 기능 없음 |

- 2.9·220 같은 숫자는 해상도를 50dpi로 줄여도 읽힌다 — 원본 화질 자체가 한계라는 증거는 못 찾았다.
- 작지 PDF는 MRC 구조(배경 JPEG 150ppi + 전경 마스크 300ppi) — 배경만 꺼내면 손글씨 일부가 사라진다. PDF를 그대로 보낼 때 Gemini가 두 층을 합쳐 읽는지는 확인되지 않았다.
- 같은 스타일의 작지가 2종 사본(구/신)으로 존재한다.

이 숫자(해상도·입력 방식·프롬프트 중 무엇이 효과 있는지)로 PR-200/201의 근거를 만드는 것이 이 PR의 목적이다.

## 2. 변경 요약

### A. 운영 코드 — export만 추가(동작 변경 없음)
`src/sales-orders/vision.service.ts`: `PROMPT`, `RESPONSE_SCHEMA`에 `export`만 추가했다. `git diff`로 `async commit`/`analyzeSalesOrder` 본문에 변경이 없음을 확인(하네스가 운영 프롬프트·스키마를 그대로 재사용하기 위한 export일 뿐).

### B. 하네스 (`scripts/vision-eval/`, 새 파일만 추가)

| 파일 | 내용 |
|---|---|
| `types.ts` | `GoldenStyle`/`GoldenBomItem`/`AiResultLike`/`FieldErrorType`/`StyleNoErrorType` 등 공용 타입. |
| `key-mask.util.ts` | API 키(앞4·뒤4만 노출)·파일 경로(파일명만) 마스킹. |
| `call-count.util.ts` | 호출 수 = 페이지×모드×실행×모델, 비용 추정(단가 모르면 null), `shouldCallApi(yes)` — `--yes` 게이트. |
| `manifest.util.ts` | 편집거리(Levenshtein 직접 구현), `--propose-manifest`의 제안 로직(거리 ≤2·유일 최소일 때만 제안, 동률/초과는 "수동 필요"), manifest.csv 읽기/쓰기. |
| `golden-extract.util.ts` | 정답 MATERIAL LIST 엑셀에서 B2(스타일번호)·Z8(작성일)·Z11(납기)·5~10행(색상별 사이즈 수량+합계)·15행부터 품목 블록(블록 높이=색상 수, K열 요척·L열 단위, "MAIN+SIZE" 이후는 라벨 구역)을 읽기 전용으로 추출(계산식은 캐시된 값만). **주의**: 레이아웃(열 위치)은 지시서 설명을 코드 주석에 그대로 명시한 가정이며, 실제 파일 컬럼이 다르면 상수(`COLOR_NAME_COLUMN` 등)를 사용자가 보정해야 한다. |
| `model-runner.ts` | `new VisionService(new ConfigService({ GEMINI_API_KEY, GEMINI_MODEL? }))`로 Nest 앱/모듈/TypeORM 없이 직접 생성. `GEMINI_FALLBACK_MODEL`이 이미 설정돼 있으면 경고 후 이번 실행에서만 무시(사용자 `.env` 파일은 건드리지 않음). 모델이 입력을 거절하면("지원 안 됨") 에러를 삼켜 계속 진행하게 돌려준다. |
| `pdf-tools.ts` | poppler(`pdfseparate`/`pdftoppm`/`pdftocairo`/`pdfinfo`) 래퍼. 모드 B(페이지 분리)·C(300dpi 그레이 PNG)·E(영역 크롭, `pdftocairo -x/-y/-W/-H` 픽셀 크롭만 사용 — **새 런타임 의존성 없음**, sharp 등 추가 안 함). 도구가 없으면 그 모드만 건너뛰고 이유를 보고한다. |
| `scoring/style-field.ts` | 스타일번호 채점: `EXACT`/`SUFFIX_MISSING`(끝 영문자 누락)/`SUFFIX_DIGIT`(끝 글자를 숫자로 오독, 보완)/`OTHER_MISMATCH`. `aggregateConfusionPairs`로 끝 글자 혼동표(Z→3 등) 집계. |
| `scoring/date-field.ts` | 작성일/납기 — ISO·한국어("26년 7월 1일")·슬래시("1/20") 표기를 읽어 월/일·연도를 따로 비교(연도를 모르면 `null`로 — 틀렸다고 단정하지 않음). |
| `scoring/bom-match.ts` | 이름 정규화(공백·괄호·꺾쇠 제거) + 표준 이름 사전(14개 핵심어, 편집거리 ≤2까지 느슨하게 묶어 겉고리↔걸고리 같은 1글자 오독도 같은 그룹으로 짝지음) → 같은 그룹끼리 요척이 가장 가까운 것으로 매칭 → `OK`/`VALUE_DIFF`(숫자 오독 자리 기록)/`NAME_DIFF`/`EXTRA_DUPLICATE`/`EXTRA_OTHER`/`MISSING`. 라벨 구역은 `checkLabelZonePresence`로 존재 여부만 따로 센다. |
| `scoring/supplier-item.ts` | "공급사)자재명" 파싱 + `SUPPLIER_MERGED`(`)` 소실)/`SUPPLIER_NAME_DIFF`/`ITEM_CODE_DIGIT_DIFF`(자재 코드 숫자 오독, 자리별 기록). |
| `scoring/instability.ts` | 반복(`--runs`) 간 같은 칸이 다르게 읽히는 비율 — 불안정 필드 식별. |
| `signals.ts` | PR-200이 서버에 넣을 경고 5종을 하네스 안에서 순수 함수로 먼저 구현(①끝 글자 숫자 형식 ②같은 값 중복 행 ③표준 사전에 없는 이름 ④요척×수량≠출고량+후보 역산 ⑤작성일 미래/18개월 초과 과거) + `evaluateSignal`(적중률·오탐률·후보 적중률·조용한 오류 집계). **`src/`에는 넣지 않음** — PR-200이 이 파일의 로직을 승격해 쓴다. |
| `cli.ts` | 인자 파싱(`--pdf-dir`/`--xlsx`/`--manifest`/`--propose-manifest`/`--modes`/`--runs`/`--max-pages`/`--yes`/`--pilot`/`--models`), 모드 가용성 확인(B/C/E는 poppler 있는지 확인 후 진행, **D는 현재 SDK가 `mediaResolution`을 지원하지 않아 항상 건너뜀** — 지시서에 명시된 전제), 호출 수·비용 산출 후 `--yes` 없으면 종료, `vision-eval-out/<시각>/`에 `summary.md`·`details.jsonl` 작성. |
| `jest.config.js`/`tsconfig.json` | 하네스 전용 — 저장소 루트 `jest.config.js`(`rootDir: 'src'`)와 분리돼 있어 `npm test`/`npm run build`에 전혀 영향을 주지 않는다(= 기존 테스트 회귀가 아예 발생할 수 없는 구조). |
| `no-db-import.spec.ts` | "하네스가 DB에 접속하는 코드 경로가 없음"을 모듈 import 그래프로 확인 — `scripts/vision-eval/` 전체 파일의 import 줄을 정적으로 스캔해 `typeorm`/`@nestjs/typeorm`/`DataSource`/`TypeOrmModule`/`InjectRepository`/`app.module`/`data-source`가 하나도 없음을 검증. |

### C. `package.json`/`.gitignore`
- `package.json`: `vision:eval`(`ts-node scripts/vision-eval/cli.ts`), `vision:eval:test`(하네스 전용 jest), `vision:eval:typecheck` 3개 스크립트만 추가. **새 런타임 의존성 없음**(엑셀은 기존 `xlsx`, 실행은 기존 `ts-node` 재사용).
- `.gitignore`: `vision-eval-out/` 추가.

## 3. 테스트 결과

| 항목 | 결과 |
|---|---|
| 하네스 `npm run vision:eval:typecheck` | 통과 |
| 하네스 `npm run vision:eval:test`(전용 jest) | **11 suites / 76 tests** 통과 — 골든 추출기 4건, 채점기(스타일/날짜/BOM매칭/공급사/불안정도) 39건, 신호 14건, manifest 제안기 7건, 호출수/비용/`--yes`게이트 6건, 키마스킹 4건, DB 미접속 보장 2건. |
| 백엔드 `tsc --noEmit` / `npm run build` | 통과(하네스는 루트 `tsconfig.json`의 `include`에 없어 영향 없음) |
| 백엔드 `jest` 전체 | **69 suites / 917 tests** 통과 — PR-198 이후 기준선과 정확히 동일(export만 추가했으므로 신규/변경 테스트 없음, 회귀 없음). |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **69 suites / 555 tests** 통과 — 기준선과 정확히 동일. |
| `npm run lint` | 실행 불가 — 저장소 전체에 ESLint 설정 파일이 없음(PR-192/193에서도 확인된 기존 상태, 이 PR과 무관). |

### "DB에 접속하는 코드 경로 없음" 확인 방식
`no-db-import.spec.ts`가 `scripts/vision-eval/` 아래 모든 `.ts` 파일의 import 줄을 정적으로 읽어 `typeorm`/`@nestjs/typeorm`/`DataSource`/`TypeOrmModule`/`InjectRepository`/`app.module`/`data-source`를 import하는 파일이 없는지 확인한다. `model-runner.ts`는 `vision.service.ts`만 참조하고 `Controller`/`@Module(`을 포함하지 않는지도 함께 확인한다(Nest 앱 전체를 띄우지 않고 `VisionService` 하나만 직접 생성).

## 4. 사용법

```bash
# 0) 환경변수 (셸에서만 — 어떤 파일에도 쓰지 않음)
export GEMINI_API_KEY=...

# 1) 제안 파일 만들기(읽기 전용 호출 1회/페이지, --yes 전까진 호출 수만 보여줌)
npm run vision:eval -- --propose-manifest --pdf-dir "C:\작지" --xlsx "C:\정답\MATERIAL_LIST.xlsx" --yes
# → vision-eval-out/<시각>/manifest-proposal.csv 생성 — 사람이 확인·수정 후 manifest.csv로 저장

# 2) 모드 A만, 모델 1개, runs=1로 먼저 호출 수·비용만 확인(--yes 없이)
npm run vision:eval -- --pdf-dir "C:\작지" --xlsx "C:\정답\MATERIAL_LIST.xlsx" --manifest manifest.csv --modes A --runs 1

# 3) 문제없으면 파일럿 실행
npm run vision:eval -- --pilot --pdf-dir "C:\작지" --xlsx "C:\정답\MATERIAL_LIST.xlsx" --manifest manifest.csv --modes A,C,E --models gemini-3.6-flash,gemini-3.8-flash --runs 3 --yes

# 4) summary.md를 확인해(경로·실제 파일명이 드러나지 않게 마스킹한 요약으로) Claude에게 전달
```

- `--yes` 없이는 실제 API를 호출하지 않는다(호출 수·예상 비용만 콘솔에 출력, `shouldCallApi()`로 테스트됨).
- `GEMINI_API_KEY`는 로그·리포트 어디에도 그대로 출력하지 않는다(`maskSecret` — 앞 4자·뒤 4자만).
- 모드 D(`mediaResolution: HIGH`)는 현재 SDK(`@google/generative-ai@^0.24`)가 지원하지 않아 항상 건너뛰고 그 사실을 콘솔/`summary.md`에 남긴다.
- 파일럿 세트(9페이지, 신 사본 4+구 사본 5)는 지시서 6번 항목대로 사용자가 로컬 파일로 manifest를 직접 채워 넘긴다(파일명은 저장소에 없음).

## 5. 화면/실행 확인할 것
- (화면 변경 없음 — 이 PR은 로컬 CLI 도구다.)
- `GEMINI_API_KEY` 없이 `npm run vision:eval -- --manifest ... (--yes 없이)`를 실행하면 호출 수만 출력하고 끝나는지(실제로 과금되지 않는지)는 사용자가 로컬에서 직접 확인해야 한다(이 저장소에는 실제 키가 없어 하네스 자체 테스트로는 확인 불가 — `shouldCallApi` 단위 테스트로 그 게이트 로직만 보증한다).
- 파일럿 실행 후 `summary.md`를 열어 모드별·오류유형별 표, 끝 글자 혼동표가 채워지는지.

## 6. 하지 않은 것(명시적 지시 준수)
- 프롬프트·스키마·모델·입력 방식의 운영 코드 변경 없음(PR-200/201 범위).
- 운영 DB 접속 없음, 서버/NestJS 앱 기동 없음.
- 실제 작지 PDF·MATERIAL LIST 엑셀·실행 결과(`vision-eval-out/`) 커밋 없음.
- 새 SDK 교체 없음(모드 D는 건너뜀으로만 처리).
- 새 런타임 의존성 없음(poppler는 사용자 PC의 외부 도구이며 npm 의존성이 아니다 — 없으면 해당 모드만 건너뜀).

## 7. 브랜치 SHA
커밋 완료 후 `chore/vision-eval-harness` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
