# PR-185 완료 보고: 발주 두 트랙(스타일 연결/미연결) + 소요량 기반 수량(콘/롤 환산) + 단가표(USD) 참고단가

Written for: 이 저장소를 관리하는 개발자(마이그레이션/검증 결과를 확인하려는 사람).

- 브랜치: `feat/purchase-order-style-pricing` (`origin/main` `422bd6d`에서 분기 — PR-184 `customs-exchange-rates` 모듈이 main에 있음을 확인한 뒤 시작)
- queue 정책: `pause-after` — main 병합은 하지 않음. 푸시는 이 브랜치만.
- 운영 DB: 마이그레이션 실행·서버 기동 없음. 읽기 전용 조사만 수행(5번 절).

## 1. 구현 요약

| 영역 | 내용 |
|---|---|
| 마이그레이션 `1791700000000` | `purchase_order`에 nullable `styleNo`(+인덱스), `referenceUnitPriceUsd`, `referencePriceSource`, `referencePriceNote` 추가. 새 테이블 `brand_price_rules`(뮤트 3건만 시드: 겉감 $1.00/YD, 안감 $0.15/YD, 행어 $0.001/EA). 기존 컬럼/데이터는 건드리지 않음, 기존 발주는 전부 `styleNo=null`(스타일 미연결)로 남음 — 백필 없음. |
| A. 발주 ↔ 스타일 선택적 연결 | `styleNo` 지정 시 스타일 존재 + 최신(활성) BOM에 그 자재 포함 여부를 검증(둘 다 아니면 400). 미전송이면 기존 동작 그대로. 수정에서 연결/해제/변경 가능(`null`=해제). 목록에 `track`(STYLE/ITEM_ONLY)·`styleNo` 필터. 발주서 Excel은 `po.styleNo`를 BOM 추정값보다 우선 표시. |
| B. 소요량 — 스타일별 분리 | `orderedQty`는 이제 같은 `styleNo`로 연결된 발주(취소 제외)만 합산. `unlinkedOrderedQty`(스타일 미연결 발주, 참고용, 부족분 차감 안 함) 신설. `calculateMaterialRequirements` 시그니처 변경(`opts.unlinkedByItemId`). |
| B-2. 실/테이프 콘·롤 환산 | `Item.unit`이 콘/롤로 표기된 자재만 대상. `BomItem.threadType/tapeType`이 있고 `material_packaging_unit_rules`에 일치하는 규칙이 있을 때만 색상별로 `ceil(미터÷단위길이)` 후 합산해 `requiredPackages`/`shortagePackages`/`conversionFormula`를 채움. 종류 미지정이거나 규칙이 없으면 추측하지 않고 경고만(`실/테이프 종류 미지정 — 선택해 주세요`). |
| C. 단가표(USD) 참고단가 | `brand-price-rules` 모듈(CRUD, 쓰기 MANAGER/ADMIN) + 관리 화면("브랜드 전용가"). `GET /purchase-orders/price-reference`: 브랜드는 styleNo가 있으면 `classifyBrand()`(스타일번호 패턴)로, 없으면 `brandName` 쿼리로 결정. 후보는 브랜드 전용가 → 미도 단가표 순. `suggested`는 후보 1개+비범위값+환산 확정일 때만. `krw`는 `suggested`가 있을 때만 관세청 수출환율로 참고 환산(저장 안 함). 다데/암홀의 "과거 TAPE 10MM 일괄청구" 안내 문구 제거(PR-182 테스트 갱신). |
| D. INVOICE 연계 | 수출선적서류 상세 조회(`GET /export-shipments/:id`)에서, 라인의 발주에 `referenceUnitPriceUsd`가 있고 KRW `unitPrice`로 자동계산되지 않는 라인에만 `purchaseOrderReferencePrice`를 응답에 덧붙임(저장 안 함). 프론트 USD 단가 확정 모달에 "발주서 참고단가 — 이 값 사용" 후보로 표시. 선택해도 `confirmLinePrice`를 거쳐야 확정(자동 확정 없음). |
| E. 안전 보강 | `PurchaseOrdersService.update()`: 상세 줄(`lines`)이 있는 발주에 `lines` 없이 `quantity`만 보내면 400. |

## 2. 실제 production 데이터 읽기 전용 조사

- **브랜드 판정**: `brand_prefix_rules`에 `isNumericStart=true, numericPattern='^\d{2}[FS]', brandName='뮤트'` 규칙이 이미 등록돼 있음(26FW 실데이터 110건으로 검증됐다는 메모 포함). 즉 뮤트는 `buyer` 필드가 아니라 **스타일번호 패턴**(`26FOT08` 등)으로 판정된다 — `price-reference`가 `classifyBrand(styleNo, rules)`를 그대로 재사용하도록 설계한 이유.
- **BomItem.category 실제 값**: 자유 텍스트이고 줄바꿈·품번·영문 표기가 섞여 있다(예: `"심 지\nINTERLINING\n(M-252)"`, `"더텐치\nLINING\n안감"`, `"배색 본봉사\n코아사\n45S/2H THREAD"`). "겉감"/"안감" 같은 키워드는 대개 이 텍스트 어딘가에 부분 포함돼 있어 `categoryKeyword` 부분일치 매칭이 동작하지만, 완벽히 정형화된 값은 아니다 — 애매하면 후보로만 나열하는 설계가 그래서 필요했다.
- **오바사/스쿠이사 실 BOM 행**: 여러 스타일(MB72BLM101Z, MB72BLM102Z, MB72SLM103Z, MB73PM103Z 등)에 `consumption` 280~440(단위당 소요 미터) 수준으로 등록돼 있고, **모든 행의 `threadType`이 `null`**(아직 아무도 실 종류를 지정하지 않음). 실(THREAD)/실크 계열 BOM 행을 전수 집계한 결과도 `threadType IS NULL`이 304건이었다(이전 조사 606건은 "사"/"실" 이름 포함 전체 기준, 이번은 THREAD 카테고리 한정 — 기준에 따라 숫자가 다르다는 점을 밝혀둔다).
  - **결론**: 운영 BOM 데이터에 실 종류가 아직 하나도 지정돼 있지 않아, 이번 PR의 콘/롤 환산 기능은 **코드는 완성돼 있지만 운영에서 아직 활성화되지 않는다**(모든 실/테이프 자재가 "종류 미지정 — 선택해 주세요" 경고만 보여줄 것이다). 담당자가 BOM 화면에서 `threadType`/`tapeType`을 채워야 환산이 동작한다.
- **`orderedQty` 의미 변경 전/후 비교**: production의 `purchase_order` 테이블에는 **발주가 1건뿐**이다(id 36, itemId 49 "심지/INTERLINING(M-475)", quantity 7, status RECEIVED). 이 자재를 쓰는 스타일은 MB72JKM101C(consumption 0.01/unit)이다.
  - **변경 전(기존 로직)**: 이 스타일의 소요량 계산에서 orderedQty = 그 자재의 전체 발주 합계 = **7**.
  - **변경 후(이 PR)**: 발주 id 36은 `styleNo`가 없으므로(마이그레이션이 기존 행을 건드리지 않음) orderedQty = **0**, 대신 `unlinkedOrderedQty` = **7**(참고 표시, 부족분에서 차감 안 함).
  - 즉 이 한 건짜리 발주는 지금 당장은 "미연결" 상태로 남고, 실제로 MB72JKM101C 몫이면 담당자가 발주 수정 화면에서 `styleNo`를 연결해 줘야 그 스타일의 부족분 계산에 반영된다 — 이것이 바로 이 PR이 "자동으로 연결하지 않는다"고 한 지점이다.

## 3. 마이그레이션 검증 — **미검증(빈 DB)**

Docker 데몬이 실행 중이 아니어서 빈 DB에서 처음부터 돌리는 체인 검증은 하지 못했다(PR-183/184와 같은 상황). SQL은 `ADD COLUMN IF NOT EXISTS`/`CREATE TABLE IF NOT EXISTS`/`ON CONFLICT DO NOTHING`만 사용하는 추가 전용이고, `down()`은 이 PR이 만든 객체만 되돌린다. 운영 DB에는 이번 PR에서 마이그레이션을 실행하지 않았다(읽기 전용 조사만 수행).

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run build` (백엔드) | 통과 |
| backend `jest` 전체 | 60 suites / 750 tests 통과 |
| backend e2e 전체(`--maxWorkers=2`) | 64 suites / 492 tests 통과 (신규 `purchase-order-style-pricing-flow` 17건 포함) |
| frontend `tsc --noEmit` | 통과 |
| frontend `vitest run` 전체 | 49 files / 318 tests 통과 |

### 기존 e2e 3건을 새 의미에 맞게 갱신(회귀 아님, 요구사항 명시 사항)
`orderedQty`가 "그 자재의 전체 발주 합계"에서 "같은 styleNo로 연결된 발주만"으로 의미가 바뀌어, 기존 발주 없이 자재만 공유하던 `bom-requirements-flow`, `bom-requirement-by-style-flow`, `purchase-order-search-flow` e2e의 발주 생성 호출에 `styleNo`를 추가해 새 의미에 맞게 갱신했다(동작 자체를 느슨하게 만들지 않음 — 오히려 "스타일별로 섞이지 않는다"를 보장하는 방향의 변경).

### PR-182 회귀
`TAPE 10MM 일괄청구` 안내 문구 제거에 맞춰 `mido-price-table.service.spec.ts`와 `invoice-thread-tape-price-conversion-flow.e2e-spec.ts`의 관련 단언을 "문구 없음" 확인으로 바꿨다(환산 후보 자체의 정확성 검증은 그대로 유지).

## 5. 운영 DB에 남긴 테스트 데이터 — 없음

이번 PR은 운영 DB에 쓰기 작업을 전혀 하지 않았다(읽기 전용 SELECT만). 모든 검증은 sqlite e2e 테스트 DB에서 수행했고, 각 테스트가 끝나면 자체적으로 파일을 삭제한다(`afterAll`).

## 6. 스크린샷 — 없음(실데이터 Puppeteer 확인 미수행)

이번 PR은 마이그레이션을 어디에도 실행하지 않아(운영/Neon 테스트 브랜치 모두) `brand_price_rules`/`purchase_order.styleNo` 등 새 컬럼·테이블이 존재하는 환경이 없다 — 따라서 실제 화면을 띄워 확인하는 라이브 Puppeteer 검증은 하지 못했다. PR-183/184와 같은 이유로, main 반영을 위한 MERGE 단계(Neon 테스트 브랜치에서 마이그레이션 사전 검증 포함)에서 수행하는 것이 적절하다고 판단했다. 대신:
- 백엔드 동작은 sqlite e2e 17건으로 전체 흐름(A/B/B-2/C/D/E)을 실제 HTTP 요청으로 확인했다.
- 프론트 UI 구성(스타일 연결란, 트랙 필터, 수량 기본값 1 제거, 단가표 참고 블록, 브랜드 전용가 관리 화면)은 정적 렌더 테스트와 순수 로직 테스트(`purchaseOrderForm.test.ts`의 `suggestStyleLinkedQuantity` 등 20여 건)로 확인했다.

## 7. 제시님 확인이 필요한 항목

1. **기존 발주 연결**: 운영에 발주가 1건뿐이라 당장 긴급하지는 않지만, 앞으로 쌓일 기존(스타일 미연결) 발주를 스타일에 일괄 연결해 주는 화면이 필요한지 — 이번 PR은 발주 수정 화면에서 1건씩 연결/해제하는 것만 지원한다.
2. **브랜드 전용가 확대**: 뮤트 외에 추가할 브랜드가 있는지(현재는 뮤트 3건만 시드).
3. **BOM 실 종류 입력**: 콘/롤 환산이 실제로 동작하려면 BOM 화면에서 `threadType`/`tapeType`을 채워야 한다 — 어느 정도 범위(전체/최근 스타일만 등)로 먼저 입력할지 결정이 필요하다. (MERGE-7에서 확인: PR-186의 "실/테이프 종류 지정" 화면으로 자재(Item) 단위 지정이 가능해져, BOM 행을 직접 채우지 않아도 환산이 동작한다 — 아래 8절 참고.)
4. Render 배포 로그에서 `AddPurchaseOrderStyleAndPricing1791700000000` 적용 확인은 main 반영 이후 단계(MERGE)에서 필요하다.

## 8. 운영 복사본 검증 (MERGE-7, Neon 테스트 브랜치)

- 테스트 브랜치: `ep-hidden-bonus-b37lym8r.c-4.ap-southeast-1.aws.neon.tech`(운영 복사본, 버려도 되는 사본).
- 마이그레이션 `1791700000000`을 포함해 미적용 2건을 적용 → 되돌리기(두 번, 각각 단독으로 되돌려지는지) → 재적용까지 전부 에러 없이 완료. 기존 데이터(`purchase_order` 1건 qty=7/unitPrice=0.01, `items` 355건, `items.unit` 분포)는 전/후 완전히 동일 — PR-185/186 공통 검증 결과는 PR-186-report.md 9절에 표로 정리.
- **실데이터 라이브 검증(Puppeteer, MANAGER 토큰)**: 실제 스타일 `MB72JKM101A`로 스타일 연결 발주 생성 성공, 그 스타일 BOM에 없는 자재(`DDM 2019`, id 461 — DB로 사전 확인)로 연결 시도 시 400("이 스타일 자재명세에 없는 자재입니다 — 스타일과 연결하지 말고 '스타일 미연결' 발주로 등록하세요") 정상 확인. 스타일 미연결 발주도 기존과 동일하게 생성됨. 발주 목록 트랙 필터(`styleNo` 쿼리)가 연결된 발주만 정확히 걸러냄. 스크린샷: `docs/merge7-screenshots/01-purchase-orders.png`(트랙 필터 칩, 스타일 배지, 기존 발주 1건(id 36)이 그대로 남아있음을 함께 확인).
- **price-reference**: 실제 자재(오바사, id 129)·실제 스타일(`MB72JKM101A`)로 조회 → 미도 단가표 후보(실(THREAD), $0.00012/M) 1건과 `suggested`가 채워지고, 단위 불일치 경고(`자재 단위(EA)와 단가 단위(M)가 다릅니다`)와 실제 PR-184 주간환율(2026-10-09~15, 1375.14)을 쓴 `krw` 참고 환산까지 모두 정상 동작. 브랜드는 `미센스`로 판정(이 테스트 브랜치에는 뮤트 패턴 스타일이 없어 뮤트 전용가 매칭은 별도로 확인하지 못함 — 코드 경로는 PR-186-report.md와 공유하는 `classifyBrand` 로직 그대로라 PR-185 당시 단위 테스트로 검증됨).
- 발주서 가격 확정 화면(E 요구사항의 발주서 참고단가 후보 — `referenceUnitPriceUsd`)은 이번 발주들이 `unitPrice`만 지정하고 `referenceUnitPriceUsd`는 아직 비워뒀기 때문에 이번 라이브 점검에서는 값이 채워진 케이스를 별도로 만들지 않았다(API/DTO 동작은 sqlite e2e 17건으로 이미 커버됨) — 필요하면 추가 확인 가능.
