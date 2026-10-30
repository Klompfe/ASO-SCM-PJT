# PR-216 — 테이프/실 필요량을 "정수 + 포장단위(롤/콘)"로 표시

브랜치: `feat/package-unit-display` (base: `origin/main` 4a062aa, MERGE-18 반영 커밋) · 병합은 하지 않음.

## 1. 점검(기존 코드 조사)

### 1-1. "필요량"을 보여주는 화면 전수 조사

| 화면/파일 | 데이터 출처 | 기존 상태 | 이번 PR 조치 |
|---|---|---|---|
| `StyleShortagePanel.tsx` (스타일별 부족 자재 표) | 서버 계산(`work-orders/style-requirements`) — `MaterialRequirementRow.packaging` | 이미 `r.packaging` 있으면 `${requiredPackages}${label}`(정수)로 표시 — **버그 없음** | 중복 3군데 삼항식을 공용 헬퍼(`formatRequirementQty`/`formatCountOrQty`)로 통일(동작 변경 없음) |
| `BomRequirementReport.tsx` (BOM 소요명세서) | 같은 `MaterialRequirementRow` | **버그**: `r.packaging`을 전혀 보지 않고 `fmt()`(소수 최대 4자리)만 사용 — 실/테이프 행도 "120.0000콘"처럼 소수로 보임 | 공용 헬퍼로 `r.packaging` 분기 추가, `conversionFormula`/`conversionWarning` 표시도 추가(StyleShortagePanel과 동일) |
| `MappingPreviewModal.tsx` (MATERIAL LIST 업로드 미리보기) | 엑셀 파싱 직후 원시 값(`section-parser.util.ts`의 `parseBomItems`) — `threadType`/`tapeType`/`materialSubType` **없음** | 포장단위 변환 없이 `item.requiredQty` 그대로(소수) 노출 — **이번 지시서가 지적한 화면, 가장 시급** | 자재명에서 종류를 추론(아래 1-3)해 확정되면 정수+단위, 확정 안 되면 경고만. §2 참고 |
| `ItemsManager.tsx` (자재 BOM 행 편집) | `BomItem` 엔티티(이미 threadType/tapeType 있음) | `it.requiredQty`를 그대로(가공 없이) 보여줌 — 포장단위 변환 자체가 없음 | **범위 밖으로 둠**(이번 지시서의 우선순위 3곳에 없음, 조사만) |
| `PurchaseOrdersManager.tsx` + `purchaseOrderForm.ts` (`suggestStyleLinkedQuantity`/`suggestUnlinkedQuantity`) | `row.packaging.shortagePackages`(이미 정수) | **이미 정수** — 발주 수량 초기값은 콘/롤 단위일 때 소수가 나온 적이 없음(코드 확인) | 변경 없음(§3에서 재확인 기록) |
| `ExportShipmentManager.tsx` (환산 후보 안내, L.712) | `mido-price-table`의 `conversion.options`(PR-182) | `${opt.displayName}({opt.packagingUnitLabel}, {opt.unitLengthM}m): {opt.formula}` — 이미 정수 포장수량과 산식을 보여줌 | 읽기 전용 확인만, 수정 없음 |
| 그 외 금액/무게/CBM 표시(`ExportShipmentManager.tsx` L.637~655) | `toFixed(2)`/`toFixed(4)` | 돈·무게는 정수화 대상이 아님(소수가 맞는 값) | 범위 아님 |

### 1-2. 소요량 계산(`material-requirements.util.ts`) 라운딩 순서 재확인

`calculateMaterialRequirements`는 **색상별로 먼저 `Math.ceil(meters / unitLengthM)`을 구하고, 그 정수들을 합산**해 `requiredPackages`를 만든다(합산 후 한 번에 ceil이 아님). 이 계산 로직은 이번 PR에서 바꾸지 않았다(지시서의 "계산 로직 동결" 그대로 — 변경 파일에 `material-requirements.util.ts`는 없음).

### 1-3. MappingPreviewModal용 종류 추론 — 재사용 vs 복제

- `ThreadTapeClassificationManager.tsx`(기존 PR-186)는 이미 **DB에 저장된 Item**을 대상으로 서버가 계산한 추천(`getThreadTapeCandidates`)을 그대로 보여준다 — 이 엔드포인트는 Item 엔티티 전제라 MappingPreviewModal의 "아직 저장 전인 파싱 결과"에는 쓸 수 없다.
- 백엔드 `src/common/utils/packaging-subtype.util.ts`의 `looksLikeThreadOrTape`/`buildThreadTapeSuggestion`은 자재명 문자열 + 규칙 배열만 받는 순수 함수라 재사용 가능한 로직이지만, 프론트는 별도 TS 프로젝트라 그대로 import할 수 없다. `frontend-app/src/utils/multiStyleBulkOrder.ts`의 `materialSubTypeLabel`이 이미 쓰고 있는 "작은 순수 함수만 미러링" 패턴을 그대로 따라, `frontend-app/src/utils/materialRequirementDisplay.ts`에 동일 로직을 복제했다(§2).

### 1-4. 규칙 테이블 확인 — 코아사/오바사/암홀/다데

`src/migrations/1791100000000-AddMaterialPackagingUnitRulesAndTapeType.ts`(유일한 시드)에서 확인:

| materialSubType | displayName | packagingUnitLabel | unitLengthM | 지시서의 값 | 일치 여부 |
|---|---|---|---|---|---|
| COA_SA | 코아사 | 콘 | **2500** | 2500M/CONE | ✅ |
| OBA_SA_SKU_I_SA | 오바사·스쿠이사 | 콘 | **4000** | 4000M/CONE | ✅ |
| DADE | 다데 | 롤 | **50** | 50/ROLL | ✅ |
| AMHOL | 암홀 | 롤 | **50** | **100/ROLL** | ❌ **불일치** |

**⚠ 암홀(AMHOL)만 DB 시드가 50m/롤인데 지시서는 100/ROLL로 적혀 있습니다.** 코드·마이그레이션 전체를 다시 검색해도 AMHOL 값을 고친 마이그레이션은 없습니다(이 하나뿐). 이번 PR은 "계산/데이터를 바꾸지 않는다"는 지시이고 단위 환산 상수 추가도 금지돼 있어, **기존 50m/롤 값을 그대로 쓴 채 표시만 정수화했습니다**. 실제 암홀 길이가 100m가 맞다면 데이터 수정(마이그레이션)이 필요하며, 이는 이번 PR 범위 밖이라 별도로 확인/진행을 부탁드립니다.

## 2. 구현 — 공용 표시 유틸

새 파일 `frontend-app/src/utils/materialRequirementDisplay.ts` (테스트: `materialRequirementDisplay.test.ts`, 14건):

- `formatRequirementQty(qty, packaging?)` / `formatCountOrQty(qty, packagingCount?, label?)` — `packaging`/`packagingCount`가 있으면 `"N{단위}"`(정수)만, 없으면 기존과 동일한 소수 표시(`maximumFractionDigits: 4`) — **일반 자재(겉감 등)의 소수 표시는 그대로 유지**(미터 단위 요척은 소수가 맞는 값이라 정수화하지 않음).
- `looksLikeThreadOrTape`/`buildThreadTapeSuggestion` — 백엔드 `packaging-subtype.util.ts`를 미러링(§1-3).
- `ceilWithEpsilon(value, divisor)` — `Math.ceil(value/divisor - 1e-9)`. 부동소수점 오차(예: `0.1+0.2`형 누적 오차)로 경계값에서 한 단위 더 올라가지 않게 하는 보정. **기존 계산 로직(`material-requirements.util.ts`)에는 이 보정을 넣지 않았다** — 저장된 계산 결과는 바꾸지 않는다는 지시에 따라, 이번에 새로 클라이언트에서 계산하는 값(MappingPreviewModal, §2-1)에만 적용.
- `computeRawRowPackaging(itemName, requiredQty, rules)` — MappingPreviewModal 전용. 종류가 하나로 확정되면 `{status:'DETERMINED', packages, unitLabel, formula}`, 실/테이프로는 보이지만 종류를 하나로 못 정하면(0건/2건 이상 매칭, 또는 매칭된 종류의 규칙이 없음) `{status:'AMBIGUOUS', warning}`(추측해서 계산하지 않음), 그 외(일반 자재)는 `{status:'NOT_APPLICABLE'}`.

### 2-1. 화면별 적용

- **`MappingPreviewModal.tsx`**(최우선): 모달이 열릴 때 `getMaterialPackagingUnitRules()`로 규칙을 불러와(`packagingRules` state), BOM 표의 "필요량" 칸에서 `computeRawRowPackaging(item.itemName, item.requiredQty, packagingRules)`를 호출. 확정되면 `"3롤"` + 산식 한 줄, 애매하면 원래 값 + "⚠ 실/테이프 종류 확인 필요" 경고, 일반 자재는 변경 없음. 규칙 로딩 실패/빈 배열이어도 기존 표시로 안전하게 폴백(경고만 못 띄울 뿐 값이 사라지지 않음).
- **`BomRequirementReport.tsx`**: §1-1에서 찾은 버그 수정 — `formatRequirementQty`/`formatCountOrQty`로 필요/이미발주/부족 수량 칸을 StyleShortagePanel과 동일하게 표시, `conversionFormula`/`conversionWarning`도 함께 노출.
- **`StyleShortagePanel.tsx`**: 기존 동작은 바꾸지 않고 중복 삼항식만 같은 공용 함수 호출로 통일(리팩터링, 렌더 결과 동일 — 기존 `StyleShortagePanelLabels.test.tsx`가 그대로 통과함으로 확인).
- **`PurchaseOrdersManager.tsx`**: 코드 변경 없음 — `suggestStyleLinkedQuantity`/`suggestUnlinkedQuantity`가 이미 `shortagePackages`(정수)를 초기값으로 채우고 있음을 재확인만 했다(§1-1 표).

### 2-2. 단위 확인 필요(시트 단위 vs 규칙 단위) 경고 — 구현하지 않음, 이유

`section-parser.util.ts`의 `parseBomItems`가 돌려주는 BOM 행에는 `{category, itemName, consumption, requiredQty, colorOf, spec}`뿐이며 **시트의 "단위" 열을 읽는 코드가 없다.** 실제 MATERIAL LIST 템플릿에서 "UNIT" 상위헤더가 걸린 칸(I열)의 하위헤더는 실제로 "SPEC"(규격)으로 쓰여 있어(사용자가 겸용 테이프 길이단위(Y/M)를 아직 미확정이라고 한 것과도 맞물림), 이 칸이 정말로 "소비 단위(M/Y/EA)"를 뜻하는지 코드만으로 확신할 수 없었습니다. 추측으로 열을 하나 골라 비교하면 틀린 경고를 낼 위험이 있어, **이 화면에서는 "단위 확인 필요" 경고를 구현하지 않았습니다**(계산 로직 추가 금지 지시와도 맞물려 멈추고 보고합니다). 시트의 실제 단위 열 위치가 확정되면 후속 PR에서 `parseBomItems`에 단위 필드를 추가하는 것부터 시작해야 합니다.

## 3. 테스트

- `frontend-app/src/utils/materialRequirementDisplay.test.ts` — 14건(위 §2의 모든 분기: epsilon 경계, 종류 추론 0/1/2건 매칭, DETERMINED/AMBIGUOUS/NOT_APPLICABLE).
- `frontend-app/src/components/MappingPreviewModalPackaging.test.tsx` — 4건(확정/애매/일반자재/규칙미로딩 폴백).
- 기존 `StyleShortagePanelLabels.test.tsx`, `PriceReferenceBlockLabels.test.tsx` 등은 수정 없이 그대로 통과(리팩터링이 렌더 결과를 바꾸지 않았음을 확인).

## 4. 검증

| 항목 | 기준(바닥) | 결과 |
|---|---|---|
| 백엔드 jest | 1057 | **1057 통과**(백엔드 코드 변경 없음 — 그대로) |
| e2e | 558 | **바닥 미달성(환경 문제, 아래 설명)** |
| 프런트 vitest | 500 | **522 통과** |
| 프런트 build | 성공 | **성공**(`tsc -b && vite build`, 경고만 — 기존 청크 크기 경고, 이번 변경과 무관) |

**e2e 실패에 대해**: 이번 PR은 `frontend-app/` 바깥 파일을 전혀 건드리지 않았습니다(`git diff --stat 4a062aa..HEAD`로 확인 — 백엔드 변경 0건). 그런데도 e2e를 3회 실행(병렬, 병렬, `--runInBand`)한 결과 실패 건수가 매번 달랐고(59/546, 39/558, 32/558), **실패한 모든 건이 예외 없이 같은 원인**이었습니다 — 서로 무관한 스펙 파일(`bom-active-review-flow`, `purchase-order-search-flow`, `mapping-flow` 등)에서 전부 `beforeAll`의 `Test.createTestingModule({imports:[AppModule]}).compile()`이 Jest 기본 훅 타임아웃(5000ms)을 넘겼다는 동일한 에러였습니다. 이는 이 머신에서 NestJS 앱 전체를 매 스펙 파일마다 다시 부트스트랩하는 비용이 5초 타임아웃보다 길어질 때 생기는 환경 문제로 보이며, 이번 PR이 만든 변경과는 무관합니다(백엔드 코드를 전혀 바꾸지 않았으므로 이 PR이 원인이 될 수 없습니다). 이 문제는 이번 PR 범위 밖이며(e2e 타임아웃 설정은 백엔드 테스트 인프라 변경으로, "표시 로직만 바꾼다"는 지시와 별개의 작업입니다), 별도로 확인이 필요합니다.

## 5. 열린 사항(사용자 확인 필요)

1. **암홀(AMHOL) 포장단위 — 50m/롤(현재 DB) vs 100/ROLL(이번 지시서)**: 어느 쪽이 맞는지 확인 부탁드립니다. 맞다면 별도 마이그레이션 PR이 필요합니다(§1-4).
2. **MATERIAL LIST 시트의 실제 "단위" 열 위치/의미**: `section-parser.util.ts`가 이 열을 전혀 읽지 않습니다(§2-2). Y/M 단위 정책이 확정되고, 시트에서 어느 칸이 소비단위를 뜻하는지 확인되면 파서에 단위 필드를 추가하는 후속 PR이 필요합니다.
3. `ItemsManager.tsx`의 BOM 행 편집 표(`it.requiredQty`)는 이번 지시서의 우선순위 3곳(MATERIAL LIST 업로드/소요명세서/발주폼)에 없어 손대지 않았습니다 — 필요하면 별도로 알려주세요.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
