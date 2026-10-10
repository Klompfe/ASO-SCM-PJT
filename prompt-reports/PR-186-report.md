# PR-186 완료 보고: 실/테이프 종류를 자재(Item) 단위로 지정

Written for: 이 저장소를 관리하는 개발자(마이그레이션/검증 결과를 확인하려는 사람).

- 브랜치: `feat/item-thread-tape-subtype` (`feat/purchase-order-style-pricing`의 `f42bdcc`에서 분기 — PR-185 코드 위에 쌓는 PR, main에서 분기하지 않음)
- queue 정책: `pause-after` — main 병합은 하지 않음. 푸시는 이 브랜치만.
- 운영 DB: 읽기 전용 조사만 수행(2번 절). 마이그레이션 실행·서버 기동 없음.

## 0. 왜 필요했나 — PR-185 조사에서 드러난 문제

PR-185(발주 두 트랙 + 콘/롤 환산)의 환산 로직은 `BomItem.threadType/tapeType`과 `Item.unit`(콘/롤 표기)이 둘 다 있어야 동작하도록 짜여 있었다. 그런데 운영 데이터를 읽기 전용으로 조사한 결과:

- 실/테이프로 보이는 자재 91건 **전부 `Item.unit = 'EA'`** (콘/롤 표기가 하나도 없음)
- 그 자재를 쓰는 BOM 행 785건 **전부 `threadType`/`tapeType`이 null**

즉 PR-185의 환산 코드는 정확히 구현돼 있지만, 운영 데이터 형태상 **한 번도 실제로 동작하지 않는** 상태였다. 이번 PR은 BOM 행이 아니라 **자재(Item) 단위로 한 번만** 종류를 지정할 수 있게 해서, `Item.unit`이 'EA'로 남아 있어도(단위 표기를 바꾸라고 요구하지 않고) 환산이 동작하게 한다.

## 1. 구현 요약

| 영역 | 내용 |
|---|---|
| 마이그레이션 `1791800000000` | `items`에 nullable `materialSubType`(실/테이프 종류), `packagingReviewedAt`(검토 시각) 추가. `ADD COLUMN IF NOT EXISTS`만 사용, 기존 컬럼/데이터 무변경. |
| A. Item 단위 종류 지정 | `CreateItemDto`/`UpdateItemDto`에 `materialSubType` 추가. 값이 있으면 `material_packaging_unit_rules`에 존재해야 함(없으면 400, 추측 저장 금지). ItemsManager 화면에 "실/테이프 종류" 선택 드롭다운(생성/수정 모두) + 목록 컬럼 추가. |
| B. 공용 판별 유틸 | `src/common/utils/packaging-subtype.util.ts` 신설: `effectiveSubType(bomItem, item)`(BOM 행 우선, 없으면 Item), `looksLikeThreadOrTape(name, rules)`(보수적 키워드 판별 — 단독 "사"는 오탐이 많아 제외), `buildThreadTapeSuggestion(name, rules)`(정확히 1개 규칙에만 매칭될 때만 추천, 자동 확정 아님). |
| B. 소요량 계산 변경 | `material-requirements.util.ts`의 환산 게이트를 "`Item.unit`이 콘/롤" 우선에서 "**종류(`effectiveSubType`)가 있고 규칙이 있으면 `Item.unit`과 무관하게 환산**"으로 교체. 종류가 없고 이름이 실/테이프로 보이는데 검토 안 됨(`packagingReviewedAt` 없음)이면 경고만(미터 수량 제안 안 함). 검토완료(`packagingReviewedAt` 있음)면 일반 자재로 취급. `work-orders.service.ts`는 `bom.items.material`(Item 전체) 관계를 이미 로드하고 있어 **코드 변경 없이** 새 컬럼이 그대로 흘러들어감(확인됨). |
| B. 프론트 소비자 | `purchaseOrderForm.ts`/`StyleShortagePanel.tsx`/`BulkOrderPreviewModal.tsx`는 PR-185부터 `row.conversionWarning`/`row.packaging` 존재 여부에만 반응하는 구조라(값이 *언제* 채워지는지만 바뀜, 모양은 그대로) **코드 변경 없이** 그대로 동작. |
| C. INVOICE 연계 | `export-shipments.service.ts`의 `generate()`가 라인 `materialSubType`을 `bomItem.threadType ?? bomItem.tapeType ?? null`에서 `effectiveSubType(bomItem, bomItem.material)`로 교체(2곳). BOM 행에 종류가 있으면 그대로 동일 동작(회귀 없음), 없을 때만 Item 지정값으로 폴백 — 순수 추가. |
| D. 일괄 지정 화면 | `GET /items/thread-tape-candidates?reviewed=false\|true\|all`(보수적 후보 + 정확히 1개 매칭 추천), `POST /items/thread-tape-classification`(전부 유효해야 전부 적용, all-or-nothing, `materialSubType: null`이면 "실/테이프 아님"으로 확정). 프론트 "마스터·설정 > 실/테이프 종류 지정" 화면(체크 선택 → 종류 드롭다운 → 선택 적용, 추천 자동 확정 없음). |

## 2. 실제 production 데이터 읽기 전용 조사

(0번 절의 91건/785건 null 확인에 더해, 좀 더 세밀한 후보 분석)

- 전체 품목 355건 중 `looksLikeThreadOrTape` 후보 **54건**.
- 그중 정확히 1개 규칙에 매칭돼 추천 가능한 건 **30건**: `DADE 10 / OBA_SA_SKU_I_SA 12 / AMHOL 3 / COA_SA 5` (`POLY_JINUIDO`는 0건 — 실제 자재명이 "지누이도"만 단독으로 쓰여 규칙의 `displayName`("폴리지누이도")과 토큰 분리로도 안 걸림. 데이터 갭으로 보고만 함, 규칙 테이블을 억지로 바꾸지 않았다).
- 추천 불가(0개 또는 2개 이상 매칭) 24건 — 화면에서 사람이 직접 종류를 골라야 함.
- 샘플 40건을 직접 검토한 결과 오탐(실/테이프가 아닌데 후보로 뜸) 없음.
- 반대로, "사"로 끝나지만 `looksLikeThreadOrTape`가 **일부러 놓치는** 15건(`봉봉사, 스팽사, 아사, 본봉사...` 등 — 실제로는 실류로 보임)을 확인했다. 단독 "사"를 키워드로 넣으면 "사이즈"/"라벨" 류 오탐이 너무 많아(별도 확인) 제외한 보수적 설계의 의도된 재현율 손실이다. 이 경우는 후보 목록엔 안 뜨지만 ItemsManager에서 **직접 지정**은 여전히 가능하다(요구사항 A).

## 3. 하지 않은 것(명시적 지시 준수)

- 자동 확정 없음 — 추천은 보여주기만 하고, 사람이 화면에서 체크/선택해 "선택 적용"을 눌러야 저장된다.
- `Item.unit` 값을 바꾸지 않았다.
- `bom_item_details`(BOM 행) 785건을 일괄 업데이트하지 않았다 — 자재(Item) 쪽에만 새 컬럼을 추가했다.
- 규칙 테이블에 없는 종류(`POLY_JINUIDO` 매칭 실패 등)에 대해 단위길이를 추측해 채우지 않았다 — 갭으로만 보고.
- PR-185의 두 트랙/참고단가 로직은 건드리지 않았다.

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run build` (백엔드) | 통과 |
| backend `jest` 전체 | 61 suites / 779 tests 통과 |
| backend e2e 전체(`--maxWorkers=2`) | 65 suites / 497 tests 통과 (신규 `item-thread-tape-classification-flow` 4건 + `invoice-thread-tape-price-conversion-flow`에 1건 추가) |
| frontend `tsc --noEmit` | 통과 |
| frontend `npm run build` | 통과 |
| frontend `vitest run` 전체 | 50 files / 319 tests 통과 |

### e2e 중 발견·수정한 환경 버그(이번 PR 코드가 유발)
`Item.packagingReviewedAt`을 처음 `@Column({ type: 'timestamp', nullable: true })`로 선언했는데, sqlite(e2e 테스트 DB)는 `'timestamp'` 타입을 지원하지 않아 `DataTypeNotSupportedError`로 앱이 기동조차 안 됐다(`DriverPackageNotInstalledError`로 잘못 보고되는 TypeORM 재시도 로직 때문에 처음엔 sqlite3 패키지 문제로 오인했었다 — 실제 원인은 컬럼 타입이었다). `type`을 명시하지 않고 TS 타입(`Date`)에서 드라이버별로 추론하게 바꿔 해결(Postgres는 `timestamp`, sqlite는 `datetime`으로 각각 알맞게 생성됨). 마이그레이션 파일(`1791800000000`)의 raw SQL은 Postgres 전용이라 그대로 `TIMESTAMP`를 쓴다 — 영향 없음.

## 5. 마이그레이션 검증 — **미검증(운영/Neon 테스트 브랜치 모두)**

이번 PR은 마이그레이션을 어디에도 실행하지 않았다(읽기 전용 조사만). SQL은 `ADD COLUMN IF NOT EXISTS`만 사용하는 추가 전용이고, `down()`은 이 PR이 추가한 두 컬럼만 되돌린다. main 반영을 위한 MERGE 단계(Neon 테스트 브랜치 사전 검증)에서 수행하는 것이 적절하다고 판단했다(PR-183~185와 같은 패턴).

## 6. 운영 DB에 남긴 테스트 데이터 — 없음

이번 PR은 운영 DB에 쓰기 작업을 전혀 하지 않았다(읽기 전용 SELECT만). 모든 검증은 sqlite e2e 테스트 DB에서 수행했고, 각 테스트가 끝나면 자체적으로 파일을 삭제한다(`afterAll`).

## 7. 스크린샷 — 없음(실데이터 Puppeteer 확인 미수행)

PR-183~185와 같은 이유(새 컬럼이 존재하는 환경이 아직 없음)로 라이브 화면 확인은 하지 못했다. 대신:
- 백엔드 동작은 sqlite e2e 신규 4건(후보 조회/필터/일괄 적용/all-or-nothing 거절) + 기존 INVOICE e2e에 추가한 1건으로 실제 HTTP 요청 기준 확인했다.
- 프론트 UI 구성("실/테이프 종류 지정" 화면, ItemsManager 드롭다운)은 정적 렌더 테스트(`ThreadTapeClassificationManagerLabels.test.tsx`)와 `tsc`/`vite build`로 확인했다.

## 8. 사용자가 다음에 할 일

1. 이 브랜치를 머지(별도 MERGE 승인 필요)한 뒤, "마스터·설정 > 실/테이프 종류 지정" 화면에서 추천 30건을 확인하고 선택 적용한다(또는 ItemsManager에서 자재 하나씩 직접 지정).
2. 추천이 없는 24건(그리고 "사"로 끝나 후보에도 안 뜨는 자재들)은 ItemsManager에서 이름을 보고 직접 종류를 고르거나, "실/테이프 아님"으로 확정(종류 비움 + 적용)한다.
3. `POLY_JINUIDO`처럼 자재명과 규칙 `displayName`이 안 겹쳐 추천이 안 되는 종류가 있으면, 규칙 테이블(`material_packaging_unit_rules`) 쪽 `displayName`을 실제 자재명에 맞게 다듬을지 검토한다(이번 PR에서는 규칙 테이블을 바꾸지 않았다).

## 9. PR-186-FIX: 일괄 지정 API 권한·입력 검증 보강

같은 브랜치(`feat/item-thread-tape-subtype`)에 커밋을 추가했다(main 병합·강제 푸시 없음). 클라우드 코드 검토에서 지적된 두 가지를 고쳤다.

| 문제 | 조치 |
|---|---|
| `POST /items/thread-tape-classification`에 권한 제한이 없어 USER도 소요량/발주/INVOICE 환산에 직접 영향을 주는 종류 지정을 바꿀 수 있었음 | `export-shipment-defaults.controller.ts`와 같은 방식으로 `@UseGuards(RolesGuard)` + `@Roles(UserRole.MANAGER, UserRole.ADMIN)` 적용. `GET thread-tape-candidates`와 품목 CRUD는 바꾸지 않음(그대로 인증만 필요). |
| 요청 본문이 인라인 타입이라 형식이 틀리면(itemId가 문자열, assignments가 배열이 아님 등) 400이 아니라 500이 날 수 있었음 | `ClassifyThreadTapeDto`(`src/items/dto/classify-thread-tape.dto.ts`) + `ThreadTapeClassificationAssignmentDto` 신설. `assignments`는 1~500건 배열, `itemId`는 정수, `materialSubType`은 문자열 또는 null만 허용(`class-validator`) — 형식 오류는 전역 `ValidationPipe`가 400으로 거절. |
| 프론트: USER도 "선택 적용" 버튼을 누를 수 있어 403을 만났음 | `ThreadTapeClassificationManager.tsx`에 `getCurrentUser()`(StylesManager 등에서 쓰는 기존 패턴 재사용)로 역할 확인 → MANAGER/ADMIN이 아니면 버튼 대신 "관리자/매니저만 적용할 수 있습니다." 안내로 교체(목록 조회는 그대로 유지). |

### 테스트
- `item-thread-tape-classification-flow.e2e-spec.ts`에 7건 추가(기존 4건 유지, 총 11건): USER 토큰 403(미적용 확인 포함) 1건, USER도 후보 조회는 그대로 됨 1건, MANAGER 토큰 성공(회귀 확인) 1건, 잘못된 형식(itemId 문자열/assignments 비배열/501건 초과/materialSubType 숫자) 400 4건.
- `ThreadTapeClassificationManagerLabels.test.tsx`에 1건 추가: 권한 확인 전(기본값, `currentUser=null`)에는 "선택 적용" 버튼이 아니라 권한 안내 문구가 보이는지 확인(이 환경은 jsdom 상호작용 시뮬레이션이 없어 렌더 직후의 동기 상태만 검증 가능 — MANAGER로 해석된 뒤의 버튼 노출은 직접 확인하지 못했고, 코드 리뷰로 로직을 검증했다).

### 검증 결과(PR-186-FIX 반영 후 전체 재실행)

| 항목 | 결과 |
|---|---|
| `npm run build` (백엔드) | 통과 |
| backend `jest` 전체 | 61 suites / 779 tests 통과 |
| backend e2e 전체(`--maxWorkers=2`) | 65 suites / **504 tests** 통과 (신규 7건 포함) |
| frontend `tsc --noEmit` | 통과 |
| frontend `npm run build` | 통과 |
| frontend `vitest run` 전체 | 50 files / **320 tests** 통과 (신규 1건 포함) |

### 하지 않은 것(명시적 지시 준수)
- 마이그레이션 `1791800000000`은 그대로 — 추가/변경 없음.
- `material_packaging_unit_rules` 테이블 변경 없음(`POLY_JINUIDO` 매칭 문제는 그대로 둠).

### 새 SHA
이 보고서를 포함한 커밋까지 push 완료 — 최종 SHA는 `git log --oneline -1 feat/item-thread-tape-subtype`로 확인.

## 10. 운영 복사본 검증 (MERGE-7, Neon 테스트 브랜치)

- 테스트 브랜치: `ep-hidden-bonus-b37lym8r.c-4.ap-southeast-1.aws.neon.tech`(운영 복사본, 버려도 되는 사본). `origin/main`을 먼저 브랜치에 병합(FIX-1 반영, `app.module.ts` 자동 병합 — 충돌 없음), 빌드/전체 테스트 재확인 후 진행.

### 마이그레이션 적용/되돌리기/재적용 검증

| 단계 | 결과 |
|---|---|
| `migration:show`(적용 전) | `1791700000000`(PR-185), `1791800000000`(PR-186)만 `[ ]` 미적용 — 나머지 40건은 전부 적용됨(FIX-1 포함) |
| `migration:run` | 2건 모두 에러 없이 적용 |
| 확인(읽기) | `purchase_order`에 `styleNo`/`referenceUnitPriceUsd`/`referencePriceSource`/`referencePriceNote` + `IDX_purchase_order_styleNo` 인덱스 존재. `brand_price_rules`에 뮤트 3행(겉감 $1.00/YD, 안감 $0.15/YD, 행어 $0.001/EA) 정확히 시드. `items`에 `materialSubType`/`packagingReviewedAt` 존재, 적용 직후 두 컬럼 다 `NULL`인 행 수 = 0건(= 아무것도 자동으로 채워지지 않음, 설계대로). |
| 기존 데이터 불변 확인 | `purchase_order`: 1건, qty 합 7, unitPrice 합 0.01 — 적용 전/후 동일. `items`: 355건, `unit` 분포(전부 `EA`) — 적용 전/후 동일. 기존 `purchase_order.styleNo IS NOT NULL` 건수 = 0(기존 1건은 그대로 미연결 유지). |
| `migration:revert` ×1 | `1791800000000`만 되돌려짐(`items` 두 컬럼 DROP) — `migration:show` 재확인 결과 `1791700000000`은 그대로 `[X]` 적용 상태 유지, `1791800000000`만 `[ ]`로 복귀 |
| `migration:revert` ×1(두 번째) | `1791700000000`도 되돌려짐(`brand_price_rules` DROP, `purchase_order` 4컬럼 + 인덱스 DROP) |
| `migration:run`(재적용) | 2건 모두 에러 없이 다시 적용, 뮤트 시드 3행도 `ON CONFLICT DO NOTHING`으로 정상 재삽입 |

### 실데이터 라이브 검증(Puppeteer, MANAGER로 승격한 테스트 계정)

실제 스타일 `MB72JKM101A`의 BOM에 들어있는 미검토 실 자재(`오바사 60S/3H THREAD`, id 129, consumption 470, `Item.unit='EA'`)로 전체 흐름을 확인했다.

1. **종류 지정 전**: 소요량 조회에서 `conversionWarning: "실/테이프 종류 미지정 — 선택해 주세요"`만 뜨고 `packaging` 필드는 없음(미터 수량 추측 안 함) — 설계대로.
2. **실/테이프 후보 조회**(`GET /items/thread-tape-candidates?reviewed=false`): 이 자재가 추천 `OBA_SA_SKU_I_SA`("오바사·스쿠이사", 이유: 자재명에 "오바사" 포함)와 함께 나옴. 스크린샷(`docs/merge7-screenshots/02-thread-tape-classification.png`)에서 실제 후보 54건 전체가 추천값과 함께 렌더되는 것을 확인(실제 운영 데이터 — 다데/암홀/코아사/오바사 혼재).
3. **일괄 지정 적용**(`POST /items/thread-tape-classification`, MANAGER 토큰): `{ "updated": 1 }` 성공.
4. **종류 지정 후**: 같은 소요량 조회에서 `conversionWarning`이 사라지고 `packaging: { packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 1, conversionFormula: '470m ÷ 4000m/콘 = 0.12 → 1콘' }`로 채워짐 — **`Item.unit`이 `'EA'`로 남아있는데도 콘 환산이 정상 동작**(이게 이 PR의 핵심 목표였다).
5. **영향 범위 확인**: 같은 스타일 BOM의 라벨 자재(`MAIN+SIZE LABEL 메인라벨`, id 125)는 `packaging`/`conversionWarning` 둘 다 없이 그대로(일반 자재로 취급) — 종류 지정이 다른 자재에 번지지 않음을 직접 비교로 확인.
6. **BOM 미포함 자재 400**: 같은 스타일에 없는 자재(id 461)로 스타일 연결 시도 → 400, 메시지 "이 스타일 자재명세에 없는 자재입니다 — 스타일과 연결하지 말고 '스타일 미연결' 발주로 등록하세요."(PR-185 로직, PR-186과 함께 정상 작동 확인).
7. **화면 스크린샷**: `01-purchase-orders.png`(발주관리 — 트랙 필터, 스타일 배지), `02-thread-tape-classification.png`(실/테이프 종류 지정 화면 — MANAGER 계정으로 "선택 적용" 버튼이 활성 상태로 보임, PR-186-FIX의 권한 분기가 의도대로 동작함을 시각적으로도 확인).

### 남긴 테스트 데이터

이 Neon 테스트 브랜치는 "버려도 되는 복사본"으로 명시적으로 허용된 곳이라, 테스트 발주(5건), 테스트 계정(1건), 실 자재 2건(`id 129`, `id 280` — 이전 점검에서 이미 분류돼 있었음)의 `materialSubType` 지정을 정리하지 않고 그대로 두었다. main/운영 DB에는 어떤 쓰기도 하지 않았다(0단계 전부 읽기 전용).
