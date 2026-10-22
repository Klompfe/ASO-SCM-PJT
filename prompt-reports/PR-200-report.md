# PR-200 — 작지 AI 판독 안전장치: 프롬프트 규칙 · 후보 필드 · 서버 검증 · 원본 대조 화면

브랜치: `feat/vision-guardrails` · 선행 PR-197·PR-198·PR-192 모두 `origin/main`에 있음 확인(큐 정책 `pause-after` — **브랜치만 push, main 병합 안 함**).

## ① 변경 파일 목록

**백엔드(`src/`)**
| 파일 | 내용 |
|---|---|
| `src/sales-orders/utils/vision-guardrails.util.ts` (신규) | 순수 함수(DB 없음) — 스타일번호 형식/끝 글자/혼동 문자 치환, 공급사 분리, 한 글자 차이 후보, 중복 묶음, 작성일 의심, 요척 불일치 |
| `src/sales-orders/utils/vision-guardrails.util.spec.ts` (신규) | 위 38개 단위 테스트 |
| `src/sales-orders/vision.service.ts` | PROMPT에 판독 규칙 추가(기존 문장 삭제 없음), RESPONSE_SCHEMA에 `itemNameCandidates`/`consumptionCandidates`/`uncertain`/`uncertainReason` 추가(required 아님), `applyGuardrails()` 후처리 메서드 추가, `analyzeSalesOrder`가 `VisionGuardrailContext`(선택 인자, 기본값 `{}`)를 받음 |
| `src/sales-orders/vision.service.spec.ts` | 기존 테스트 1건 보정(새 경고 필드 반영) + PR-200 통합 테스트 6건 추가 |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `AiOverviewDto`에 `rawStyleNo`/`warnings`, `AiBomItemDto`에 `itemNameCandidates`/`consumptionCandidates`/`uncertain`/`uncertainReason`/`supplierName`/`rawItemName`/`warnings` 추가(전부 선택 필드) |
| `src/sales-orders/sales-orders.service.ts` | `buildGuardrailContext()`(Item/Supplier/MasterStyle 이름 목록 조회, 실패 시 빈 컨텍스트로 조용히 계속) 추가, `analyzeImage`가 이를 `VisionService`에 전달 |
| `src/sales-orders/sales-orders.service.spec.ts` | `buildGuardrailContext` 테스트 2건 + "후보/경고 필드가 commitAnalysis 저장 경로로 안 넘어감" 테스트 1건 추가 |

**프런트(`frontend-app/`)**
| 파일 | 내용 |
|---|---|
| `src/utils/visionGuardrails.ts` (신규) | 경고 표시용 순수 함수 — 저장 차단 판정, 상단 요약, 중복 묶음 복원, "이 행만 남기기" |
| `src/utils/visionGuardrails.test.ts` (신규) | 위 10개 단위 테스트 |
| `src/components/OriginalPagePreview.tsx` (신규) | pdfjs-dist로 원본 PDF 쪽(또는 이미지)을 렌더링·확대축소·쪽 이동 |
| `src/components/SalesOrderUploadModal.tsx` | 스타일번호 끝 글자/형식 칩, 저장 차단, 공급사 칸, 요척/자재명 후보 칩, 중복 묶음 "이 행만 남기기", 원본 보기 토글, 경고 요약 |
| `src/components/SalesOrderUploadModal.test.tsx` (신규) | 렌더링 스모크 테스트 2건(이 코드베이스 관례 — 아래 ⑦ 참고) |
| `src/api/salesOrders.service.ts` | `AiOverview`/`AiBomItem`에 서버 DTO와 동일한 선택 필드 추가, `AiWarning` 타입 신규 |
| `package.json`/`package-lock.json` | **새 의존성** `pdfjs-dist@4.6.82`(exact 고정) + `overrides.tar: 7.5.22`(아래 이유) |

## 새 의존성 이유

`pdfjs-dist`는 원본 페이지를 브라우저에서 렌더링하는 데 필요하다(D-1). 설치 중 `npm audit`에서 critical 1건(구버전 `tar`, 하드링크 경로 주입류)이 새로 나왔는데, 원인은 `pdfjs-dist`의 **optionalDependency인 `canvas`**(Node.js 서버측 렌더링용 — 이 프로젝트는 브라우저에서만 렌더링하므로 안 씀)의 전이 의존성(`@mapbox/node-pre-gyp`)이었다. 처음엔 `.npmrc`에 `omit=optional`을 넣어 아예 안 받게 했는데, 이게 Vite 번들러(`rolldown`)가 플랫폼별 네이티브 바이너리도 `optionalDependencies`로 배포한다는 걸 몰라서 **빌드 자체가 깨지는 더 큰 문제**를 만들었다(되돌림). 최종적으로는 `package.json`에 `"overrides": { "tar": "7.5.22" }`만 추가해 `canvas`/`node-pre-gyp`는 그대로 두되(어차피 안 씀) 취약한 `tar`만 패치 버전으로 교체했다 — `npm audit` 결과가 이 작업 시작 전(high 6·critical 0)과 정확히 같은 수치로 돌아왔다(재현 확인: `rm -rf node_modules && npm install` 후 재확인).

## ② 테스트 숫자

| 항목 | 이번 작업 전(PR-199c 반영 직후) | 이번 PR(최종 확인) |
|---|---|---|
| 백엔드 `jest` 전체 | 69 suites / 917 tests | **70 suites / 964 tests**(신규 1 suite: vision-guardrails.util.spec.ts) |
| 백엔드 e2e | 69 suites / 555 tests | **69 suites / 555 tests**(변경 없음 — 응답 shape는 선택 필드만 추가) |
| 프런트 `vitest run` | 61 files / 451 tests | **62 files / 453 tests**(visionGuardrails 10 + SalesOrderUploadModal 스모크 2) |
| 백엔드/프런트 `tsc -b`, `build` | 통과 | 통과(pdfjs-dist worker 청크 포함, 500KB 경고는 사전 존재하던 xlsx 청크와 같은 성격) |

신규/보강된 백엔드 테스트: `vision-guardrails.util.spec.ts` 38건(신규 파일) + `vision.service.spec.ts` 통합 6건 + `sales-orders.service.spec.ts` 3건 = **47건** 추가(917→964).

## ③ 라벨 구역·구분·공급업체 칸 — 기존 구조 확인(보고 요구사항)

- `BomItem.category`는 `@Column() category: string`(자유 문자열)이고 코드 주석에 이미 "겉감, 안감 등" 예시가 있다 — **새 컬럼·새 열거값·마이그레이션 없이** `category: '겉감'`을 그대로 쓸 수 있다(프롬프트·applyGuardrails 모두 이 값 그대로 사용).
- 공급업체가 저장되는 기존 칸은 `BomItem.supplier`(`@Column() supplier: string | null`)였다 — **이미 존재**하므로 `supplierName`은 "공급사)자재명" 분리로 얻은 **후보**일 뿐이고(저장 안 됨), 사람이 검토 화면에서 "적용"을 눌러야 기존 `supplier` 칸으로 복사된다(실/테이프 종류 `materialSubTypeCandidate` → `threadType`/`tapeType`과 같은 패턴).

## ④ 서버 검증 5종 동작 요약

1. `STYLE_NO_FORMAT` — `^(MBS?|LB|VB)[0-9A-Z]{2}[A-Z]{3}\d{3}[A-Z](-\d+)?$`. 혼동 문자(0↔O, 1↔I, 5↔S, 8↔B, 2↔Z, 4↔A, 6↔G 등) 위치별 치환으로 최대 3개 후보, 전부 정규식 통과 확인. 하이픈 섞임·길이 깨짐은 후보 없이 경고만.
2. `STYLE_NO_LAST_DIGIT` — 끝이 숫자면(사용자 확인: 끝 글자는 숫자가 될 수 없음) 심각도 높음, 후보는 `Z A R K D P C F` 빈도순(끝 숫자가 4면 A 먼저). **저장을 막는 유일한 규칙**.
3. `STYLE_NO_CASE_NORMALIZED` — 대문자로 바꿨을 때만 형식을 통과하는 경우만 "정리"(값 변경 허용, 그 외 형식 문제는 안 고침). 원문은 `rawStyleNo`.
4. `STYLE_NO_RARE_SUFFIX` — 형식은 맞지만 끝 글자가 `Z A R K D P C F` 밖이면 참고 경고만(막지 않음).
5. `SUPPLIER_NAME_SPLIT` — `공급사)자재명` 형식을 감지해 `supplierName`/`itemName`으로 나누고 원문을 `rawItemName`에 남긴다(값을 바꾸는 게 아니라 형식 해석).
6. `UNKNOWN_NAME`/`UNKNOWN_SUPPLIER` — 마스터 목록(공백·대소문자 무시)에 없으면 경고 + 같은 길이·한 글자 차이 후보(자동 교체 없음).
7. `POSSIBLE_DUPLICATE` — 같은 구분·규격·요척(1 제외, 0 초과)인 행 2개 이상을 묶어 모든 행에 같은 경고(행 번호 포함).
8. `DOCUMENT_DATE_SUSPICIOUS` — 미래이거나 18개월 넘게 과거.
9. `YOCHEOK_QTY_MISMATCH` — 요척×수량이 출고량과 안 맞을 때. 올림/반올림/±1 이내는 일치로 봄(배경 사례 `1.21×80=96.8↔97` 재현 테스트 통과). 문구는 "수량이 틀렸다"고 단정하지 않고, 역산한 요척이 올림·반올림으로 맞으면 후보로 제시.

경고는 **저장을 막지 않는다**(`STYLE_NO_LAST_DIGIT` 예외). 값은 위 ③·④-3·④-5 세 경우(대소문자 정리, 공급사 분리)만 바뀐다.

## ⑤ 검토 화면(D) 반영 — 구현 범위와 단순화한 부분

**구현함**
- ⓪ 끝 글자 숫자 스타일번호 → 빨강 강조 + 칩(미리 선택 안 됨) + **저장 버튼 비활성화**(개별 저장·일괄저장 둘 다)
- ⓪′ `공급사)자재명` 분리 안내 + "적용" 버튼(클릭해야 기존 공급사 칸으로 복사), 공급사 칸 자체는 항상 보임(기존 `supplier` 입력)
- ⓪″ 요척 불일치 문구(수량 탓 단정 안 함) + 역산 요척 후보 버튼
- ① 원본 쪽 미리보기(pdfjs-dist, 확대/축소, 쪽 이동 ◀▶) — "원본 보기" 토글 버튼으로 켬/끔
- ② `POSSIBLE_DUPLICATE` 묶음 표시 + "이 행만 남기기"(기존 PR-197 제외 체크 Set으로 바로 전환 — 저장은 여전히 사람이 눌러야 함)
- ③ 끝 글자 없는/형식 안 맞는 스타일번호 경고(빨강/노랑 구분)
- ④ `uncertain` 숫자 후보 칩(소요량 입력 아래)
- 경고가 있는 행은 노란 배경, 카드 상단에 "확인 필요 N건(경고 종류별)" 요약

**단순화한 부분(정직하게 표시)**
- **원본 패널 배치**: "표 옆에"를 문자 그대로 구현하면 기존 300줄 넘는 JSX 블록을 전부 좌/우 2컬럼으로 감싸야 해서 괄호 불일치 위험이 커 보류했다 — 지금은 토글을 누르면 카드 **위쪽**에 전체 너비로 뜬다(좁은 화면에서는 토글 자체가 "탭 전환" 역할을 한다). 기능(대조)은 되지만 "옆에 나란히"는 아니다.
- **쪽 번호 대응**: `AiSalesOrderResultDto`에 원래 페이지 번호 필드가 없다 — 모드 A 관례(`results[index]`는 업로드 PDF의 `index+1`쪽, PR-199b에서 같은 전제 사용)를 그대로 써서 `page={index+1}`로 넘긴다. 실제로 안 맞으면 컴포넌트 안의 ◀▶로 사람이 옆 쪽을 찾는다(자동 보정 없음).
- **"확인창(저장 시)"**: `STYLE_NO_FORMAT`(형식 안 맞지만 끝 글자는 숫자가 아닌 경우)은 지시서대로 **막지 않고** 저장 가능하되, 이번 구현에서는 별도 `window.confirm` 확인창 대신 저장 버튼에 경고 메시지가 달린 `title` 툴팁만 있다(차단은 `STYLE_NO_LAST_DIGIT`만, 그건 실제로 버튼을 비활성화한다). 확인창까지 필요하면 추가 작업으로 제안.

## ⑥ 측정 (PR-199 하네스)

"전" 기준선은 `vision-eval-out/2026-10-20T14-47-47-026Z`(PDF 4개 × 3회, 모드 A — PILOT-5에서 분석)다. 이 PR은 **API 호출을 하지 않았다**(지시서의 "push 전 검증은 단위 테스트까지"). "후" 측정은 이 PR이 main에 반영·배포된 뒤 사용자가 로컬에서 같은 명령으로 돌려야 한다:

```
npm run vision:eval -- --pdf-dir "C:\vision-eval\pdf" --xlsx "C:\vision-eval\xlsx\vanek.xlsx" --xlsx "C:\vision-eval\xlsx\misens.xlsx" --manifest "C:\vision-eval\manifest.csv" --modes A --runs 3 --yes
```

비교할 지표(합격 기준, 측정 도구가 이미 PR-199c까지 보정돼 그대로 집계됨):
- 스타일번호 끝 글자 누락(`SUFFIX_MISSING`) 0건
- 끝 글자가 숫자인 채로 저장 가능한 경우 0건(이번 PR의 `STYLE_NO_LAST_DIGIT` 차단으로 애초에 안 됨 — 화면에서 직접 확인 필요)
- 공급사)자재명 분리 오류 0건(화면에서 확인 — 측정 도구는 이 항목을 자동 집계하지 않음, 수작업 확인 필요)
- `EXTRA_DUPLICATE` 전보다 감소
- 조용한 오류(경고 없이 틀린 값) 전보다 비증가

**프롬프트만으로는 숫자 오독이 사라지지 않을 수 있다** — PILOT-5에서 확인된 "같은 PDF를 3회 읽어도 숫자·이름 오독이 회차마다 달라짐"(7/8건) 패턴은 프롬프트 지시로 완전히 막히지 않으므로, D(원본 대조 화면)가 이 PR의 핵심 안전장치라는 지시서의 전제를 그대로 따랐다.

## ⑦ 화면에서 확인할 것

⓪ 끝 글자 숫자 스타일번호 → 칩(미선택)·저장 버튼 비활성, 칩 클릭 시 채워지고 저장 가능
⓪′ `공급사)자재명` 분리 안내 + 공급사 칸 + "적용" 클릭 시에만 반영
⓪″ 요척 불일치 문구("수량이 다릅니다" 단정 없음) + 후보 버튼
① 작지 분석 화면에서 "원본 보기"를 누르면 PDF 쪽이 옆(현재는 위)에 뜨는지, 확대/축소·◀▶ 동작
② 한 줄이 여러 이름으로 나온 경우 "중복 의심" 묶음 + "이 행만 남기기" → 제외 체크로 바뀌는지
③ 끝 글자 없는/형식 안 맞는 스타일번호 경고
④ 불확실 숫자 후보 칩
기존 실/테이프 선택(PR-175)·PR-197 제외/수정 배지·PR-198 유사 스타일 경고는 전부 그대로 동작(코드 diff상 삭제/변경 없음, 새 블록만 추가).

**이 코드베이스 테스트 관례(HsCodeManager.test.tsx 참고)상 jsdom/testing-library가 없어 클릭·토글 같은 상호작용은 vitest로 못 재현한다** — 그래서 위 화면 확인 항목들은 실제 브라우저에서 사람이 확인해야 한다(단위 테스트는 그 아래 순수 로직만 검증).

## 브랜치·SHA

브랜치만 push, **main 병합 안 함**(큐 정책 `pause-after`). 커밋 SHA: `21bef54`.

---

## PR-200b 보완

PR-200 보고서의 단순화 3건 중 저장 확인창·패널 고정·쪽 번호 안내를 보완했다. **프런트만 변경**(백엔드/마이그레이션/`package.json`·락 변경 0 — `git diff origin/feat/vision-guardrails --stat`로 확인).

### 변경 파일 (4개, 전부 `frontend-app/`)
| 파일 | 내용 |
|---|---|
| `src/utils/visionGuardrails.ts` | `collectFormatConfirmItems`(형식 오류 확인창 대상), `pageMismatchNotice`, `clampPage` 추가 |
| `src/utils/visionGuardrails.test.ts` | 위 3개 함수 테스트 13건 추가 |
| `src/components/OriginalPagePreview.tsx` | sticky 고정, 높이 선택(작게/보통/크게, 좁은 화면 40vh 캡), 쪽 번호 불일치 안내, `clampPage` 재사용 |
| `src/components/SalesOrderUploadModal.tsx` | 개별/일괄 저장 직전 형식 오류 확인창, `OriginalPagePreview`에 `resultCount` 전달 |

### 테스트 숫자 (전/후)
| 항목 | PR-200 기준 | PR-200b 이후 |
|---|---|---|
| 프런트 `vitest run` | 62 files / 453 tests | **62 files / 466 tests**(+13) |
| 백엔드 `jest`/e2e | 변경 없음 | 변경 없음(파일 자체가 0건) |
| `tsc -b`, `npm run build` | 통과 | 통과 |
| `rm -rf node_modules && npm ci && npm run build`(클린 설치 재현, 7번) | — | **통과**. 경고는 `canvas`(pdfjs-dist의 Node용 optionalDependency, 브라우저 렌더링엔 안 씀) 전이 의존성의 **지원 종료(deprecated) 경고 6건**(`inflight`/`npmlog`/`rimraf`/`glob`/`are-we-there-yet`/`gauge`) — `npm audit` 기준은 PR-200 때와 동일(high 6·critical 0, `tar` override가 `npm ci`에도 그대로 적용됨). |

### 구현 내용

1. **형식 오류 저장 확인창** — `collectFormatConfirmItems`는 `STYLE_NO_FORMAT`이 있고 `STYLE_NO_LAST_DIGIT`은 없는 항목만 뽑는다. 개별 저장·일괄 저장 모두 저장 직전에 `window.confirm("스타일번호 형식이 맞지 않습니다 — 그대로 저장할까요? (…)")`를 띄우고, 취소하면 저장하지 않는다. `STYLE_NO_LAST_DIGIT`(저장 버튼 비활성)은 그대로 — 애초에 버튼을 못 누르므로 확인창 분기에 도달하지 않는다. 칩으로 고쳐 경고가 사라지면(현재 `overview.warnings`에 없음) 자연히 빈 목록이 된다.
2. **원본 패널 sticky** — 패널 바깥쪽 div에 `sticky top-0 z-10`을 추가했다. 이 패널이 들어가는 결과 카드(`<div className="border rounded-lg p-4 space-y-3 ...">`)는 `overflow`를 걸지 않은 일반 블록이고, 실제 스크롤 조상은 모달 본문의 `p-6 overflow-y-auto flex-1 min-h-0`뿐이라 **중간에 sticky를 막는 `overflow:hidden` 조상이 없다** — 구조상 sticky가 그대로 먹을 것으로 판단했다(실제 브라우저 확인 필요, 아래 참고). 높이는 작게(25vh)/보통(40vh, 기본)/크게(60vh) 버튼으로 고르고, 좁은 화면(1024px 미만, `window.matchMedia` 감지)에서는 고른 값과 40vh 중 작은 쪽을 쓴다(인라인 `style.maxHeight`로 적용 — Tailwind 동적 클래스는 빌드 시 문자열이 고정돼 있어야 해서 쓰지 않음).
3. **쪽 번호 불일치 안내** — `pageMismatchNotice(resultCount, pageCount)`는 PDF 로드 후 알게 된 총 쪽수가 AI 결과 건수와 다를 때만 문구를 돌려준다(같으면 `null`, 이미지 업로드처럼 `pageCount`를 모르면 `null`). `clampPage`로 요청한 쪽이 총 쪽수를 넘으면 마지막 쪽으로만 보정하고, 추측해서 다른 쪽을 고르는 로직은 없다.

### 남아 있는 단순화(정직하게 표시)
- **sticky 실제 동작 미확인**: 구조상 막는 조상이 없다고 코드로 판단했지만, 이 코드베이스엔 jsdom/testing-library가 없어(HsCodeManager.test.tsx 관례) 스크롤 동작 자체를 vitest로 재현할 수 없다 — 실제 브라우저 확인이 필요하다(아래 체크리스트 ②).
- **확인창은 `window.confirm`** — PR-198의 기존 "비슷한 스타일" 확인창과 같은 방식(네이티브 브라우저 확인창)이라 디자인은 안 맞지만 동작은 일관된다. 커스텀 모달로 바꾸는 건 범위 밖으로 남겨 둔다.
- **쪽 번호는 여전히 추정** — 불일치를 "알려주기"만 하고 고쳐주지는 않는다(지시서 요구사항 그대로).

### 화면에서 확인할 것
① 형식 오류 스타일번호(끝 글자 숫자 아님)로 저장을 누르면 확인창이 뜨고, 취소하면 저장되지 않는지 — 끝 글자 숫자인 경우는 그대로 저장 버튼이 비활성인지
② 자재명세 표를 스크롤해도 원본 패널이 화면 위쪽에 붙어 있는지, "작게/보통/크게" 버튼이 높이를 바꾸는지, 좁은 창(1024px 미만)에서 40vh를 넘지 않는지
③ AI 결과 건수와 PDF 실제 쪽수가 다를 때 패널에 "쪽 번호가 맞지 않을 수 있습니다" 안내가 뜨고, 같을 때는 안 뜨는지(이미지 업로드는 항상 안 뜸)

### 브랜치·SHA
브랜치만 push, main 병합 안 함. 커밋 SHA: `cb8eac0`.

---

## PR-200c 보완

PILOT-6 측정과 코드 대조에서 나온 미충족 항목 3건(공급사 분리 오류 36%, 중복 헛경보, 끝 글자 숫자 규칙의 접미 구멍)과 "형식 검사로 못 잡는 틀린 값"에 대한 스타일번호 원본 대조 확인을 보완했다.

### 변경 파일 (5개)
| 파일 | 내용 |
|---|---|
| `src/sales-orders/utils/vision-guardrails.util.ts` | `splitSupplierItemName`에 내부 코드 판별(`looksLikeInternalCode`) 추가해 분리 방지, `findDuplicateGroups`에 "코드형 토큰" 비교 추가(연결 성분으로 재분할), `STYLE_NO_LAST_DIGIT_REGEX`에 `(-\d+)?` 추가 |
| `src/sales-orders/utils/vision-guardrails.util.spec.ts` | 위 3개 보정에 대한 테스트 20건 추가 |
| `frontend-app/src/utils/visionGuardrails.ts` | `collectUnverifiedStyleItems`, `splitStyleNoForDisplay` 추가 |
| `frontend-app/src/utils/visionGuardrails.test.ts` | 위 2개 함수 테스트 7건 추가 |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 스타일번호 대조 체크박스(기본 해제, 개별/일괄 저장 차단), 직접 수정 시 자동 대조 처리, 1·7·9 강조 표시 |

### 테스트 숫자 (전/후)
| 항목 | PR-200b 기준 | PR-200c 이후 |
|---|---|---|
| 백엔드 `jest` 전체 | 70 suites / 964 tests | **70 suites / 977 tests**(+13) |
| 백엔드 e2e | 69 suites / 555 tests | **69 suites / 555 tests**(변경 없음) |
| 프런트 `vitest run` | 62 files / 466 tests | **62 files / 473 tests**(+7) |
| `tsc -b` / `npm run build`(백엔드·프런트) | 통과 | 통과 |

`git diff origin/feat/vision-guardrails --stat`로 확인: `src/migrations/` 0건, `package.json`/락 파일 0건, 변경 파일 전부 위 5개뿐.

### 1~3. 백엔드 보정 요약
1. **공급사 분리 방지**: `)` 앞부분이 ① 괄호가 안 닫힘/중첩 ② `MB`/`LB`/`VB`로 시작 ③ 숫자-하이픈-숫자 포함 ④ 숫자만 ⑤ 20자 초과 중 하나면 분리하지 않고 원문을 그대로 둔다(경고도 안 붙임).
2. **중복 묶음 헛경보 제거**: 같은 구분·규격·요척으로 묶인 행들을 "코드형 토큰"(숫자 포함 3자 이상 영숫자·하이픈 조각) 기준으로 연결 성분으로 재분할한다. 둘 다 코드형 토큰이 있는데 안 겹치면 분리, 한쪽이라도 없으면(한글 이름만 등) 기존 규칙 유지.
3. **끝 글자 숫자 접미 구멍**: `STYLE_NO_LAST_DIGIT_REGEX`에 `(-\d+)?`를 더해 `MB6YHMP1022-1`(접미 있고 본체가 숫자로 끝남)도 차단 대상으로 잡는다. `MB6YHMP102Z-1`(본체가 영문자로 끝남)은 여전히 안 걸린다.

### 4. 프런트 — 스타일번호 원본 대조 확인
- 결과 항목마다 체크박스("스타일번호를 원본 페이지와 대조했습니다", 기본 해제) — 해제 상태면 그 항목 개별 저장 버튼 비활성.
- 일괄 저장 시 미대조 항목을 토스트로 안내하고 그 항목만 빼고 나머지는 저장한다.
- 스타일번호 입력칸에 **직접 타이핑**하면 자동으로 대조 완료 처리된다(원본을 보고 입력한 것으로 간주). 후보 칩(유사 스타일, 형식 오류 치환, 끝 글자 숫자 치환) 클릭은 자동 처리하지 않는다 — 기존 `updateOverviewField`를 그대로 쓰고, 입력칸 전용 `handleStyleNoManualEdit`만 대조 상태를 바꾼다.
- 스타일번호 표시(카드 제목)에서 `1`·`7`·`9`를 빨강·굵게 강조(`splitStyleNoForDisplay`, 값 자체는 안 바꿈).
- **원본 패널 연결**: 기존 "원본 보기" 토글을 그대로 재사용했다 — 스타일번호 칸 옆에 별도 버튼을 새로 만들지 않고 카드 상단의 기존 토글이 이미 그 항목의 원본 패널을 연다(새 구조 안 만듦, 지시서의 "어려우면 만들지 말라" 조건에 해당하지 않아 추가 작업 없음).
- 이미지 업로드(PDF 아님)도 같은 체크박스·강조 로직이 동일하게 적용된다(둘 다 `overview.styleNo` 기준이라 파일 형식과 무관).

### 5. 오프라인 재생 검증 (`vision-eval-out/2026-10-21T14-31-54-319Z/details.jsonl`, API 호출 0건)

**(a) 공급사 분리**: 저장된 값 기준(전) **106건** → 새 규칙 재적용(후) **68건**. 분리가 취소된 원문(중복 제거, **16종**):
`MB72-014-0(PND) 2504` · `실크(지) 58"` · `MB72-014-0 (리원) B639` · `MB72-001-0 올리브) 퀄리아 텐셀` · `MB72-008-0 이원) 몬스터` · `MB72-009-0 이원) 메릴랜드` · `MB72-006-0 티플로) 10257 F. MELANGE GREY` · `MB72-006-0 티플로) 10257 BLACK` · `MB72-014-0 (PNU) 2504` · `MB72-001-0 올리브) 캘리아 텐셀` · `MB72-008-0 이원) 몬스터 BEITE` · `아사 (모) (58)` · `MB72-006-0 티플로) 10257 MELANGE GREY` · `MB74-030-0 MLC) 몰디` · `MB12-017-0 DDM) 2504` · `MB72-017-0 DDM) 2504`
남은 분리 중 숫자·괄호·하이픈이 포함된 공급사명: **`울2`** 1건뿐(괄호·하이픈·내부코드 패턴은 아니고 숫자 한 글자가 섞인 정상 범위 이름으로 보임).

**(b) 중복 묶음**: 저장된 경고 기준(페이지×회차별 발생 횟수, 전) **66건** → 새 규칙 재적용(후) **49건**. 사라진 묶음의 이름 쌍(전부, 반복 포함):
`25NAW-5036`↔`LE-010`(3회) · `KL-R130`↔`9748`(4회, 3항목 변형 2회 포함) · `KL-R620`↔`TF-10257`(3회) · `KL-R144`↔`KL-R926`(3회) · `2019`↔`10256`(2회) · `DDM-2019`↔`TF-10256`(1회).
이름이 같은 묶음(색상 변형 등, 전 37건) 중 **사라진 것은 0건** — 전부 그대로 유지됨.
그대로 남은 묶음 중 이름이 서로 다른 것(9가지): `10257 F. MELANGE GREY`↔`10257 BLACK`(공통 코드 `10257` 보유 — 같은 원단의 색상 변형으로 보임) · `10257 MELANGE GREY`↔`10257 BLACK`(동일 이유) · `단추`↔`마블단추` · `KL-R144`↔`BK` · `에폭 단추`↔`모에단추(스쿠이선결)` · `KL-R144`↔`BK`↔`KL-R926`(BK가 코드형 토큰이 없어 다리 역할, 1·2번과 같은 성분) · `아일렛`↔`배배링` · `에폭 단추`↔`투명단추 (투명단추)` · `Poly단추`↔`와셔단추`. 전부 "한쪽 이상 코드형 토큰이 없어 기존 규칙을 그대로 쓴" 케이스다(설계상 알려진 범위, 추가 판정 안 함).

### 6. 빌드·검증
위 "테스트 숫자" 표 그대로 전부 통과. `git diff --stat` 확인 결과 백엔드 `src/migrations/`·`package.json`·락 파일 변경 0건.

### 단순화하거나 못 한 것
- 원본 패널은 PR-200b에서 이미 "표 위에 토글로 뜸" 구조였고, 이번에도 그 구조를 그대로 재사용했다 — "스타일번호 칸 바로 옆"에 별도 열기 버튼을 추가하진 않았다(카드 상단 토글 하나로 전체 패널을 열고 닫음).
- `울2`처럼 숫자가 섞였지만 정상으로 보이는 공급사명이 하나 남아 있다 — 더 조이면(`\d` 하나라도 있으면 차단) 정상 분리가 과도하게 막힐 수 있어 이번 범위에서는 그대로 뒀다.
- 중복 묶음의 "코드형 토큰 없음" 케이스(9건)는 이번 PR의 설계상 범위 밖(지시서 "하지 않는 것" — 행 위치 기반 중복 제거)이라 그대로 남아 있다.
- 이 코드베이스에는 jsdom/testing-library가 없어 체크박스 클릭·강조 표시·일괄저장 안내 문구는 실제 화면에서 사람이 확인해야 한다(아래 체크리스트).

### 화면에서 확인할 것
1. 대조 체크박스를 켜지 않으면 저장 버튼이 비활성이고, 켜면 활성이 된다.
2. 일괄 저장에서 미대조 항목이 토스트로 안내되고 그 항목만 빠진다(나머지는 저장됨).
3. 스타일번호 입력칸을 직접 고치면 체크박스가 자동으로 켜진다(후보 칩 클릭은 안 켜짐).
4. 스타일번호의 1·7·9가 빨강·굵게 강조 표시된다.
5. 작지를 올렸을 때 공급사 칸이 `MB72-014-0(PND` 같은 조각으로 채워지지 않는다(대신 원문 그대로 `itemName`에 남아 있어야 함).
6. 중복 의심 묶음이 이전보다 줄고, 이름이 전혀 다른 코드(예: `KL-R130`/`9748`)가 더는 묶이지 않는다.

### 브랜치·SHA(PR-200c)
브랜치만 push, main 병합 안 함. 커밋 SHA는 push 직후 기록.
