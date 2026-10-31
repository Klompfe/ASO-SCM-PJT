# PR-218 — 포장단위 표시·정수 올림을 "모든 수량 화면"에 적용 (PR-216 누락분 보완)

브랜치: `feat/package-unit-display-all` (origin/main `d50ea8c` 기준). **main 병합 없음, 마이그레이션 없음.**

## 0. 배포 상태 확인

`origin/main`에 PR-216 코드(`frontend-app/src/utils/materialRequirementDisplay.ts`)가 존재하고, 이번 세션의 `npm run build`(frontend-app)에도 정상 포함됨을 확인했습니다. 화면에서 안 보이면 **먼저 강력 새로고침(Ctrl+F5)**을 해보세요 — Cloudflare/브라우저 캐시 때문에 배포된 새 코드가 안 보일 수 있습니다.

## 1. 전수 점검 결과

| 화면(메뉴 경로) | 컴포넌트·위치 | 값 출처 | 기존 표기 | 규칙 정보(응답에 있음?) | 이번 PR 적용 |
|---|---|---|---|---|---|
| BOM 소요명세서(스타일/작업지시 기준) | `BomRequirementReport.tsx` 화면 표 | `GET /work-orders/style-requirements` 등 | 포장 있으면 정수+단위(PR-216). **없으면 소수 4자리** | Y (packaging 필드) | ✅ **적용** — `formatRequirementQty`/`formatCountOrQty`가 비포장일 때도 정수 올림(§3) |
| BOM 소요명세서 **엑셀 내보내기** | `utils/bomRequirementReport.ts`의 `requirementColumns` | 위와 동일 데이터 | 화면과 무관하게 **항상 원시 소수** (화면만 PR-216 적용, 엑셀은 누락) | Y | ✅ **적용** — 포장 있으면 "3콘" 문자열, 없으면 정수(숫자형 유지, 엑셀 합계 가능) |
| 부족자재(스타일 상세) | `StyleShortagePanel.tsx` | `GET /work-orders/style-requirements` | 포장 있으면 정수+단위, 없으면 `formatRequirementQty` 폴백 | Y | ✅ 함수 변경으로 자동 반영(코드 수정 없음) |
| **BOM 목록/상세(자재명세 조회)** | `ItemsManager.tsx:748,796` (`it.requiredQty`) | `GET /boms/by-style/:styleNo` (BomItemRow, raw) | **항상 원시 소수, 포장단위 미적용** | 응답엔 없지만 **별도 규칙 API**(`GET /material-packaging-unit-rules`, 이미 이 화면이 다른 용도로 fetch 중)로 보완 가능 | ✅ **적용** — `threadType`/`tapeType`이 이미 BOM 행에 있어 이름 추론 없이 직접 규칙 매칭(`formatBomItemQty`) |
| MATERIAL LIST 업로드 미리보기 — 실/테이프 행 | `MappingPreviewModal.tsx` | 엑셀 파싱 직후 값 | 종류 하나로 확정되면 정수+단위(PR-216) | 파싱 단계라 서버 응답에 없음(이름 추론, 기존 방식 유지) | 변경 없음(기존 그대로 정상) |
| MATERIAL LIST 업로드 미리보기 — **일반 자재 행** | `MappingPreviewModal.tsx` (NOT_APPLICABLE 분기) | 위와 동일 | **항상 원시 소수**(포장 대상 아니라서 PR-216이 손대지 않음) | - | ✅ **적용** — 정수 올림 + 원값 보조 표시 |
| MATERIAL LIST 커밋 결과 | `MappingPreviewModal.tsx` 커밋 후 알림 | `POST /mapping/commit` 응답 notices | 수량 표기 없음(건수/색상·사이즈 라벨만) | - | 해당 없음(수량을 숫자로 보여주는 지점 없음) |
| 발주 폼(단일) 수량 제안 | `purchaseOrderForm.ts`의 `suggestStyleLinkedQuantity` | `MaterialRequirementRow` | 이미 정수(포장 시 `shortagePackages`, 아니면 `Math.ceil(shortage)`) — "소요 X m(Y콘)" 보조문구만 소수 | Y | 변경 없음(PR-185/187에서 이미 적용, 보조문구의 원값 소수는 규칙상 허용) |
| 다품번 일괄발주(발주 라인) | `MultiStyleBulkOrder.tsx`/`BulkOrderPreviewModal.tsx` | `suggestStyleLinkedQuantity` 재사용 | 위와 동일(이미 정수) | Y | 변경 없음(확인만, PR-185 경로 그대로) |
| 발주 목록/상세 | `PurchaseOrdersManager.tsx` (`po.quantity`, 색상/사이즈 라인 `l.qty`) | 발주 생성 시 저장된 값 | 정수 | - | **대상 아님** — 이건 "필요량"이 아니라 이미 정수로 저장된 발주 수량(포장단위 개수) |
| 입고 처리(완제품) | `GoodsReceiptPanel.tsx` | 완제품입고증 색상/사이즈 수량 | 정수(의류 수량) | - | **대상 아님** — 원자재 소요량이 아니라 완제품(의류) 수량 |
| 원자재 입고/선적(수입) | `ImportShipmentManager.tsx` (`line.qty`+`line.unit`) | 공급업체 선적서류를 보고 사람이 입력한 **실측값** | 원시값 그대로(현재 소수 가능) | - | **후속 PR 후보**(§6) — "필요량 계산값"이 아니라 공급업체 실제 선적값이라 올림하면 사실을 왜곡함. 저장값이 소수인 경우가 실제로 있는지는 더 조사 필요 |
| 수출선적(인보이스/패킹) | `ExportShipmentManager.tsx` (`l.qty`+`l.unit`) | 스타일×색상별 **완제품(의류) 수출 수량** | 정수 | - | **대상 아님** — 자재 소요량이 아니라 의류 수출 수량. 서식 고정 문서라 어차피 계산 변경 금지 대상 |
| 자재(품목) 재고 | `InventoryReport.tsx` (`inv.quantity`) | `Inventory.quantity`(`real`, 실측 재고) | 원시 소수 | - | **적용 보류**(§6) — 이건 "필요량"이 아니라 **실측 재고값**입니다. ROUNDUP(올림)을 적용하면 실제보다 재고가 더 있는 것처럼 보여 위험합니다(사용자 확인 필요, §6) |

## 2. 포장 규칙 연결 키 / 시드값 확인

- **연결 키**: 암홀·다데는 `BomItem.tapeType`, 코아사·오바사·폴리지누이도는 `BomItem.threadType` — 둘 다 비면 `Item.materialSubType`(품목 단위 지정)로 폴백(`effectiveSubType`, 백엔드 `packaging-subtype.util.ts`와 동일 규칙). 값 자체는 `material_packaging_unit_rules.materialSubType`과 문자열이 같습니다(`COA_SA`/`OBA_SA_SKU_I_SA`/`POLY_JINUIDO`/`DADE`/`AMHOL`).
- **규칙은 DB 테이블입니다**(하드코딩 아님, `material_packaging_unit_rules`, PR-175) — 화면 `자재 > 포장단위 규칙`(`MaterialPackagingUnitRulesManager.tsx`)에서 추가/수정/삭제 가능합니다. 이번 PR은 이 테이블을 새로 만들거나 값을 바꾸지 않았습니다.

| materialSubType | displayName | 단위 | DB 현재값 | 이번 지시서 기준값 | 일치? |
|---|---|---|---|---|---|
| COA_SA | 코아사 | 콘 | 2500M | 2500M | ✅ |
| OBA_SA_SKU_I_SA | 오바사·스쿠이사 | 콘 | 4000M | 4000M | ✅ |
| DADE | 다데 | 롤 | 50M | 50M | ✅ |
| AMHOL | 암홀 | 롤 | **50M** | **100M** | ❌ **불일치(PR-216에서 이미 보고, 아직 미해결)** |

⚠ **암홀 불일치는 이번이 재보고입니다.** PR-216 보고서(§1-4)에 이미 같은 내용을 적었고, DB 시드(마이그레이션 `1791100000000`)와 `ItemsManager.tsx`의 종류 선택 드롭다운 문구(`암홀 (100M/롤)`) 양쪽 모두 "100M"라고 적혀 있는데, 실제 DB 값은 50M입니다. 어느 쪽이 맞는지 확인해 주세요 — 100M이 맞다면 **별도 마이그레이션 PR**이 필요합니다(이번 PR은 "DB 값 수정 금지" 지시라 손대지 않았습니다).

## 3. 적용한 표시 규칙 (요약)

`materialRequirementDisplay.ts`를 그대로 확장했습니다(새 포맷 함수 중복 생성 안 함):

| 함수 | 변경 | 비고 |
|---|---|---|
| `ceilToInt(qty)` | **신규** | 포장단위 없는 값의 공용 올림 함수. `-0` 정규화 포함(엑셀 재파싱 시 `0`과 값이 달라지는 문제 방지) |
| `formatRequirementQty` | 비포장 폴백을 `fmtDecimal`→`ceilToInt`로 변경 | BomRequirementReport/StyleShortagePanel이 자동으로 혜택 |
| `formatCountOrQty` | 위와 동일 | 위와 동일 |
| `formatBomItemQty` | **신규** | threadType/tapeType이 이미 지정된 화면(ItemsManager) 전용 — 이름 추론 안 함(이미 값이 있으니 추측 불필요, 더 안전) |

표시 분기(모든 화면 공통):

| 경우 | 표시 | 적용 함수 |
|---|---|---|
| 포장 규칙 있음 | `ROUNDUP(필요량÷규칙길이)` 정수+단위, 원값은 흐린 글씨/툴팁 | 기존(PR-216) |
| 규칙 없음, 일반 자재 | 정수 올림, 원값 보조 표시 | **PR-218 신규** |
| 실·테이프인데 종류 미지정 | 원값 그대로 + "종류 확인 필요" 경고(계산 안 함) | 기존(PR-216) |
| 단위 불일치(규칙은 M 기준, 자재 단위가 다름) | 환산 안 하고 "단위 확인 필요"만 | **PR-218 신규**(`formatBomItemQty`의 `UNIT_MISMATCH`) — 현재 실데이터는 전부 단위 M이라 실제로 발동하는 사례는 없지만, 향후 단위가 다른 자재가 들어와도 틀린 숫자를 보여주지 않도록 미리 막았습니다. |

**합계 행 규칙(현재 계산 방식 확인, 변경 없음)**: `material-requirements.util.ts`는 **색상별로 먼저 `Math.ceil`한 뒤 합산**합니다(`requiredPackages += Math.ceil(colorMeters/unitLengthM)`, 177~184행) — "합산 후 올림"이 아니라 "올림 후 합산"입니다. 이번 PR은 이 계산을 바꾸지 않았고(요구사항: 계산 로직 변경 금지), 화면/엑셀 표시만 그 결과를 그대로 보여줍니다.

**부동소수점(epsilon) 처리**: 기존 `ceilWithEpsilon`(1e-9) 그대로 유지, `ceilToInt`도 동일 epsilon을 씁니다.

## 4. 발주 폼 — 수량 의미 확인

테이프·실 품목을 스타일 연결 경로로 고르면 `suggestStyleLinkedQuantity`(purchaseOrderForm.ts)가 수량 초기값을 **부족분(콘/롤 개수)**로 채웁니다 — 이미 정수이고 저장되는 수량의 의미는 "롤/콘 개수"입니다(미터 길이가 아님). 이 동작은 PR-185/187에서 이미 적용돼 있었고, 이번 PR에서 바꾸지 않았습니다.

## 5. 포장내역·수출선적 — 환산 기준 현황

`ExportShipmentManager.tsx`의 라인(`l.qty`+`l.unit`)은 **스타일×색상별 완제품(의류) 수출 수량**이며, 원자재 소요량이 아닙니다. 기존 환산 로직은 손대지 않았고, 애초에 이 값이 "필요량"이 아니라서 ROUNDUP 적용 대상도 아닙니다(§1 표 참고). 인보이스/패킹리스트는 서식이 고정된 외부 문서라 계산도 어차피 바꾸지 않습니다.

## 6. 후속 PR 후보 / 보류 사항

1. **암홀(AMHOL) 포장단위 — 50m/롤(현재 DB) vs 100m/롤(이번 지시서)**: PR-216부터 두 번째 보고. 확인 후 맞는 값이 100m라면 별도 마이그레이션 PR + `ItemsManager.tsx` 드롭다운 문구 수정이 필요합니다.
2. **원자재 수입선적(`ImportShipmentManager.tsx`) 수량 표기**: 공급업체 실측값이라 이번 PR에서 올림을 적용하지 않았습니다. 실제로 소수 저장 사례가 있는지, 있다면 어떤 표시가 맞는지 확인이 필요합니다.
3. **자재 재고(`InventoryReport.tsx`) 표시**: "필요량"이 아니라 실측 재고라 올림이 오히려 위험합니다(실제보다 많아 보임). 그대로 소수로 둘지, 아니면 소수점 자릿수만 줄여서 보여줄지 결정이 필요합니다(값 자체는 바꾸지 않음).
4. **단위(Y↔M) 환산**: 이번 PR에서도 넣지 않았습니다(지시사항대로). 실데이터에 Y 단위 테이프/실 자재가 있는지 확인되면 별도 PR이 필요합니다.
5. **길이 단위가 다른데 소수로 저장된 값**: 현재 조사 범위에서는 발견되지 않았습니다(원자재 수입선적 제외).

## 7. 테스트

- `materialRequirementDisplay.test.ts`: `ceilToInt` 3건, `formatBomItemQty` 6건 신규(패키지/부동소수점/종류미지정/일반자재/EA/단위불일치) + 기존 `formatRequirementQty`/`formatCountOrQty` 2건을 새 규칙에 맞게 업데이트.
- `MappingPreviewModalPackaging.test.tsx`: 일반 자재 올림 표시 테스트 업데이트(기존 "150.5 그대로" → "151 올림 + 150.5 보조표시").
- `bomRequirementReport.test.ts`: 기존 엑셀 재파싱 테스트는 그대로 통과(픽스처 값이 이미 정수라 결과 동일 — 다만 포장 없는 케이스의 반환형이 "숫자"로 유지됨을 확인).
- `ItemsManager.tsx`의 BOM 표는 비동기 상태(스타일 검색→선택→BOM 로드) 뒤에만 나타나 이 저장소의 `renderToStaticMarkup` 기반 테스트 관례로는 직접 렌더링 테스트가 어렵습니다(`@testing-library/react` 등 비동기 렌더 도구는 미설치, 설치는 package.json 변경이라 금지 범위). 대신 실제로 쓰는 포맷 함수(`formatBomItemQty`)를 6가지 분기 전부 단위테스트로 커버했습니다.

## 8. 테스트 숫자(전/후)

| 항목 | 하한(PR-212/MERGE-21 기준) | 이번 결과 |
|---|---|---|
| 백엔드 jest | 1084 | 1084 (변경 없음 — 백엔드 코드 미변경) |
| e2e(`--maxWorkers=2`) | 563 | 563 (변경 없음, 재시도 불필요) |
| 프런트 vitest | 529 | **539**(+10: `ceilToInt` 3 + `formatBomItemQty` 6 + `-0` 회귀 1) |
| 백/프런트 build | 성공 | 성공 |

`git diff origin/main --stat`: `src/migrations/`·`package.json`·락 파일 변경 **0건** 확인. 변경 파일은 프런트 6개뿐(백엔드 변경 없음 — 포장 규칙을 이미 있는 별도 API로 끌어와 썼기 때문에 서버 응답 필드 추가가 필요 없었습니다).

## 9. 변경 파일

| 파일 | 내용 |
|---|---|
| `frontend-app/src/utils/materialRequirementDisplay.ts` | `ceilToInt`, `formatBomItemQty` 신규, `formatRequirementQty`/`formatCountOrQty` 비포장 폴백을 올림으로 변경 |
| `frontend-app/src/utils/materialRequirementDisplay.test.ts` | 위 변경에 대한 테스트 추가/수정 |
| `frontend-app/src/components/ItemsManager.tsx` | BOM 목록의 필요량 칸에 `formatBomItemQty` 적용(정수+포장단위, 경고 포함) |
| `frontend-app/src/components/MappingPreviewModal.tsx` | 업로드 미리보기의 일반 자재 필요량도 정수 올림 |
| `frontend-app/src/components/MappingPreviewModalPackaging.test.tsx` | 위 변경에 대한 테스트 수정 |
| `frontend-app/src/utils/bomRequirementReport.ts` | 엑셀 내보내기(`requirementColumns`)도 화면과 같은 규칙으로 — 숫자형은 유지(엑셀 합계 가능), 포장 있을 때만 단위 문자열 |

## 사람이 화면에서 확인할 것 (병합·배포 후)

1. **자재 > 자재명세(BOM) 조회**(ItemsManager): 테이프/실이 포함된 스타일을 조회하면 "필요량" 칸이 소수 대신 정수+콘/롤로 보이고, 산식이 흐린 글씨로 같이 보인다.
2. 같은 화면에서 일반 원단/부자재(겉감 등)의 "필요량"도 소수 대신 정수로 올림돼 보인다.
3. **BOM 소요명세서**(스타일/작업지시 기준 소요명세서 화면) → "엑셀로 내보내기" 눌러 받은 파일에서 "필요 총수량"/"이미 발주 수량"/"부족 수량" 열이 화면과 같은 정수(또는 "3콘" 같은 단위 문자열)로 나오고, 숫자 열은 엑셀에서 합계(SUM)가 걸린다.
4. MATERIAL LIST 엑셀 업로드 미리보기에서, 테이프/실이 아닌 일반 자재의 "필요량"도 소수 대신 정수로 올림돼 보이고 원래 소수값은 흐리게 같이 보인다.
5. (참고용, 수정 아님) 암홀 포장단위가 50M/롤로 보이는 게 맞는지 — 100M/롤이 맞다면 별도로 알려주세요(§2, §6-1).

---

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
