# PR-188R — 미병합 PR-188(미도 단가표 관리)을 현재 main 위로 리베이스

브랜치: `feat/mido-price-table-admin-r1` (원본 `feat/mido-price-table-admin` `a0fee26`에서 분기, `origin/main` `c1269d3` 병합). **main에 병합하지 않음. 원본 브랜치는 건드리지 않음.**

사전 확인: `origin/feat/mido-price-table-admin` head = `a0fee26`(일치). `git log origin/main --oneline --grep="PR-204"` → PR-204가 main에 있음(MERGE-15로 반영됨, `d6ce933`/`c1269d3`) 확인됨. 하한은 `docs/MERGE-15-report.md`의 숫자: 백엔드 1012 / e2e 557 / 프런트 495.

## 충돌 해결 내역 (3건)

| 파일 | 성격 | 해결 방식 |
|---|---|---|
| `src/export-shipments/export-shipments.service.ts` | **기계적(순수 추가)** — PR-188 쪽(`classifyBrand` import, 원단 라인 단위를 `brand_prefix_rules.fabricLineUnit`으로 결정하는 로직용)과 main 쪽(`Bom`/`resolveBomItemForPurchaseOrder` 등, 발주-BOM 연결/`confirmLinePrice` 관련 유틸)이 같은 import 블록에 서로 다른 줄을 추가한 것뿐 — 로직 중복·모순 없음. | 두 import 블록을 그대로 합침(양쪽 다 유지) |
| `src/mido-price-table/mido-price-table.service.spec.ts` | **기계적(순수 추가)** — PR-188의 새 `describe('관리 API')` 블록과 PR-204의 새 `it.each` 꺾쇠 테스트가 같은 지점(기존 describe의 닫는 `}` 바로 앞)에 각각 삽입됨. | PR-204 테스트를 기존 "PR-182 환산" describe 안에 먼저 넣고, 그 describe를 닫은 뒤 PR-188의 "관리 API" describe를 이어 붙임(둘 다 그대로 보존) |
| `frontend-app/src/components/PriceReferenceBlock.tsx` | **의미 충돌** — PR-188의 `result?.note`(미도 브랜드가 아니면 단가표 조회 자체를 안 하고 그 이유를 안내)와 PR-204의 `shouldShowNoMatchNotice(result)`(후보 0건+경고 없음이면 "못 찾음" 안내)가 같은 자리를 다퉜고, 두 조건이 상당 부분 겹쳐(미도 아닌 브랜드는 거의 항상 후보도 0건) **동시에 두 안내가 뜰 수 있었다.** 1차 보고 후 **사용자 지시(2안)**로 해결: `noMatchNoticeText(result, itemName)` 함수를 새로 만들어 `note`가 있으면 그것만, 없고 `shouldShowNoMatchNotice`가 참이면 PR-204 문구만 반환(둘 다 거짓이면 null) — 두 안내가 동시에 뜨지 않게 하나로 합침. 이 우선순위를 고정하는 테스트 3건 추가(`PriceReferenceBlockLabels.test.tsx`: note 있음→note만 / note 없음+후보0+경고없음→PR-204 문구만 / 둘 다 거짓→null). | 사용자 결정대로 해결·테스트 추가·머지 완료 |

## 마이그레이션 타임스탬프

| 항목 | 값 |
|---|---|
| 이 브랜치의 마이그레이션 | `1791900000000-AddBrandTableCodeAndFabricLineUnit.ts` |
| `ls src/migrations \| sort \| tail` 기준 main의 최대 타임스탬프(병합 후) | `1791900000000`(바로 이 파일 자신) — **main에 이보다 큰 타임스탬프 없음** |
| 변경 필요 여부 | **불필요.** 이미 전체 `src/migrations/`에서 가장 큰 값이라 그대로 둠(파일명·클래스명 변경 없음) |

## 마이그레이션 추가 전용(additive) 재확인

```sql
-- up() 전체
ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "priceTableCode" character varying;
ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "fabricLineUnit" character varying;
ALTER TABLE "mido_price_items" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

UPDATE "brand_prefix_rules" SET "priceTableCode"='MIDO'
  WHERE "brandName" IN ('미센스','반에크','루미에반') AND "priceTableCode" IS NULL;
UPDATE "brand_prefix_rules" SET "fabricLineUnit"='M'
  WHERE "brandName" IN ('빈폴','에잇세컨즈') AND "fabricLineUnit" IS NULL;
```

| 확인 항목 | 결과 |
|---|---|
| 컬럼 삭제·타입 변경 | 없음 — `ADD COLUMN IF NOT EXISTS` 3건뿐, 전부 nullable 또는 `DEFAULT true` |
| 데이터 보정 범위 | `IS NULL` 조건으로 한정 + 브랜드명 화이트리스트(5개 브랜드)만 — 다른 행은 전혀 건드리지 않음 |
| `down()` 대칭 여부 | 대칭. `up()`에서 추가한 3개 컬럼을 `DROP COLUMN IF EXISTS`로 역순(`isActive`→`fabricLineUnit`→`priceTableCode`) 제거 — `up()`의 데이터 보정 UPDATE는 컬럼 자체가 삭제되므로 별도 역작업 불필요 |

**결론: 순수 추가 전용(additive-only) 마이그레이션, 삭제·파괴적 변경 없음.**

## 합친 뒤 동작 확인 (코드 읽기 + 테스트)

| 확인 항목 | 결과 |
|---|---|
| PR-204 꺾쇠 토큰 처리 생존 여부 | `mido-price-table.service.spec.ts`의 `it.each` 8건(`암홀<실크>`→1건 등) 전부 통과(아래 테스트 숫자 참고) |
| CSV 일괄 등록 — 같은 이름 행의 "변경"은 기본 해제 | `frontend-app/src/utils/midoPriceImport.ts:defaultSelectedLines`: `status === 'NEW'`인 행만 기본 체크, **`CHANGED`는 전부 기본 해제**(이름 무관, 다데·암홀 포함 전체 행에 적용되는 일반 규칙). 미리보기 배지는 `신규`(초록)/`변경`(파랑)/`동일`(회색)/`오류`(빨강) 4종으로 구분(`MidoPriceTableManager.tsx:30,33-34`) |
| 권한 제한 — PR-203과 같은 방식인가 | **백엔드는 동일.** `mido-price-table.controller.ts`의 `POST`/`PATCH`/`POST import/apply`(쓰기)에 `@UseGuards(RolesGuard)` `@Roles(UserRole.MANAGER, UserRole.ADMIN)` — `material-packaging-unit-rules.controller.ts`(PR-203)와 똑같은 패턴. `GET`/`GET candidates`/`POST import/preview`(읽기·미리보기)는 무제한. **프런트는 다르다 — 갭 발견:** `Sidebar.tsx:97`의 `{ id: 'midoPriceTable', label: '미도 단가표' }`에 **`adminOnly: true`가 없다.** `isItemVisible`에도 `midoPriceTable` 분기가 없어 **일반 USER에게도 메뉴가 보인다**(클릭해서 들어가면 쓰기는 403으로 막히지만, 메뉴 자체는 PR-203의 `materialPackagingUnitRules`처럼 숨겨지지 않음). 이 PR의 작업 지시서(6번 항목이 요구한 "일반 USER에게는 숨겨짐")와 실제 코드가 **일치하지 않는다** — 이번 PR-188R에서는 지시된 절차(충돌 해결·타임스탬프·검증)만 수행했고 이 갭은 고치지 않았다. MERGE 단계 전에 결정 필요(Sidebar에 `adminOnly: true` + `isItemVisible` 분기 추가 여부) |

## 변경 파일 (33개, `origin/main...feat/mido-price-table-admin-r1`)

```
frontend-app/src/App.tsx
frontend-app/src/api/brandPrefixRules.service.ts
frontend-app/src/api/midoPriceTable.service.ts
frontend-app/src/api/purchaseOrders.service.ts
frontend-app/src/components/BrandManager.tsx
frontend-app/src/components/MidoPriceTableManager.tsx
frontend-app/src/components/MidoPriceTableManagerLabels.test.tsx
frontend-app/src/components/PriceReferenceBlock.tsx
frontend-app/src/components/PriceReferenceBlockLabels.test.tsx
frontend-app/src/components/Sidebar.tsx
frontend-app/src/utils/midoPriceImport.test.ts
frontend-app/src/utils/midoPriceImport.ts
prompt-reports/PR-188-report.md
src/brand-prefix-rules/brand-prefix-rules.service.ts
src/brand-prefix-rules/dto/create-brand-prefix-rule.dto.ts
src/brand-prefix-rules/entities/brand-prefix-rule.entity.ts
src/export-shipments/export-shipments.service.ts
src/mido-price-table/dto/create-mido-price-item.dto.ts
src/mido-price-table/dto/import-mido-price-apply.dto.ts
src/mido-price-table/dto/import-mido-price-preview.dto.ts
src/mido-price-table/dto/update-mido-price-item.dto.ts
src/mido-price-table/entities/mido-price-item.entity.ts
src/mido-price-table/mido-price-table.controller.ts
src/mido-price-table/mido-price-table.service.spec.ts
src/mido-price-table/mido-price-table.service.ts
src/mido-price-table/utils/mido-price-csv-parser.util.spec.ts
src/mido-price-table/utils/mido-price-csv-parser.util.ts
src/migrations/1791900000000-AddBrandTableCodeAndFabricLineUnit.ts   (신규, 1개뿐)
src/purchase-orders/price-reference.service.spec.ts
src/purchase-orders/price-reference.service.ts
test/export-shipments-flow.e2e-spec.ts
test/mido-price-table-admin-flow.e2e-spec.ts
test/purchase-order-style-pricing-flow.e2e-spec.ts
```

마이그레이션 변경 **정확히 1개**(`git diff origin/main --stat -- src/migrations/` 확인), `package.json`/락 파일 변경 **0건**.

## 테스트 숫자 (전/후)

| 항목 | 하한(MERGE-15 기준) | 이번 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 1012 이상 | **1051** |
| e2e(`--maxWorkers=2`) | 557 이상 | **572** |
| 프런트 `vitest run` | 495 이상 | **504** |
| 백엔드/프런트 `tsc`·`build` | 통과 | **통과** |

전부 하한 충족, 실패 0건.

## 사람이 화면에서 확인할 것 (MERGE 단계 후)

1. 마스터·설정에 "미도 단가표" 화면이 보인다 — **단, 위에서 확인했듯 지금은 USER 계정에도 보인다(버그/갭).** MERGE 전에 `adminOnly` 추가 여부를 결정해야 한다.
2. 기존 6행 시드(겉감 2종·심지 1종·실 1종·테이프 2종)가 목록에 보인다.
3. CSV 미리보기에서 "신규"(초록)/"변경"(파랑)/"동일"(회색)/"오류"(빨강) 배지가 구분되어 보이고, "변경" 행은 체크박스가 기본적으로 꺼져 있다.

## 이번 PR에서 하지 않은 것

단가표 값(CSV) 등록, DB 접근, 암홀 단위 정책(YD/M) 코드 추가 — 전부 손대지 않음. 발견된 Sidebar `adminOnly` 누락도 **수정하지 않고 보고만** 했다(지시서에 명시된 작업이 아니라 결정이 필요한 사안).

## 브랜치 상태

병합하지 않음 — `feat/mido-price-table-admin-r1`만 push됨. 원본 `feat/mido-price-table-admin`(`a0fee26`)은 수정·삭제하지 않음.
