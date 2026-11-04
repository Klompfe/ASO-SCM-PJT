# PR-221 — 수주등록 저장 화면(자재명세 초안) 창 폭 확대 + "확인 필요" 열 세로 길이 줄이기

대상 브랜치: `feat/mapping-preview-wide-layout` (origin/main `be9b22d`에서 분기, push만 — main 병합 없음)

## 0. 지시서의 파일명 정정

지시서는 `MappingPreviewModal.tsx`를 대상으로 지목했지만, 확인해보니 "확인 필요" 열을 가진 화면은 그 컴포넌트가 아니라 **`frontend-app/src/components/SalesOrderUploadModal.tsx`**("수주등록 저장" — 작지/수주 이미지를 올려 AI로 분석한 자재명세 초안을 검토·저장하는 모달)였습니다.

- `MappingPreviewModal.tsx`는 **MATERIAL LIST 엑셀 업로드** 미리보기 화면으로, "확인 필요" 열 자체가 없고(행마다 `packaging-warning-${index}` 스팬 1개, 별도의 `color-size-quantity-warnings` 목록) 완전히 다른 컴포넌트입니다.
- 두 화면은 "같은 모달이 쓰이는 다른 진입점"이 아니라 서로 무관한 별개 컴포넌트이며, `SalesOrderUploadModal`은 StylesManager의 "수주 등록" 버튼 1곳에서만 열립니다(다른 진입점 없음).
- 실제 작업은 전부 `SalesOrderUploadModal.tsx`에서 진행했습니다.

## 1. 현황 파악 (수정 전)

| 항목 | 수정 전 값 |
|---|---|
| 모달 폭 | `w-full max-w-4xl`(56rem ≈ 896px) |
| 모달 높이/스크롤 | `max-h-[90vh]` + 내부 콘텐츠 `overflow-y-auto flex-1 min-h-0`(기존 동작, 문제 없음) |
| 자재명세 표 래퍼 | `overflow-x-auto max-h-96 overflow-y-auto`(표 자체도 세로 384px 스크롤) |
| 표 `table-layout` | 지정 없음(기본값 `auto`) |
| 열 폭 | `<th>`/`<td>` 자체엔 폭 지정 없음 — 입력 요소에만 Tailwind `w-14`~`w-28` |
| **"확인 필요" 열** | **폭 지정 전혀 없음.** 최대 6개의 독립 조건부 경고 `<div>`가 `space-y-0.5`로 세로로 쌓임. 열 폭이 좁아지면 배지 내부의 긴 문장(예: "요척×수량이 작지의 출고량과 다름 — 확인해주세요")까지 줄바꿈이 심해져 행이 세로로 매우 길어짐 — 보고된 버그의 직접 원인 |

"확인 필요" 열의 경고 6종(순서대로): `isNewMaterial`(PR-197) → `requiredQtyMismatch`(PR-197) → `duplicateLooking`(PR-197) → `unknownName`(PR-200, "~로 바꾸기" 버튼 포함) → `yocheokMismatch`(PR-200) → `duplicateWarning`(PR-200, "이 행만 남기기" 버튼 포함).

## 2. 창 폭 확대

`max-w-4xl` → `max-w-[1680px]`로 상한만 올렸습니다(`w-full`은 그대로 유지).

- 모바일(≤768px)에서는 `w-full`이 그대로 적용되므로 영향 없습니다(상한값만 커졌을 뿐, 작은 화면에서 모달이 뷰포트보다 넓어지지 않음).
- 큰 화면에서는 기존 896px 대신 최대 1680px까지 넓게 쓸 수 있습니다.
- 높이/스크롤 동작(`max-h-[90vh]`, 내부 `overflow-y-auto`)은 그대로 유지했습니다(지시서 요구사항).

## 3. "확인 필요" 열 폭 고정 + 표시 방식 개선

### 3-1. 열 폭

`<thead>`의 각 `<th>`에 `min-w-[...]`를 추가했습니다(표는 `table-layout: auto`를 그대로 유지 — 자동 레이아웃도 `min-width`는 하한으로 존중하므로 구조를 바꾸지 않고 해결):

| 열 | min-width |
|---|---|
| 제외 | 48px |
| 구분 | 72px |
| 자재명 | 140px |
| 규격 | 72px |
| 소요량 | 72px |
| 작지수량(출고량) | 140px |
| 공급사 | 96px |
| 비고 | 72px |
| 실/테이프 종류 | 120px |
| **확인 필요** | **280px** |

### 3-2. 칩 + 접기/펼치기

기존 "경고마다 한 줄씩 세로로 쌓기(`space-y-0.5`)"를 **가로로 흐르다 넘치면 줄바꿈하는 칩 목록**(`flex flex-wrap gap-1`)으로 바꿨습니다. 각 칩에는 `[word-break:keep-all]`을 줘서 한글이 글자 단위로 끊기지 않게 했습니다(공백 단위로만 줄바꿈).

- 경고가 **2개 이하**면 접기 버튼 없이 전부 보여줍니다(기존과 동일한 모양, 세로 대신 가로 흐름만 다름).
- 경고가 **3개 넘으면** 기본적으로 처음 2개만 보이고, "총 N건" 표시 + `+N`(숨겨진 개수) 버튼이 나타납니다. 버튼을 누르면 전체를 펼치고 버튼 글자가 "접기"로 바뀝니다 — 행(결과 인덱스-행 인덱스)별로 독립된 펼침 상태(`expandedWarningRows`)라 다른 행에 영향이 없습니다.
- 접힌 상태에서도 칩 목록 컨테이너의 `title` 속성에 전체 경고 문구를 전부 넣어, 마우스를 올리면 숨겨진 내용까지 보입니다.
- 경고 6종의 **내용·분류(색상)·순서·버튼 동작(onClick)은 전혀 바꾸지 않았습니다** — `isNewMaterial`/`requiredQtyMismatch`/`duplicateLooking`/`unknownName`("~로 바꾸기" 버튼 포함)/`yocheokMismatch`/`duplicateWarning`("이 행만 남기기" 버튼 포함) 전부 기존과 동일한 텍스트·동일한 `updateBomItemField`/`setExcludedBomIndexes` 호출을 그대로 칩 안에 넣었을 뿐입니다.
- 상단 "확인 필요 N건 — ..." 요약 띠(line 560 부근, `summarizeWarnings` 기반)는 건드리지 않았습니다 — 별개 영역입니다.
- 입력 기능/키보드 탐색(각 `<input>`/`<select>`의 `onChange`, `disabled`)은 전혀 바꾸지 않았습니다.

### 3-3. 접기/펼치기 선택 로직을 순수 함수로 분리

컴포넌트 안의 조건 분기를 `frontend-app/src/utils/warningChips.ts`로 뽑아 단위 테스트가 가능하게 했습니다:

- `selectVisibleChips(chips, expanded)` — 몇 개를 보여줄지/숨길지/접기 가능 여부
- `buildChipsTitle(chips)` — 접힌 상태에서도 쓸 `title` 속성용 전체 문구

이 파일은 백엔드/마이그레이션/검증 로직과 무관한, 순수 UI 표시 로직입니다.

## 4. 테스트

### 4-1. 기존 테스트

`SalesOrderUploadModal.test.tsx`의 기존 2개 테스트(열림/닫힘 스모크 테스트)는 **수정 없이 그대로 통과**합니다 — 이 파일은 `renderToStaticMarkup`만 쓰고(jsdom/testing-library 없음, 코드베이스 기존 관례), `results`가 내부 `useState`라 업로드 응답 없이는 자재명세 표 자체가 그려지지 않아 경고 칩 상호작용은 이 하네스로 직접 검증할 수 없었습니다(기존 주석에 적힌 이유와 동일) — 그래서 접기/펼치기 "선택 로직"은 컴포넌트에서 순수 함수로 분리해(`warningChips.ts`) 거기서 단위 테스트했습니다.

### 4-2. 새 테스트

`frontend-app/src/utils/warningChips.test.ts`(신규, 7개):
- 메시지 2개 이하 → 접지 않고 전부 표시(접기 버튼 없음 해당 조건)
- 메시지 0개 → 접지 않음
- 메시지 5개, 접힌 상태 → 처음 2개만 보이고 `hiddenCount=3`
- 메시지 5개, 펼친 상태 → 5개 모두 보이고 `hiddenCount=0`
- 메시지 정확히 3개 → 접을 수 있음(2개 + "+1")
- `buildChipsTitle` — 접힌 상태에서도 전체 메시지를 이어붙인 title 문자열 생성(건수 확인용)
- `buildChipsTitle([])` → 빈 문자열

`SalesOrderUploadModal.test.tsx`에 1개 추가:
- 모달 컨테이너 클래스에 `max-w-[1680px]`가 있고 기존 `max-w-4xl`은 없음을 확인(min-width 클래스는 자재명세 표가 내부 `useState`(`results`) 채워진 뒤에만 렌더링되어 이 스모크 테스트 하네스로는 직접 검증할 수 없었습니다 — 표 헤더의 `min-w-[...]` 클래스는 본 보고서 3-1의 코드 인용으로 대신합니다).

Playwright 스크린샷(1366×768, 1920×1080)은 시도하지 않았습니다 — `npx playwright`로 패키지 자체는 받을 수 있지만, 자재명세 표(그리고 "확인 필요" 열)는 업로드 응답으로 채워지는 내부 `useState`(`results`)가 있어야 그려지고, 그 응답을 실제로 받으려면 Gemini(AI 분석) 호출이 필요해 금지된 범위였습니다. 이 저장소엔 jsdom/testing-library 설정도 없어(코드베이스 기존 관례, 4-1 참고) `results`를 테스트에서 직접 주입해 스크린샷을 찍을 방법도 없었습니다. 대신 위 3-1/3-2의 클래스·구조 인용과 아래 검증 결과로 대체합니다.

### 4-3. 전체 테스트 결과

| 구분 | 수정 전(기준, MERGE-24 보고서) | 수정 후 |
|---|---|---|
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 558 | ✅ **566/566**(+8, 신규) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(1회) | 1143 | ✅ **1143/1143**(변경 없음 — 백엔드 파일 수정 없음) |

`git diff origin/main --stat` 확인 결과 변경된 추적 파일은 `frontend-app/src/components/SalesOrderUploadModal.tsx`, `SalesOrderUploadModal.test.tsx` 2개뿐이고(+ 신규 `frontend-app/src/utils/warningChips.ts`, `warningChips.test.ts`), 모두 `frontend-app/` 범위 안입니다. 백엔드/마이그레이션/`package.json`/락 파일/검증 로직/경고 문구/수량 계산 로직은 전혀 건드리지 않았습니다.

## 5. 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리해서 올렸습니다(아래 `git log` 참고).
