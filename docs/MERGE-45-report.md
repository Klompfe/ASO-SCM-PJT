# MERGE-45 보고서 — PR-241 머지(자재명 수정 "이 행만"/자재마스터 전체 + BOM 행 공급업체·단가 수정)

## 결론

- 브랜치 `feat/bom-name-edit`를 `main`에 ff-only 머지, push 완료.
- 머지 전 Gate A ② 확인 중 문구(에러 메시지·확인창)가 "선적"을 직접 검사/집계하는 것으로 오해되게 쓰여 있던 것을 발견 → 사용자 승인 하에 수정 커밋 1개(`f90e256`) 추가 후 머지.
- 최종 SHA: `f90e256`(`main`, 구 `0b274d3` + 수정 커밋 1개).

## Gate A ② — 발주/입고/선적 "연결" 검사·집계 범위 (정확한 설명)

- "이 행만" 이름 변경 거부 가드(`src/boms/boms.service.ts` `renameMaterial()`)와 `GET /items/:id/usage`(자재마스터 전체 영향 확인)는 모두 **`PurchaseOrder`만 직접 쿼리**한다(`styleNo`+`itemId`+상태≠CANCELLED).
- **입고**는 같은 `PurchaseOrder` 레코드의 상태 전이(RECEIVED)이므로 이 쿼리에 그대로 포함된다.
- **선적**은 두 갈래로 나뉜다:
  - GENERATED(발주서를 거쳐 시스템이 만든 선적 문서): `ExportShipmentLine.packingReceiptId → PackingReceipt.purchaseOrderId → PurchaseOrder`로 연결되므로, 위 발주 집계에 **간접적으로** 포함된다.
  - IMPORTED(기존 엑셀을 그대로 가져온 선적 문서): `ExportShipmentLine.packingReceiptId`가 `null`이고 품목 id에 대한 참조가 전혀 없는 자유 텍스트다(PR-080 설계). 이 문서는 발주 쿼리는 물론 어떤 id 기반 쿼리로도 검사·집계할 수 없다 — **참조 자체가 없으므로 이름을 바꿔도 깨질 데이터가 없다**(영향 없음, 알려진 한계로 수용).
- 수정 전 문구(`"발주/입고/선적이 연결된 행입니다"`, `"발주/입고/선적 N건이 연결돼 있습니다"`)는 선적까지 직접 검사·집계하는 것처럼 읽혀 사실과 달랐다. `f90e256`에서 다음과 같이 고쳤다:
  - 거부 메시지: `"이 자재로 만든 발주가 있는 행입니다(발주를 통해 입고·선적도 연결됩니다). 자재마스터 이름 변경(모든 스타일 적용)을 사용하세요."`
  - 확인창 문구(`materialRename.ts`): `"발주/입고 {orderCount}건이 연결돼 있습니다. 이름은 품목 id로 연결돼 있어 따라 바뀝니다. 이미 확정·내보낸 선적서류의 설명 문구는 바뀌지 않습니다."`
- 관련 테스트: `src/boms/boms.service.spec.ts`(거부 메시지의 `/자재마스터 이름 변경/` 정규식은 새 문구에서도 그대로 매칭, 수정 불필요), `test/bom-name-and-fields-edit-flow.e2e-spec.ts:120`(동일), `frontend-app/src/utils/materialRename.test.ts`(새 문구 반영 + "선적서류 문구는 바뀌지 않는다" 캡션을 검증하는 테스트 1건 추가, 4→5건).

## Gate A ⑨ — 이름이 문자열로 복사되는 곳(참조가 아닌 곳)

코드 추적 결과 Item 이름은 `BomItem.material`(FK)·`PurchaseOrder.itemId`를 통해 어디서나 **id로 참조**되어, 이름을 바꾸면 모든 화면이 즉시 새 이름을 보여준다. 예외는 단 한 곳:

- `ExportShipmentLine.description` — 선적 문서 생성 시점에 `BomItem.spec` + `Item.englishName` + `BomItem.composition`을 조합해 **문자열로 고정 저장**하고 이후 원본이 바뀌어도 다시 계산하지 않는다(의도된 설계, PR-075, 해당 엔티티 헤더 주석에 명시). 이미 만들어진 선적서류는 자재명이 바뀌어도 원래 문구를 그대로 유지한다.

다른 복사 위치는 발견되지 않았다.

## 테스트 수

| 구분 | 머지 전(PR-241 완료 시점) | MERGE-45 최종 |
|---|---|---|
| 백엔드(jest) | 1297 | 1297 |
| 프런트(vitest) | 790 | 791 (+1: materialRename 문구 수정 검증) |
| e2e | 611 | 611 |

전부 통과(백엔드 78 스위트/1297건, 프런트 84 파일/791건, e2e 79 스위트/611건 — `--maxWorkers=2`로 1회 실행, 재시도 없이 통과).

## 브랜치 / 커밋

- 머지 대상: `feat/bom-name-edit` (origin/main `a4fd3cb`에서 분기)
- 머지 전 origin/main 확인: `a4fd3cb`로 분기 이후 origin/main에 새 커밋 없음(머지는 사실상 no-op, `git merge origin/main --ff-only` → "Already up to date").
- 수정 커밋(MERGE-45): `f90e256` — `fix(MERGE-45): PR-241 이름 변경 문구가 선적을 직접 센다고 오해하지 않게 고친다`
- `main`에 ff-only 머지 후 push 완료: `a4fd3cb..f90e256 main -> main`

## 변경 파일

PR-241 원본 15개 파일 + MERGE-45 수정 3개 파일(이미 PR-241이 건드린 파일 범위 내):

백엔드:
- `src/boms/dto/update-bom-item.dto.ts`, `src/boms/dto/rename-bom-item-material.dto.ts`(신규)
- `src/boms/boms.service.ts` — `updateItem()` 확장, `renameMaterial()` 신규(+MERGE-45: 거부 메시지 수정)
- `src/boms/boms.controller.ts`, `src/boms/boms.service.spec.ts`
- `src/items/items.service.ts` — `update()` 이름 검증, `getUsage()` 신규
- `src/items/items.controller.ts`, `src/items/items.service.spec.ts`
- `test/bom-name-and-fields-edit-flow.e2e-spec.ts`(신규)

프런트:
- `frontend-app/src/api/boms.service.ts`, `frontend-app/src/api/items.service.ts`
- `frontend-app/src/utils/materialRename.ts`/`.test.ts`(신규, MERGE-45에서 문구 수정)
- `frontend-app/src/components/ItemsManager.tsx`
- `frontend-app/src/utils/orderPrefill.test.ts`

## 마이그레이션 / 의존성

없음 — `BomItem.supplier`/`unitPrice`는 기존 컬럼이고, 새 패키지 의존성 추가 없음(`git diff a4fd3cb..HEAD`에서 `package.json`/마이그레이션 파일 변경 없음 확인).

## 한계 (알려진 범위 밖)

1. 통화는 이번 범위가 아니다(화면 문구에 통화를 단정하지 않음).
2. 같은 행을 다른 탭에서 동시에 수정하는 충돌은 감지하지 않는다(마지막 저장 우선).
3. 자재마스터 합치기(이미 중복 등록된 자재를 하나로 합치는 것)는 지원하지 않는다(이름이 겹치면 저장만 막는다).
4. **IMPORTED 선적 문서는 자재 id 연결이 없어(참조 자체가 없음) 이름 변경 가드/영향 확인이 이를 검사·집계할 수 없다 — 영향 없음. GENERATED 선적은 발주를 거쳐(PackingReceipt→PurchaseOrder) 간접적으로 포함된다.** (MERGE-45 Gate A ②에서 확인, 알려진 한계로 수용)

머지 및 push 완료. 추가 조치 없이 여기서 멈춥니다.
