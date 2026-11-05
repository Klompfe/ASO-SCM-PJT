# PR-224 — 자재·BOM 조회 화면 1단계: 스타일번호 자동완성 + 선택 즉시 자재 목록 + 자재명/구분/색상 필터

대상 브랜치: `feat/bom-lookup-style-autocomplete` (origin/main에서 분기, push만 — **병합 없음**, 백엔드 변경 없음)

## 1. 현황 파악 (수정 전)

| 항목 | 수정 전 동작 |
|---|---|
| 스타일 번호 입력 | 자유 입력 `<input>`(`searchStyleNo`), 후보 목록 없음 |
| 검색 | "검색" 버튼(또는 Enter) → `getMasterStyles({styleNo, targetRddFrom, targetRddTo})` → `searchResults`에 저장 |
| 검색 결과 → BOM 표시 | **결과가 몇 건이든** 스타일 한 줄짜리 표만 보여주고, **행을 클릭해야**(`handleSelectStyleNo`) `getBomByStyleNo(styleNo)`로 BOM을 불러온다 — 결과가 1건이어도 자동 선택 없음 |
| BOM 열 구성 | 자재코드·자재명·카테고리·색상·규격·단위소요량·소요수량(`bomItemQtyDisplay` = `formatBomItemQty`, PR-216/218/220 포장단위·정수 올림 로직)·공급업체·단가·비고·혼용율·HS코드·실 종류·Action |
| "이 스타일 BOM 자재만" 필터·`styleMaterialRows` 캐시 | **이 화면(ItemsManager.tsx)에는 없음.** `styleMaterialRows`는 `PurchaseOrdersManager.tsx`에만 있는 상태(발주 폼에서 "스타일 연결" 시 그 스타일 BOM 자재로만 품목 검색 후보를 제한하는 캐시) — ItemsManager는 매번 `getBomByStyleNo`로 그때그때 불러올 뿐 비슷한 캐시가 없다. |
| 품목 마스터 관리 섹션 | `<details>`(open 속성 없음) → **이미 기본 접힘 상태**(수정 전/후 동일, 변경 불필요) |
| 엑셀 내보내기 | 이 BOM 표에는 **없음**. "엑셀 내보내기"는 아래 "품목 마스터 관리" 섹션 안의 별도 기능(`ItemCatalogReport`, "카탈로그 보고서(인쇄/엑셀)")이고 `catalogItems`(전체 품목, filter.type/keyword 기준)를 쓴다 — 선택한 스타일의 BOM 표와는 무관. 이 PR은 그 기능도 건드리지 않는다. |

### 발주 화면의 스타일 검색 컴포넌트 재사용 가능성

`PurchaseOrdersManager.tsx`의 "스타일 연결" 콤보(558행)는 `SearchSelectField<StyleOption>` + `getMasterStyles(keyword ? {styleNo: keyword} : undefined)`를 쓴다. `SearchSelectField.tsx`를 읽어 보니:

- **모양/동작**: `readOnly` 입력칸(클릭하면 검색 팝업이 열림) + 돋보기 버튼 — **타이핑하면 입력칸 바로 아래에 후보가 뜨는 인라인 콤보가 아니라, 클릭 → 모달 팝업 → 팝업 안 검색어 입력 → 행 클릭으로 선택하는 방식**이다.
- 디바운스(기본 300ms, `debouncedSearch.ts`의 `createDebouncedSearcher`)와 응답 순서 보호(느린 요청이 나중에 와도 최신 검색어 결과를 덮어쓰지 않음)가 **이미 구현돼 있다** — 추가 구현 불필요.
- 키보드: 팝업의 Escape(닫기)만 있고, **방향키(↑↓)로 후보를 옮기는 기능은 없다**(행마다 `<button>`이라 Tab으로는 이동 가능, 방향키 전용 핸들러는 없음).

**이 PR의 선택**: `SearchSelectField<MasterStyle>`을 **그대로 재사용**했다(수정 없음 — 이 컴포넌트는 여러 화면이 같이 쓰는 공용 컴포넌트라 동작을 바꾸면 발주 화면 등 다른 곳에도 영향을 준다). 다만 지시서의 "입력하면 후보가 뜨고 키보드 ↑↓ Enter로 고른다"는 문구는 **이 컴포넌트의 실제 동작(클릭→팝업)과 다르다** — 발주 화면도 똑같이 동작하므로 "발주 화면과 같은 방식"이라는 지시를 그대로 따른 결과이며, 별도 인라인 자동완성을 새로 만들지 않았다(공용 컴포넌트 변경은 영향 범위가 커서 이 PR 범위를 벗어난다고 판단). `renderRow`만 이 화면에 맞게 커스터마이즈해 스타일번호 옆에 브랜드·바이어를 보여주게 했다(발주 화면 원본은 스타일번호만 보여줌 — 지시서의 "후보 줄에 스타일명/브랜드/바이어 정보" 요구를 만족시키기 위한 추가).

## 2. 스타일 번호 자동완성 목록

- 기존 "스타일 번호(직접 입력)" `<input>` + "검색" 버튼은 **완전히 그대로 유지**(동작 변경 없음 — 직접 입력 후 검색/Enter는 기존과 동일).
- 그 옆에 "또는 목록에서 선택" `SearchSelectField<MasterStyle>`을 **새로 추가**했다(교체가 아니라 추가 — 1절에서 설명한 모달형 UX라 "입력칸에 바로 후보가 뜨는" 방식과 "타이핑 후 Enter" 방식을 하나의 입력칸으로 합칠 수 없었다).
- 고르면(`handlePickStyleFromSearch`) 검색 버튼 없이 바로 `getBomByStyleNo`까지 호출해 자재 목록을 보여준다. 기존 "스타일 번호" 입력칸과 검색 결과 표에도 선택한 스타일 1건을 반영해(같은 화면 구조를 그대로 재사용) 사용자가 "검색 결과 표 → 자재 목록"이라는 기존 흐름과 다르다고 느끼지 않게 했다.
- 후보 없음/일치 없음 안내는 `SearchSelectField`가 이미 제공한다("검색 결과가 없습니다").

## 3. 선택한 스타일의 자재 목록 즉시 표시

- `handleSearch`(직접 입력+검색 버튼 경로)에서 `getMasterStyles` 결과가 **정확히 1건이면** `handleSelectStyleNo`를 자동 호출해 추가 클릭 없이 자재 목록을 보여준다. 결과가 여러 건이면 기존처럼 스타일 표를 보여주고 행 클릭으로 선택(변경 없음).
- 자재 목록의 기존 표시(`bomItemQtyDisplay` = `formatBomItemQty`, 포장단위 N롤/N콘·정수 올림)와 계산 로직은 **전혀 바꾸지 않았다**. 엑셀 내보내기는 1절에서 설명한 대로 이 표와 무관한 별도 기능이라 손댈 것이 없었다.

## 4. 자재명·구분·색상 필터

- 자재 목록(테이블) 바로 위에 필터 바를 추가했다: 자재명 입력칸(부분 일치, 공백·대소문자 무시), 구분 선택, 색상 선택(둘 다 **현재 불러온 `bom.items`에 실제로 있는 값만**, `distinctNonEmptySorted` — 새 분류를 만들지 않음), "초기화" 버튼(필터가 하나라도 걸려 있을 때만 표시).
- 필터는 전부 **클라이언트에서만** 적용한다(`filterBomRows`, `frontend-app/src/utils/bomLookupFilter.ts`, 신규 순수 함수) — 서버 호출 없음, 소요량/포장단위 계산과 무관.
- "자재 {bom.items.length}건 중 {filteredBomItems.length}건"을 항상 보여주고, 0건이면 "조건에 맞는 자재가 없습니다 — 필터를 초기화해 보세요."
- 스타일을 바꾸면(`handleSelectStyleNo`) 필터를 자동으로 초기화한다 — 이전 스타일에 걸어 둔 필터가 남아 "자재가 하나도 안 보이는" 혼란을 막기 위함.

## 5. 품목 마스터 관리 섹션

- `<details>`에 `open` 속성이 원래 없어 **이미 기본 접힘 상태**였다 — 코드 변경 없음.
- "품목 등록·수정은 마스터·설정 > 품목에서도 할 수 있습니다" 안내는 **추가하지 않았다**. `App.tsx`를 확인한 결과 `<ItemsManager>`는 **한 곳에서만 렌더링**된다(238행) — "자재·발주 > 자재"와 "마스터·설정 > 품목" 두 메뉴가 서로 다른 화면이 아니라 **완전히 같은 컴포넌트 인스턴스를 가리키는 두 개의 메뉴 항목**이다. 이미 보고 있는 화면을 "여기서도 할 수 있다"고 안내하는 건 서로 다른 화면처럼 오해를 줄 수 있어 넣지 않는 것이 더 낫다고 판단했다(지시서의 "판단이 어려우면 넣지 말고" 조항 — 이 경우는 판단이 어렵지는 않았지만, 결론은 "넣지 않음"이다).

## 6. 테스트

### 신규 순수 함수 테스트 — `frontend-app/src/utils/bomLookupFilter.test.ts`(10개, 합성 값)

`normalizeForFilter`(공백·대소문자 무시, null/undefined 처리), `filterBomRows`(자재명 부분일치, 구분/색상 정확일치, AND 조합, 필터 없음=전부 통과, `material: null` 방어), `distinctNonEmptySorted`(중복 제거·빈값 제외·정렬).

### 컴포넌트 스모크 테스트 — `ItemsManagerLabels.test.tsx`(+2)

이 파일은 `renderToStaticMarkup`만 쓰고(jsdom/testing-library 없음, 코드베이스 기존 관례) `results`류 상호작용 상태는 내부 `useState`라 직접 주입할 수 없다(PR-221/222/223과 동일한 이유) — 그래서 ① "스타일 번호(직접 입력)"과 "또는 목록에서 선택"이 함께 렌더링되는지 ② `<details>`에 `open` 속성이 없는지(기본 접힘)만 정적 렌더로 확인했다. 후보 표시·즉시 조회·필터 조합 등 상호작용은 순수 함수(`bomLookupFilter.test.ts`)와 `SearchSelectField`가 이미 가진 기존 테스트로 커버된다.

### 기존 테스트

`ItemsManagerLabels.test.tsx`의 기존 테스트(PR-167, 납기일 라벨) **수정 없이 통과**.

### 전체 테스트 숫자

| 구분 | 수정 전(MERGE-26 기준) | 수정 후 |
|---|---|---|
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 575 | ✅ **587/587**(+12: bomLookupFilter 10 + ItemsManagerLabels 2) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(1회) | 1143 | ✅ **1143/1143**(변경 없음 — 백엔드 파일 미변경) |
| e2e | 569 | **생략** — 백엔드 변경 0개(마이그레이션 포함)라 영향 가능성이 없음 |

`git diff origin/main --stat` 확인: 추적 파일 변경은 `frontend-app/src/components/ItemsManager.tsx`, `ItemsManagerLabels.test.tsx` 2개(+ 신규 `frontend-app/src/utils/bomLookupFilter.ts`, `bomLookupFilter.test.ts`) — 전부 `frontend-app/` 범위. `src/migrations/`/`package.json`/락 파일 변경 0.

## 7. 2단계 후보 (이번 PR에서는 만들지 않음)

| 후보 | 설명 |
|---|---|
| 공급사·발주상태·입고 열 | BOM 표에 현재 없는 정보 — 발주 연결(PurchaseOrder) 상태/입고 수량을 보여주려면 추가 API 조회가 필요(이번 PR 범위 아님, 지시서에서도 명시적으로 제외) |
| 행 상세 창 | BOM 행 클릭 시 혼용율·HS코드·발주 이력 등을 한 곳에 모아 보는 상세 패널(현재는 인라인 수정만 가능) |
| 자재 → 스타일 역조회 | 특정 자재가 쓰인 모든 스타일을 찾는 반대 방향 검색(현재는 스타일 → 자재만 가능) |
| "BOM 중복 검토" 탭과의 연결 | 같은 자재가 다른 이름/다른 BOM 행으로 중복 등록된 걸 찾는 기존 기능(있다면)과 이 필터 화면을 연결해, 필터링된 자재 목록에서 바로 "중복 검토"로 넘어가는 링크 |

## 사람이 화면에서 확인할 것 (병합·배포 후, 자재·BOM 조회 화면)

1. 스타일 번호칸에 `MB7`만 입력하면(직접 입력칸이 아니라 "또는 목록에서 선택" 칸을 클릭) 후보 목록이 뜬다.
2. 후보를 고르면 검색 버튼 없이 그 스타일의 자재 목록이 아래에 나온다.
3. 자재명 키워드·구분·색상으로 걸러지고 "N건 중 M건"이 보인다.
4. 품목 마스터 관리는 접혀 있다.
5. 자재 목록의 N롤/N콘 표시와(엑셀 내보내기는 이 화면에 없으므로 해당 없음 — 1절 참고) 계산값은 이전과 같다.

## 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리했다(아래 `git log` 참고). **main에 병합하지 않았다.**
