# 통합 병합 보고서 (MERGE-1~4)

## 선행 조건 재확인

지시서(MERGE-4)는 MERGE-1~3이 이미 완료되어 `integration/pr171-182`가 푸시되어 있는 상태를 전제했습니다.
실제로는 그 작업이 이 저장소에 없었습니다 — `integration/pr171-182` 브랜치, `backup/pre-integration-20261005` 태그,
`prompt-reports/` 디렉터리 모두 존재하지 않았습니다. 제시님께 확인 후 "MERGE-1~3부터 지금 수행"으로 진행했습니다.

이후 별도로 전달된 MERGE-1 지시서는 병합 순서를 171→175→181→179/180(MERGE-1), 173(MERGE-2), 176(MERGE-3)으로
나누도록 지정했지만, 다음 두 가지가 그 지시서의 전제와 달랐습니다: (1) PR-175는 이미 이 세션에서 `main`에
직접 병합·브랜치 삭제된 상태였고, (2) `integration/pr171-182`는 이미 171·173·181·176·180 다섯 건 모두가
병합·검증·푸시된 상태였습니다. 제시님께 확인한 결과 **기존 `integration/pr171-182`를 그대로 인정**하고
MERGE-1~3을 완료된 것으로 보기로 했습니다 — 아래 내용(병합 순서 171→173→181→176→180)이 실제로 수행된 내용이며,
MERGE-1 지시서의 단계별 지침(충돌 해결 방법 등)은 참고로만 대조했습니다.

## 백업

- 태그 `backup/pre-integration-20261005` → `main`의 병합 시작 시점 커밋(`85aeb18`, PR-175 병합 직후)에 로컬로 생성.
  푸시하지 않음(지시대로 로컬 유지).

## 병합 순서 및 커밋

`integration/pr171-182`를 `main`(`85aeb18`)에서 분기해, 5개 미병합 브랜치를 한 건씩 `--no-ff`로 병합하고
병합마다 전체 검증을 통과시켰습니다.

| 순서 | PR | 브랜치 | 병합 커밋 SHA | 충돌 |
|---|---|---|---|---|
| 1 | PR-171 | feat/supplier-main-items | `b8b4677` | 없음 |
| 2 | PR-173 | feat/cmt-po-unit-price-optional | `a5a8392` | 2건 |
| 3 | PR-181 | feat/handwritten-cmt-price-draft | `c9a09e4` | 2건 |
| 4 | PR-176 | feat/purchase-order-color-size-lines | `57c9637` | 5건 |
| 5 | PR-180 (+PR-179 포함) | feat/purchase-order-type | `b584481` | 5건(+ 자동병합 후 수동 수정 1건) |

최종 `integration/pr171-182` HEAD: `b5844814ebc4f4cab087e3a386c183ceed0a3baf`

## 충돌 해결 요약

공통 규칙(양쪽이 각자 다른 것을 추가한 충돌은 양쪽 모두 남김)을 따랐습니다. 아래는 실제로 "같은 로직을 서로
다르게 고친" 판단이 필요했던 경우만 적었습니다(나머지는 import 줄/함수/describe 블록을 단순히 합친 것).

1. **`CreatePurchaseOrder`(프론트)/`CreatePurchaseOrderDto`(백엔드)의 `quantity`/`unitPrice` optional 여부**
   (PR-173 vs PR-176): PR-173은 `unitPrice`를 선택값으로, PR-176은 `quantity`를 선택값으로 바꿨습니다.
   둘 다 선택값으로 유지하도록 합쳤습니다(라인이 있으면 수량 생략 가능 + CMT면 단가 생략 가능, 둘은 서로 다른
   필드라 충돌하지 않음).
2. **`PurchaseOrdersManager.tsx`의 `handleCreate`** (PR-173 vs PR-176, 이후 PR-180과 다시): 단가 undefined
   처리(PR-173) + 라인 합계/경고 payload 구성(PR-176) + 발주 구분 검증·payload(PR-180)를 모두 포함하도록
   합쳤습니다. 검증 3개를 순서대로 모두 거치고, 최종 payload에 unitPrice/lines/orderType을 함께 담습니다.
3. **빌드 에러(자동병합 후 발견)**: `purchase-orders.service.ts`에서 `import { BomItem } from '../boms/entities/bom-item.entity';`가
   PR-173·PR-180 양쪽에서 각각 추가되어 충돌 표시 없이 중복 import된 채 자동병합됐습니다(텍스트가 완전히
   동일해 git이 충돌로 보지 않음). `npm run build`에서 `TS2300: Duplicate identifier 'BomItem'`로 드러나
   한 줄 삭제로 수정했습니다. — **이 경로로 들어오는 조용한 자동병합 결함이 있을 수 있어, 병합마다 빌드를
   반드시 돌리는 절차가 유효함을 재확인했습니다.**

## 마이그레이션 적용 (개발/테스트 DB에만)

적용 DB: `.env`에 설정된 Neon 데이터베이스(`neondb`, host `ep-soft-sound-b3lvd0oe...`) — 이 저장소에는
별도의 운영(production) DB 설정이 없고, 이 세션 전체(PR-171~182)에서 계속 써온 개발/테스트 DB입니다.
**운영 DB에는 실행하지 않았습니다.**

적용 순서(오름차순, 중복 없음 확인):
1. `1791000000000-AddSupplierMainItems` — 이미 적용돼 있었음(이전 세션)
2. `1791100000000-AddMaterialPackagingUnitRulesAndTapeType` — 이미 적용돼 있었음
3. `1791200000000-AddPurchaseOrderLines` — 이미 적용돼 있었음
4. `1791300000000-AddPurchaseOrderOrderType` — **재실행 필요(아래 참고)**

### 발견한 문제: `orderType` 컬럼 소실 및 복구

`npm run migration:run`이 "No migrations are pending"를 반환했는데도 `purchase_order.orderType` 컬럼이
실제로는 존재하지 않는 모순을 발견했습니다. 원인 조사 결과:

- PR-180 단독 브랜치 작업 때 이 마이그레이션은 정상적으로 실행되고 검증까지 됐습니다(백필 1건, 품목 49 null).
- 이후 같은 세션에서 PR-181, PR-182 작업을 하며 **`orderType` 필드가 없는 다른 브랜치**로 체크아웃해
  `node dist/main`(개발 모드, `synchronize: true`)을 라이브 검증용으로 여러 번 띄웠습니다.
  `synchronize: true`는 DB 스키마를 현재 엔티티 정의에 정확히 맞춥니다 — 엔티티에 없는 컬럼은 **삭제**합니다.
  그 결과 `purchase_order.orderType` 컬럼이 조용히 드롭됐고(백필 데이터 포함), 다른 마이그레이션의 결과물은
  영향받지 않았습니다(각 PR의 신규 테이블/신규 컬럼은 해당 엔티티가 모든 브랜치에 남아있었거나, 별도 테이블이라
  `synchronize`가 건드리지 않음).
- `purchase_order_lines`, `material_packaging_unit_rules`, `bom_item_details.tapeType`,
  `export_shipment_lines.materialSubType`/`priceBasisNote`, `mido_price_items` 테이프 시드행, `supplier_main_items`는
  모두 직접 조회로 정상 확인했습니다 — **영향받은 것은 `orderType` 하나뿐입니다.**
- 복구: `migrations` 추적 테이블에서 `AddPurchaseOrderOrderType1791300000000` 행을 삭제한 뒤
  `npm run migration:run`으로 같은 마이그레이션 파일을 재실행했습니다. 컬럼이 다시 생성되고 백필도 재실행돼
  **원래와 동일한 결과**(발주 1건, 품목 49, 계약방식 없음으로 미지정 유지)로 복구됐습니다.
- **후속 조치 제안**: 공유 개발 DB에 대해 `synchronize: true` 개발 서버를 띄울 때는 그 브랜치가 최신 main
  기준인지 먼저 확인하는 습관이 필요합니다(이번처럼 오래된/다른 브랜치에서 띄우면 스키마가 조용히 깎일 수 있음).

## 검증 결과 (병합마다 + 최종 통합 1회)

| 단계 | 백엔드 build | 백엔드 jest | 프론트 tsc -b | 프론트 vitest | 관련 e2e |
|---|---|---|---|---|---|
| PR-171 병합 후 | OK | 638 pass | OK | 257 pass | — |
| PR-173 병합 후 | OK | 642 pass | OK | 260 pass | 9 suites / 71 tests |
| PR-181 병합 후 | OK | 652 pass | OK | 264 pass | 5 suites / 30 tests |
| PR-176 병합 후 | OK | 656 pass | OK | 266 pass | 9 suites / 69 tests |
| PR-180 병합 후(빌드 에러 1건 수정 후) | OK | 665 pass | OK | 271 pass | — |
| **통합 최종(전체)** | OK | 665 pass | OK | 271 pass | **60 suites / 445 tests, 전부 pass** |

마이그레이션 번호 오름차순/중복 없음 재확인: `1791000000000 < 1791100000000 < 1791200000000 < 1791300000000`
(PR-181은 마이그레이션이 필요 없었음 — 기존 varchar 컬럼에 타입 유니온만 추가, 확인 완료).

## 적용될 마이그레이션 목록 (main 병합 시 `migration:run:prod`가 실행하게 될 것)

1. `1791000000000-AddSupplierMainItems` — 공급업체 주요품목 다중 연결(신규 테이블)
2. `1791100000000-AddMaterialPackagingUnitRulesAndTapeType` — 실/테이프 포장단위 규칙(신규 테이블) + `bom_item_details.tapeType`(신규 컬럼)
3. `1791200000000-AddPurchaseOrderLines` — 발주 색상/사이즈 라인(신규 테이블)
4. `1791300000000-AddPurchaseOrderOrderType` — `purchase_order.orderType`(신규 컬럼, nullable) + 기존 발주 백필(불확실한 건은 null 유지)

## MERGE-2: PR-173 통합 정리

`git merge --no-ff feat/cmt-po-unit-price-optional`은 "Already up to date"(PR-173이 이미 integration
브랜치에 병합돼 있었음 — 위 표 참고). 대신 MERGE-2 지시서의 B/C 항목(중복 조회 통합, 일괄발주×CMT
단가 불일치 수정)을 수행했습니다.

### B. 중복 조회 통합

`getMaterialProductionContext`(PR-173)와 `suggestOrderTypeForItem`(PR-180)이 "품목 → 활성 BOM → 스타일 →
생산유형" 조회를 각자 다르게(173은 활성 여부 무시·최신 BOM 하나, 180은 활성 BOM 전체) 구현하고 있었습니다.
비공개 함수 `findActiveStyleProductionTypes(itemId)`(180의 로직 재사용) 하나로 합쳐 두 공개 함수가 모두
호출하도록 바꿨습니다.

- `getMaterialProductionContext`의 최종 동작: 활성 BOM 스타일이 하나이거나 모두 같은 생산유형이면 그 값,
  섞여 있거나 BOM 연결이 없으면 `productionType: null`(프론트는 FOB와 동일하게 단가 필수로 취급 — PR-173
  기존 정책 그대로). `styleNo`는 스타일이 정확히 하나일 때만 채움(프론트가 현재 안 쓰는 필드라 여럿이면
  null로 단순화).
- 테스트 추가(`purchase-orders.service.spec.ts`): 활성 BOM이 없는 경우, 여러 스타일이 같은 생산유형인
  경우, 서로 다른 생산유형이 섞인 경우. `suggestOrderTypeForItem` 쪽에도 같은 공통 조회를 쓰는지 확인하는
  테스트 2건 추가.

### C. 일괄발주(PR-179) × CMT 단가 선택(PR-173) 불일치 수정

`isBulkRowReady`에 `unitPriceRequired`(기본값 `true`, 기존 호출부 무변경) 매개변수를 추가했습니다.
`BulkOrderPreviewModal`은 가발주(`orderType === 'PROVISIONAL'`) 행에서 `false`를 넘겨 단가 없이도 준비
완료로 처리하고, 입력란 placeholder를 "선택 입력"으로 바꾸고 안내 문구를 보여줍니다. 커밋 payload의
`unitPrice`는 `?? undefined`로 보내 비워도 전송됩니다. 서버(`createBulk`/`BulkCreatePurchaseOrdersDto`)는
PR-173 병합 시점에 이미 `unitPrice`가 선택값이라 추가 변경이 필요 없었습니다 — e2e로 직접 확인했습니다.

검증 목록의 "PUT/수정하기 흐름이 단가 null 발주에서 깨지지 않는지" 항목을 확인하는 과정에서
`PurchaseOrderEditModal`이 null 단가를 `0`으로 보여주는 걸 발견해 함께 고쳤습니다: 이제 빈 칸으로 보여주고,
건드리지 않으면 `undefined`로 보내 기존 값(null 포함)을 그대로 유지합니다(`update()`의 "undefined면 안
건드림" 규칙과 일치).

### 부수 발견: PR-180 병합 커밋 누락분

PR-180 병합(`b584481`) 때 고쳤던 `BomItem` 중복 import 제거가 `git add` 목록에서 빠져 실제로는 커밋되지
않고 작업트리에만 남아 있었습니다(그 이후의 모든 빌드/테스트는 작업트리 기준이라 전부 정상으로 보였음).
MERGE-2 작업 중 `git status`로 발견해 `8a48ef3`에서 바로잡았습니다.

### 검증 결과

- `npm run build`: OK. `npx jest`: 669 pass(기존 665 + B 테스트 6건 + C 테스트 1건... 실제로는
  getMaterialProductionContext 재작성으로 순증감 있음, 최종 669건 전부 pass).
- 프론트 `tsc -b`: OK. `npx vitest run`: 272 pass.
- 요구된 e2e(`purchase-order*`, `contract*`, `mapping*`, `sales-orders*`, `rbac*`): **15 suites / 111
  tests, 전부 pass** — `purchase-order-cmt-unit-price-flow`(173 고유 e2e) 포함.

병합 커밋: `3af7df7`(B/C 통합 수정), 직전 `8a48ef3`(PR-180 누락분 수정).
통합 브랜치 최신 HEAD: `3af7df7`(푸시 완료 예정).

## 다음 단계

MERGE-3(PR-176 — 이미 integration 브랜치에 병합돼 있음, 필요한 추가 정리가 있다면 지시 대기)과
MERGE-4의 "운영 DB 보호" 확인(백업 여부)을 제시님께 별도로 여쭙고 응답을 기다린 뒤 `main`에 fast-forward
병합합니다. 이 보고서는 그 반영 후 최종 SHA/CI 결과로 업데이트합니다.
