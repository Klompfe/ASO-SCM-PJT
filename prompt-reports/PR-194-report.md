# PR-194 완료 보고: 여러 스타일 묶음 일괄발주 (품목군 묶음 · 업체별 발주서 1장)

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 사항을 보려는 사람).

- 브랜치: `feat/multi-style-bulk-order` (`origin/main` `00138e0`에서 분기 — PR-191은 아직 main에 없어 지시대로 main 기준으로 작업)
- **마이그레이션 없음.** 새 테이블/컬럼 없음(발주 1건 = 품목 1개 × 스타일 1개 구조 그대로).
- **운영 DB에 전혀 접속하지 않았습니다.**
- `StyleShortagePanel.tsx`/`PurchaseOrdersManager.tsx`의 **기존 동작은 바꾸지 않았습니다**(목록에 체크박스 열 + 버튼만 덧붙임, B-6 항목).

## 1. 설계 요약(확정된 결정 그대로)

- 스타일별 발주 N건(기존 구조)을 그대로 만든다 — 스타일별 부족분·입고 추적 유지.
- 업체에 보내는 서류만 업체별로 합쳐 1장으로 따로 출력한다.
- 묶음 기준은 품목군(카테고리/종류)까지 허용한다.

## 2. 변경 요약

### A. 백엔드

| 영역 | 내용 |
|---|---|
| A-1. `GET /work-orders/multi-style-requirements` | `styleNos`(쉼표 구분, 최대 30개). 스타일마다 기존 `getStyleRequirements()`와 완전히 같은 계산(`expandStyleRequirements → calculateMaterialRequirements`)을 재사용. 스타일이 없거나 BOM이 없어도 그 스타일만 `error`를 달고 나머지는 정상 반환(전체 실패 금지). `:id`류 라우트보다 먼저 선언. |
| A-2. `POST /purchase-orders/documents/combined` | `{ poIds: number[] }`(1~200). 존재하지 않는 id → 404. 공급업체 미지정 발주가 섞이면 400(해당 발주 id/품목 목록 포함, 자동 추정 안 함). 공급업체별로 묶어 업체당 엑셀 1개(`buildCombinedPurchaseOrderDocumentBuffer`, 기존 `buildPurchaseOrderDocumentBuffer`는 건드리지 않음) — 품목군 → 품목 순 정렬, 품목마다 소계(스타일별 수량 합), 업체 전체 합계. 단가가 모든 행에서 같으면 단가·금액을 적고, 비었거나 다르면 `PRICE_PENDING_NOTE`. 요구납기는 발주의 스타일(`styleNo`)에서 가져오고 없으면 빈칸. |
| A-3. 생성 | 기존 `POST /purchase-orders/bulk` 그대로 재사용(100건 제한·`assertStyleLinkable`·발주 구분·참고단가 변경 없음). 100건 초과는 프런트가 미리 막는다. |
| 품목군 키 보강 | `MaterialRequirementRow`에 `itemCategoryName`(Item.category.name) 필드 추가(순수 추가, 기존 필드 변경 없음) — 품목군 1순위 키. `materialSubType` 필드도 추가(종류가 섞이지 않을 때만 값, 품목군 아래 종류 라벨 표시용). `src/common/utils/packaging-subtype.util.ts`에 `materialSubTypeLabel()` 추가(코드→규칙 displayName, 규칙에 없으면 코드 그대로 — 추측 안 함). |

### B. 프론트엔드

| 파일 | 내용 |
|---|---|
| `frontend-app/src/utils/multiStyleBulkOrder.ts` (신규) | 순수 로직만: `resolveCategoryGroupKey`(① Item.category → ② BOM 구분(categories[0]) → ③ 미분류), `materialSubTypeLabel`(프론트 미러링), `groupMultiStyleRequirements`(품목군→품목→스타일별 행 묶기, 에러난 스타일 제외), `buildEditableOrderByStyleItem`((styleNo,itemId) 복합키로 미입고 발주 배지), `resolveGroupBulkSupplierId`(품목군 전체 일괄 지정 — 후보 합쳐 1개일 때만), `exceedsBulkCreateLimit`(100건 안내). |
| `frontend-app/src/components/MultiStyleBulkOrder.tsx` (신규) | 1) 스타일 검색·다중 선택(최대 30) → "소요량 불러오기" 2) 품목군(접기/펼치기) → 품목 → 스타일별 행(필요/기발주/부족, 공급업체·구분·수량·단가 입력), 품목군 전체 공급업체 일괄 지정 3) 문제 행(업체 미지정/수량 0/단가 필요) 있으면 "일괄 생성" 비활성, 100건 초과 시 안내 후 비활성 4) 생성 → 결과 영역에 건수 + 업체별 [발주서 다운로드] 버튼(생성 직후 합본 발주서를 한 번에 받아와 바로 다운로드할 수 있게 함). |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | **추가만**: 체크박스 열 + "선택 발주 합본 발주서" 버튼(A-2 재사용, 나중에 같은 합본을 다시 받을 수 있음). 기존 열/행/로직은 그대로. |
| `App.tsx` | 발주관리에 새 서브탭 "다품번 일괄발주" 추가(기존 서브탭 변경 없음). |
| API 서비스 | `workOrders.service.ts`에 `getMultiStyleRequirements`, `purchaseOrders.service.ts`에 `getCombinedPurchaseOrderDocuments` 추가. |

## 3. 합본 발주서 샘플 구조(실제 데이터 없이)

```
발 주 서 (PURCHASE ORDER) — 합본
발주일자  2026-10-14        발행처  태일무역
공급업체  (업체명)
연락처    (연락처)
주소      (주소)
품목군 | 품목명(코드) | 단위 | 스타일번호 | 수량 | 단가 | 금액 | 요구납기 | 비고
원단류 | 폴리원단(FAB-1) | YD | ST-A | 100 | 2 | 200 | 2026-11-01 |
원단류 | 폴리원단(FAB-1) | YD | ST-B | 50  | 2 | 100 | 2026-11-05 |
원단류 | 폴리원단 소계    | YD |      | 150 | 2 | 300 |            |
부자재 | 재봉사(코아사)(THR-1) | 콘 | ST-A | 3 | 추후 통보(선적서류 작성 시 확정) | 추후 통보(...) | | 긴급
부자재 | 재봉사 소계      | 콘 |      | 3   | 추후 통보(...) | 추후 통보(...) |    |
                                        업체 전체 합계 |     | 153 |   | 추후 통보(...) |    |
```
(단가가 품목 내 모든 행에서 같으면 숫자로, 하나라도 비었거나 다르면 추후통보 문구 — 업체 전체 합계 금액도 전 품목 단가가 확정일 때만 숫자로 합산됩니다.)

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **62 suites / 811 tests** 통과 (신규: `packaging-subtype.util.spec.ts` +4, `purchase-order-document.util.spec.ts` +13, `material-requirements.util.spec.ts` +4) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **66 suites / 518 tests** 통과 (신규 `test/multi-style-bulk-order-flow.e2e-spec.ts` 11건: 다스타일 조회 정상/BOM없음/존재안함/필수파라미터/30개초과, bulk 생성→합본 발주서 스타일별행+소계+합계, 발주없음 404, 업체미지정 400, poIds 빈배열 400, 업체 2곳→파일 2개) |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **53 files / 345 tests** 통과 (신규: `multiStyleBulkOrder.test.ts` 16건, `multiStyleBulkOrderApi.test.ts` 2건 — 기존 `BulkOrderPreviewModal`/`StyleShortagePanel` 관련 테스트 회귀 없음) |
| `npm run lint` | 실행 불가 — 저장소 전체에 ESLint 설정 파일이 없음(PR-192/193에서도 확인한 기존 상태, 이 PR과 무관) |

### 프론트 렌더 테스트에 대해
`MultiStyleBulkOrder.tsx`는 스타일 선택 → API 호출 → 품목군 묶음 표 렌더링까지 전부 비동기 흐름에 의존하는 화면이라, 이 환경(`renderToStaticMarkup`만 지원, `useEffect`/사용자 상호작용 미실행)에서는 실제 렌더 테스트가 불가능하다(기존 PR들에서 반복된 동일한 제약 — `BulkOrderPreviewModal.tsx`도 렌더 테스트가 없다). 대신 화면을 구동하는 모든 판단 로직(품목군 키 규칙, 묶기, 미입고 배지, 공급업체 일괄 지정, 100건 제한)은 `multiStyleBulkOrder.ts`로 뽑아 순수 함수 단위로 전부 테스트했다.

## 5. 화면에서 확인할 것 체크리스트
- 발주관리 탭에 "다품번 일괄발주" 서브탭이 추가되어 있다(기존 서브탭 동작은 그대로).
- 스타일을 여러 개(예: 2~3개) 골라 "소요량 불러오기"를 누르면 품목군별로 접히는 표가 뜬다.
- 실/테이프 품목은 품목명 옆에 종류 라벨(예: "코아사")이 보인다.
- 같은 품목·같은 스타일에 이미 미입고 발주가 있으면 그 행에 "이미 미입고 발주 있음" 배지가 뜨고 기본적으로 체크가 빠져 있다.
- 품목군 단위로 "품목군 전체 업체 일괄 지정"을 누르면, 그 품목군 전체 이력상 후보가 하나일 때만 자동으로 채워지고 아니면 안내 토스트가 뜬다(추측 안 함).
- 공급업체 미지정/수량 0/단가 필요 행이 하나라도 있으면 "일괄 생성" 버튼이 비활성화된다.
- "일괄 생성" 후 결과 영역에 생성 건수와 업체별 [발주서 다운로드] 버튼이 뜨고, 눌러보면 업체별로 스타일별 행+소계+합계가 들어간 엑셀이 받아진다.
- 발주 목록(기존 화면)에 체크박스 열과 "선택 발주 합본 발주서" 버튼이 추가되어 있고, 기존 열/버튼/필터는 그대로다.

## 6. 하지 않은 것(명시적 지시 준수)
- 새 테이블/컬럼, 마이그레이션 없음.
- 스타일 구분 없는 합산 1건 발주 구조를 만들지 않음(발주 1건=품목1×스타일1 유지).
- 단가·업체·수량의 자동 확정/자동 생성 없음(후보가 정확히 하나일 때만 미리 채우고, 나머지는 사람이 직접 고름). 사람이 "일괄 생성" 버튼을 눌러야만 생성된다.
- 단위 환산 규칙(PR-189 영역) 변경 없음 — 기존 `suggestStyleLinkedQuantity`/패키징 로직 그대로 재사용.
- 기존 단일 스타일 일괄발주(PR-179) 화면(`BulkOrderPreviewModal.tsx`, `StyleShortagePanel.tsx`) 변경 없음.
- 운영 DB 접근 없음.

## 7. 브랜치 SHA
커밋 완료 후 `feat/multi-style-bulk-order` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).

---

## 8. 보완 (PR-194 보완 — 시즌/브랜드/상태 필터 + 점검표 진입점)

전제 확인: `origin/main`은 PR-196(`f857c10`)까지 병합된 상태였음을 확인하고 작업 시작. `prompt-reports/PR-194-prompt.md`는 저장소/git 히스토리 전체를 뒤져도 찾지 못했다 — 이 "보완" 작업은 이번에 전달받은 요구사항 표와, 원래 PR-194를 만들 때의 직접적인 맥락을 근거로 진행했다(문서가 나중에 발견되면 교차 확인 필요).

### 8-1. Stage 1 — 요구사항별 현황표 (브랜치 `feat/multi-style-bulk-order`, 당시 `f099b9c`)

| # | 요구사항 | 현황(병합 전) | 처리 |
|---|---|---|---|
| 1 | `GET /work-orders/multi-style-requirements`(최대 30개, 스타일별 에러) | **있음** | 그대로 재사용 |
| 2 | `POST /purchase-orders/documents/combined`(업체별, 품목군→품목, 소계/합계) | **있음** | 그대로 재사용 |
| 3 | `MultiStyleBulkOrder.tsx` 품목군 묶음 표·그룹 공급업체 일괄지정·미리보기→확정·결과화면·업체별 다운로드 | **있음** | 그대로 재사용 |
| 4 | 발주 목록 "선택 발주 합본 발주서" | **있음**(`PurchaseOrdersManager.tsx`) | 그대로 재사용 |
| 5 | 시즌 선택(연도+SS/FW, `season.ts`의 `getSeasonDateRange` 재사용, 납기 미정은 별도) | **없음** | 신규 구현 |
| 6 | 브랜드/바이어/상태 필터, "미연결 발주 N건" 배지 | 배지는 PR-196에 있었으나 **필터는 없음** | 필터 신규 구현(배지는 그대로 둠) |
| 7 | 30개 선택 제한 UX(추가 차단 + 안내, 자동 상위 30개 선택 금지) | **부분**(한 번에 하나씩 추가하는 "추가" 버튼에서만 toast로 차단) | 체크박스 기반 선택으로 일반화(`toggleStyleSelection`) |
| 8 | 점검표 화면 진입점(체크박스+필터+"선택 스타일 다품번 일괄발주" → 프리필 이동) | **없음** | 신규 구현 |
| 9 | 미입고 발주 있는 행 기본 제외 + 배지 | **있음**(`hasEditablePending`) | 그대로 재사용 |

### 8-2. Stage 2 — 병합 및 구현

`git merge origin/main`으로 PR-196을 `feat/multi-style-bulk-order`에 반영(병합 커밋 `9a53cb5`). 충돌은 전부 **기계적(양쪽 다 덧붙이는 추가분)** — 사람 판단이 필요한 충돌은 없었다.

| 충돌 파일 | 내용 | 처리 |
|---|---|---|
| `frontend-app/src/App.tsx` | PR-194가 추가한 `purchaseOrdersSubTab`의 `'multiStyleBulkOrder'` 값과 PR-196이 추가한 `'unlinked'` 값이 같은 유니언 타입 선언에서 충돌 | 두 값을 모두 유니언에 포함, 두 탭 버튼·두 조건부 렌더(`<MultiStyleBulkOrder />`, `<UnlinkedPurchaseOrders />`)를 나란히 유지 |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | PR-194의 `selectedPoIds`/`combinedDownloading`(합본 발주서용)와 PR-196의 `filterStyleNo`(스타일별 필터용) state 선언이 인접한 위치에서 충돌 | 두 state 선언을 모두 유지, 로직 변경 없음 |

병합 후 요구사항 5~9 중 없음/부분이던 5, 6, 7, 8을 구현:
- `frontend-app/src/utils/procurementStatusFilters.ts`(신규): `filterProcurementStatusRows`(시즌/브랜드/상태/키워드 — 시즌 지정 시 납기 미정 스타일은 `includeNoDeliveryDate`가 켜져 있을 때만 포함), `extractDistinctBrands`(브랜드 드롭다운용, 가나다순), `toggleStyleSelection`(최대 30개 — 이미 선택된 건 항상 해제 가능, 30개 찬 상태에서 새로 추가 시도 시 선택 변경 없이 `blockedAtMax: true`만 반환 — 자동 상위 30개 선택 없음).
- `frontend-app/src/components/ProcurementStatusReport.tsx`: 연도/시즌/브랜드/상태 드롭다운 + "납기 미정 포함" 체크박스(시즌 선택 시에만 노출) + 체크박스 열 + 선택 건수 표시 + "선택 스타일 다품번 일괄발주" 버튼(`onGoToMultiStyleBulkOrder` prop) 추가. **기존 열(Style No/브랜드·고객사/발주상태/입고상태/출고상태/종합상태)과 기존 동작(키워드 검색, 바로 조치 버튼, 미연결 발주 배지)은 변경 없음** — 전부 선택 사항(prop 없으면 체크박스 열 자체가 안 뜸).
- `frontend-app/src/App.tsx`: `multiStylePrefillStyleNos` state + `handleGoToMultiStyleBulkOrder`(기존 `poPrefillStyleNo`/`onStylePrefillConsumed`와 동일한 "한 번만 채우고 비움" 패턴) 추가, `ProcurementStatusReport`에 `onGoToMultiStyleBulkOrder` 연결, `MultiStyleBulkOrder`에 `prefillStyleNos`/`onStyleNosPrefillConsumed` 연결.
- `frontend-app/src/components/MultiStyleBulkOrder.tsx`: `prefillStyleNos`/`onStyleNosPrefillConsumed` prop 추가. 전달받은 스타일번호를 `useEffect`에서 `mergePrefillStyleNos`(신규 순수 함수, `multiStyleBulkOrder.ts`)로 기존 선택에 중복 없이 덧붙이고 즉시 소비 콜백을 부른다.

### 8-3. PR-196 연동 증거(회귀 테스트)

`test/multi-style-bulk-order-flow.e2e-spec.ts`에 추가: 같은 자재를 쓰는 두 스타일(D, E) 중 D만 이 화면의 발주 플로우(`styleNo`를 명시한 `/purchase-orders/bulk`)로 발주한 뒤 `GET /order-process-stages/procurement-status`를 조회 — D만 `poCreated: true`, E는 `poCreated: false`로 남는 것을 확인(PR-196 스타일 귀속이 깨지지 않음).

### 8-4. 테스트 결과

| 항목 | 병합 직후(기준선) | 보완 작업 후 |
|---|---|---|
| 백엔드 `jest` 전체 | 64 suites / 837 tests | 64 suites / 837 tests (단위 테스트 신규 없음 — 이번 변경은 전부 프론트 UI 배선 + 기존 API 재사용 e2e) |
| 백엔드 e2e(`--maxWorkers=2`) | 67 suites / 530 tests | **67 suites / 531 tests**(PR-196 회귀 테스트 1건 추가) |
| 프론트 `vitest run` | 54 files / 354 tests | **55 files / 372 tests**(`procurementStatusFilters.test.ts` 신규 14건 + `multiStyleBulkOrder.test.ts`에 `mergePrefillStyleNos` 4건 추가) |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

`BulkOrderPreviewModal`/`StyleShortagePanel` 관련 기존 테스트는 건드리지 않았고 전부 그대로 통과(파일 수·건수에 포함).

### 8-5. 화면 확인 체크리스트
① 발주·입고·출고 현황에서 연도+시즌(SS/FW)을 고르면 해당 기간 납기 스타일만 남고, "납기 미정 포함"을 켜기 전까지 납기 미정 스타일은 빠진다.
② 같은 화면에서 체크박스로 스타일을 고르고 "선택 스타일 다품번 일괄발주"를 누르면 다품번 일괄발주 화면으로 이동하면서 고른 스타일이 그대로 선택되어 있다(최대 30개, 30개 찬 상태에서 더 고르면 선택이 바뀌지 않고 안내만 뜬다).
③ 같은 자재를 쓰는 스타일 중 하나만 발주하면, 발주·입고·출고 현황에서 그 스타일만 발주완료로 바뀌고 나머지 스타일은 미발주로 남는다.
④ 다품번 일괄발주 결과 화면에서 업체별 발주서 다운로드가 기존과 동일하게 동작한다(이번 보완에서 변경 없음).

### 8-6. 하지 않은 것(명시적 지시 준수)
- 새 테이블/컬럼/마이그레이션 없음.
- 스타일 구분 없는 합산 1건 발주 구조로 바꾸지 않음.
- 단가·업체·수량 자동 확정 없음, 단위 환산 규칙 변경 없음.
- 기존 단일 스타일 일괄발주(PR-179) 화면 변경 없음.
- 새 브랜치 생성 없음, 강제 푸시 없음 — 기존 `feat/multi-style-bulk-order` 브랜치에 커밋만 추가.

### 8-7. 커밋
병합 커밋 `9a53cb5` + 이번 보완 작업 커밋. SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
