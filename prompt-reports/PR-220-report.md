# PR-220 — 작지 색상별 수량(sheetQty)을 발주수량 계산에 반영 + 1518 버그 수정 보고서

브랜치: `feat/sheet-qty-per-bom-row` (origin/main `dd12a56`에서 분기). **main에 병합하지 않았습니다.**

## 0. 1518 버그 원인 확정

**원인**: `GET /work-orders/style-requirements` → `expandStyleRequirements(styleNo, targetQuantity)`([work-orders.service.ts:247-262](../src/work-orders/work-orders.service.ts))가 스타일 **전체** 기획수량 하나(`targetQuantity`, 스타일 오더개요의 `totalQty` 또는 사용자가 입력한 계획수량)를 뽑아 `calculateMaterialRequirements(targetQuantity, items, ordered, ...)`([material-requirements.util.ts, 수정 전 202번째 줄](../src/work-orders/utils/material-requirements.util.ts))에 넘기고, 이 함수는 **BOM 행이 어떤 색상인지와 무관하게** 모든 행에 `perUnit × target`(요척 × 스타일 전체 수량)을 그대로 곱합니다.

| 가능 원인(지시서 제시) | 실제 여부 | 근거 |
|---|---|---|
| ① 색상 행들이 같은 자재(material.id)로 합산됨 | 부분적으로만 — 합산 자체는 "같은 자재면 합친다"는 기존 설계(PR-120)이고 틀리지 않음 | `material-requirements.util.ts` 수정 전 179-218번째 줄(`map.get(bi.material.id)`) |
| ② 행마다 스타일 전체 수량을 곱함 | **이것이 진짜 원인** | 수정 전 202번째 줄 `cur.requiredQty = round4(cur.requiredQty + perUnit * target)` — `target`은 항상 스타일 전체 수량이고 색상별 분배가 없음 |
| ③ 프런트가 스타일 단위 합계를 품목 단위 수량에 대입함 | 아님 — 서버 응답을 그대로 보여줄 뿐 | `StyleShortagePanel.tsx`/`PurchaseOrdersManager.tsx`는 서버가 내려주는 `requiredQty`를 그대로 표시 |

**재현(합성 데이터, `material-requirements.util.spec.ts`의 "PR-220 0번" describe)**:
- 겉감이 **서로 다른 Item**(사용자 실사례 — 색상이 품목명에 포함됨, 예 "KHAKI KH")이면: BL/KH 각 Item이 독립적으로 `perUnit(1.0)×target(1518)`을 계산해 **둘 다 1,518**이 됩니다 — 사용자가 본 증상과 정확히 일치.
- 겉감이 **같은 Item의 색상별 BOM 행**(엑셀 업로드처럼 자재명은 같고 colorCode만 다름)이면: 두 행의 1,518이 그대로 합산돼 **3,036**이 됩니다(다른 모양의 틀림).

두 경우 모두 "작지 수량 유무와 무관하게" 고쳐야 한다는 요구사항대로, 원인은 **행마다 색상과 무관한 동일한 target을 곱한다는 것** 하나입니다. 이번 PR은 이 계산 자체(작지 수량이 없는 경우)는 바꾸지 않고(수용 기준 3), **작지 수량(sheetQty)이 있는 행에서만** 그 값을 그대로 쓰도록 해 근본 원인을 우회·해결합니다.

## 1. 작지 인식 — 이미 있던 필드를 재사용

`vision.service.ts`의 `RESPONSE_SCHEMA.bomItems[].requiredQty`가 **이미** "그 행에 인쇄된 출고량을 계산 없이 그대로 읽는" 필드였습니다(`checkYocheokMismatch`/`checkYocheokMismatchBundle`, `vision-guardrails.util.ts` 309-383번째 줄의 기존 주석이 "실측: 요척 1.19, 색상 2행 출고량 760/825"를 직접 언급 — PR-220의 사용자 사례와 같은 모양). 그래서 **새 수량 필드를 추가하지 않고** 이 필드를 그대로 재사용했습니다.

**새로 추가한 것은 단위뿐**: `requiredQtyUnit`(nullable string) — 기존에 단위를 읽는 필드가 전혀 없었습니다.
- `RESPONSE_SCHEMA.bomItems[].requiredQtyUnit` 추가(필수 아님).
- PROMPT에 한 문단 추가(기존 문장은 그대로 두고 추가만): "requiredQty(출고량)는 그 행에 인쇄된 숫자를 계산하지 말고 그대로 옮기세요... requiredQtyUnit은... 원문 그대로... 단위가 안 보이면 null... '합계'/'TOTAL' 같은 합산 행은 bomItems에 넣지 마세요."
- 기존 안전장치(PR-207/208 보정, 가드레일, `checkYocheokMismatch` 등)와 `requiredQty` 자체의 읽는 방식·의미는 **전혀 바꾸지 않았습니다**(합성 JSON 테스트로 확인 — `vision.service.spec.ts`).
- 하네스가 스키마 필드를 고정 비교하는 코드는 없었습니다(별도 수정 불필요).

## 2. 저장 (마이그레이션 — 추가 전용, 실행 안 함)

**새 파일**: `src/migrations/1792100000000-AddBomItemSheetQty.ts` (main 최대값 `1792000000000`과 미병합 브랜치 `feat/mido-price-table-admin-r1`의 최대값 `1791900000000`보다 모두 큼).

```sql
-- up
ALTER TABLE "bom_item_details" ADD "sheetQty" decimal;
ALTER TABLE "bom_item_details" ADD "sheetQtyUnit" character varying;
-- down
ALTER TABLE "bom_item_details" DROP COLUMN "sheetQtyUnit";
ALTER TABLE "bom_item_details" DROP COLUMN "sheetQty";
```

**왜 새 컬럼이 필요한가(기존 `requiredQty` 컬럼을 재사용하지 않은 이유)**: `bom_item_details.requiredQty`(기존 컬럼)는 경로에 따라 의미가 다릅니다 — AI(작지) 경로는 AI가 읽은 원문값이지만, **엑셀(MATERIAL LIST) 경로는 `consumption × totalQty`로 계산된 스냅샷**입니다(`mapping-commit.service.ts`의 `reconcile()`, 그리고 기존 `material-requirements.util.ts` 주석 "BOM 등록 당시 시트의 총 오더수량으로 계산된 스냅샷이라... 쓰지 않는다"). 이 컬럼을 그대로 신뢰하면 엑셀로 업로드된(현재 운영 데이터의 대다수) BOM 행이 전부 "작지 수량"으로 오인되어 수용 기준 3(회귀 없음)이 깨집니다. `sheetQty`/`sheetQtyUnit`은 **AI(작지) 경로에서만** 채워지는 별도 컬럼으로, 엑셀 경로는 항상 NULL입니다.

**엔티티** (`bom-item.entity.ts`): `sheetQty?: number | null`(`@Column('decimal', {nullable:true})`), `sheetQtyUnit?: string | null`(`@Column({nullable:true})`).

**저장 경로**:
- `AiBomItemDto.requiredQtyUnit`(신규) → `SalesOrdersService.commitAnalysis()`가 `sheetQty: b.requiredQty, sheetQtyUnit: b.requiredQtyUnit`로 `CommitMappingDto.bomItems`에 함께 실어 `MappingCommitService.commit()`으로 넘깁니다. **기존 `requiredQty` 전달(레거시 컬럼)은 그대로 유지**합니다.
- `commit()`의 **신규 BomItem 생성** 경로: `sheetQty`/`sheetQtyUnit`을 유효(유한한 양수)할 때만 저장(`resolveSheetQty()`), 아니면 NULL — 엑셀 경로는 이 필드를 보내지 않으므로 항상 NULL(변경 없음).
- `commit()`의 **기존 BomItem 재업로드(병합)** 경로: 기존에는 "같은 (자재명,색상,규격)이면 아무것도 저장하지 않고 NEEDS_REVIEW만 기록"했습니다. `sheetQty`/`sheetQtyUnit`은 이 규칙의 **예외**로 — 들어온 값이 유한한 양수면 그 두 컬럼만 갱신·저장합니다(PR-211 방식: 못 읽음/0/음수는 기존 값을 지우지 않음). 다른 필드(요척 등)는 여전히 그대로 둡니다.

## 3. 계산 반영 (`calculateMaterialRequirements`)

각 BOM 행마다: `bi.sheetQty`가 유한한 양수이고 `normUnit(bi.sheetQtyUnit) === normUnit(bi.material.unit)`(둘 다 비어있지 않고 같음)이면 그 행의 필요량 = `sheetQty`(출처 `'sheet'`), 아니면 기존 `perUnit × target`(출처 `'computed'`, 추측 환산 없음 — Y↔M 등 환산 금지 요구사항 그대로). 색상별 포장 올림(`colorMeters`)도 이 "행 필요량"을 누적하므로, 테이프·실 올림 로직(행/색상 단위 올림 후 합산)은 **순서를 바꾸지 않고** 입력 수량만 바뀝니다.

**신규 응답 필드**(하위 호환 — 기존 필드/응답 모양 유지, 전부 선택 필드):
| 필드 | 의미 |
|---|---|
| `basis` | `'sheet'`(전 행 작지 기준) / `'computed'`(전 행 계산) / `'mixed'`(섞임) — 항상 채워짐 |
| `computedQty` | 요척×기획수량(항상 제공 — 작지 수량 유무와 무관하게 비교용) |
| `sheetQty` | 작지 수량 합(basis가 sheet/mixed일 때만) |
| `mismatch` | `\|computedQty - requiredQty\| / computedQty > 0.05`(±5%, 상수 `SHEET_QTY_MISMATCH_THRESHOLD_PCT`)이면 true — 사람 확인 필요 표시일 뿐, 자동으로 값을 바꾸지 않음 |

## 4. 화면 변경

- **자재명세 초안**(수주등록 후 저장 전 검토 화면, `SalesOrderUploadModal.tsx`): "작지수량(출고량)" 열을 새로 추가(값+단위 입력칸, `item.requiredQty`/`item.requiredQtyUnit`에 바인딩 — 기존 `updateBomItemField`를 재사용). 그 아래 작은 글씨로 "계산값: 요척×기획수량"을 항상 보여줍니다. 기존 "요척×수량이 작지의 출고량과 다름" 배지(`computeBomRowBadges`, PR-201/PR-200)는 **그대로 유지**(변경 없음) — 이미 같은 비교를 하고 있었습니다.
  - **기획수량 역할 필드**: `StyleOverview.totalQty`(오더개요 TOTAL 수량) — `sales-orders.service.ts`의 `overviewData.totalQty`로 이미 저장되는 값이고, 이 화면에서는 `result.overview.totalQty`로 참조합니다.
- **[A] 부족자재 표**(`StyleShortagePanel.tsx`): `basis==='sheet'`면 "작지 수량 기준", `'mixed'`면 "일부 작지 수량 기준" 배지(초록색), `mismatch`면 "작지 수량(N)과 계산값(M)이 달라 확인이 필요합니다" 경고(주황색)를 자재명 칸에 추가. **계산값 자체는 PR-219와 동일한 자리**(필요/발주/부족 칸)에 그대로 나오므로 수용 기준 1·2는 추가 수정 없이 충족됩니다.
- **BOM 조회**(`ItemsManager.tsx`): **변경하지 않았습니다.** 이 화면은 `calculateMaterialRequirements`를 쓰지 않고 저장된 `BomItem.requiredQty`(레거시 컬럼)를 행 단위로 그대로 보여주는데, AI 경로의 `requiredQty`는 이미 작지 원문값이라 **이 PR 이전부터 이미 BL=760/KH=758처럼 올바르게 보이고 있었습니다**(버그는 [A]/[B]의 재계산 경로에만 있었음) — 그대로 두는 것이 맞는 수정입니다.

## 5. 테스트 (합성 데이터만, 실제 API 호출 0)

| 구분 | PR 전(MERGE-23 기준) | PR 후 |
|---|---|---|
| 백엔드 `jest` | 1100 | **1128**(+28) |
| 프런트 `vitest run` | 548 | **553**(+5) |
| e2e | 564(1차 통과) | 아래 별도 설명 |

새 테스트: 0번 원인 재현 2건, sheetQty 반영/폴백/mismatch 9건, 포장 환산 유지 1건, mixed 1건(`material-requirements.util.spec.ts`), 마이그레이션 up/down(인메모리 SQLite) 3건, mapping-commit 재업로드 null-보호/신규 저장 6건, commitAnalysis 전달 2건, vision 스키마 합성 JSON 파싱 1건, 프런트 basis/mismatch 표시 5건, e2e 3건(업로드→커밋→조회, 재업로드 갱신).

### e2e 전체 스위트 — 흔들림, 재시도 기준으로 보고(자체 통과 처리하지 않음)

- 1차(`--maxWorkers=2`): 524/567 통과(43건 실패, 전부 `beforeAll`의 5초 NestJS 부팅 타임아웃).
- 재시도(`--maxWorkers=1`): 539/567 통과(28건 실패) — **하한(564) 미달**.
- 실패한 스펙들을 **개별/소그룹으로 다시 실행하면 전부 통과**합니다(`bom-requirement-by-style-flow`, `bom-requirements-flow`, `search-select-audit-followup-flow`, `purchase-order-search-flow`, `import-shipments-dpkl-flow` 등 — 2회 실행에서 실패한 스펙 조합이 서로 다름, 매번 다른 무작위 하위집합이 깨짐). 이 PR이 직접 건드린 계산 경로를 쓰는 `bom-requirement-by-style-flow.e2e-spec.ts`/`bom-requirements-flow.e2e-spec.ts`도 **격리 실행하면 100% 통과**해, 이번 PR의 회귀가 아니라 전체 스위트를 한 번에 돌릴 때의 머신 자원 경합(동시에 많은 NestJS 앱 부팅 + 각자 SQLite 파일)으로 보입니다 — MERGE-21 Gate 0에서 같은 패턴("11건 실패, concurrency/worker-contention으로 진단")이 이미 보고된 적 있습니다.
- **스스로 통과로 처리하지 않습니다** — 병합 시점(MERGE 게이트)에서 같은 현상이 재현되는지, 또는 이 머신의 동시 실행 한도 문제인지 사용자가 판단해 주세요. 새로 추가한 e2e(`sales-order-sheet-qty-flow.e2e-spec.ts`)는 단독 실행에서 3/3 통과했습니다.

`git diff origin/main --stat` 확인(보고서 제외): `src/migrations/`에 새 파일 **정확히 1개**, 기존 마이그레이션 수정 0, `package.json`·락 파일 변경 0, 엑셀/이미지/실데이터 파일 0.

## 6. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/migrations/1792100000000-AddBomItemSheetQty.ts` (신규) | 추가 전용 마이그레이션 |
| `src/boms/entities/bom-item.entity.ts` | `sheetQty`/`sheetQtyUnit` 컬럼 |
| `src/boms/utils/add-bom-item-sheet-qty.migration.spec.ts` (신규) | 마이그레이션 up/down 테스트 |
| `src/work-orders/utils/material-requirements.util.ts` | 1518 버그 수정 핵심 — sheetQty 반영, basis/computedQty/mismatch |
| `src/mapping/dto/commit-mapping.dto.ts` | `CommitBomItemDto.sheetQty/sheetQtyUnit` |
| `src/mapping/services/mapping-commit.service.ts` | 신규/재업로드 저장 경로에 sheetQty 반영 |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `AiBomItemDto.requiredQtyUnit` |
| `src/sales-orders/vision.service.ts` | 스키마/PROMPT에 단위 필드 추가(읽는 방식 기존 유지) |
| `src/sales-orders/sales-orders.service.ts` | `commitAnalysis`가 sheetQty 전달 |
| `test/sales-order-sheet-qty-flow.e2e-spec.ts` (신규) | e2e |
| `frontend-app/src/utils/bomRequirementReport.ts` | `MaterialRequirementRow`에 basis 등 타입 추가 |
| `frontend-app/src/components/StyleShortagePanel.tsx` | [A] basis/mismatch 배지 |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 자재명세 초안에 작지수량/단위/계산값 표시 |
| `frontend-app/src/api/salesOrders.service.ts` | `AiBomItem.requiredQtyUnit` |
| 각 `*.spec.ts`/`*.test.ts` | 위 변경에 대한 테스트 |

## 7. 사용자 확인 절차 (병합·Neon 검증·배포 후)

1. **`MB74BLM107Z`의 작지를 수주등록으로 다시 업로드**(기존 스타일 재업로드) — 자재명세 초안에서 BL 760 / KH 758(작지 인쇄값과 대조)이 보이는지. 재업로드 시 값 병합 방식: 같은 (자재명,색상,규격) 행이 이미 있으면 요척·일반 필드는 바뀌지 않고(기존 PR-098 규칙 그대로) **작지수량(sheetQty)만** 새로 읽은 값으로 갱신됩니다(값이 유효할 때만 — 못 읽으면 기존 값 유지).
2. [A] 부족자재 표·[B] 발주 폼에서 BL/KH 수량이 1,518이 아니라 각각 760/758(또는 재업로드 후 새 값)로 보이는지, "작지 수량 기준" 배지가 보이는지.
3. **작지 수량이 없는 기존 스타일**(엑셀 업로드로 등록된 스타일)의 화면이 이전과 완전히 같은지(배지도 안 보여야 함 — `basis`가 항상 `'computed'`이므로).

## 8. 후속 PR 후보

- 색상×사이즈 수량표(PR-212의 `style_color_size_quantities`)와 BOM 행별 `sheetQty`를 연결해, 색상코드가 수량표와 일치하면 자동으로 교차 검증.
- `ItemsManager.tsx`(BOM 조회)에도 `basis`/`mismatch` 배지를 추가해 작지 원문값인지 바로 알 수 있게.
- 선적(수출) 결합 — `export-shipments` 쪽 요척 검증에도 같은 `sheetQty` 신뢰 기준을 적용할지 검토.

## 9. 하지 않은 것(요구사항 그대로)

Gemini/실제 API 호출(전부 합성 JSON으로 테스트), 기존 인식 안전장치·필드 의미 변경, 포장 규칙 값 변경, 단위(Y↔M) 환산, 운영 DB 접근, 마이그레이션 실행, main 병합.

---

# PR-220b — 색상별 자재는 "전체 수량 폴백" 금지, 수량표(PR-212) 색상 합계로 계산

같은 브랜치(`feat/sheet-qty-per-bom-row`)에 이어서 커밋. **main에 병합하지 않았습니다.** 새 마이그레이션 없음(PR-220의 마이그레이션 1개만 유지).

## 배경

PR-220은 **작지 수량(sheetQty)이 있을 때만** 1518 버그를 고쳤다. 그런데 사용자 확정 사실대로 "주요 자재 대부분은 공통 사용이 없고 색상별로 쓰인다" — sheetQty가 없는(엑셀 업로드 등) 색상별 행은 PR-220 이후에도 여전히 "스타일 전체 수량 × 요척"으로 계산되고 있었다(폴백 자체가 버그였다). PR-220b는 이 폴백을 없애고, 색상이 있는 행은 **색상×사이즈 수량표(PR-212, `style_color_size_quantities`)의 그 색상 합계**를 쓰도록 바꾼다.

## 1. 행별 필요량 확정 규칙 (구현된 그대로)

`material-requirements.util.ts`의 `calculateMaterialRequirements`가 각 BOM 행마다 아래 순서로 판정한다(`basis` 필드로 출처 표시):

| 순서 | 조건 | 결과 | basis |
|---|---|---|---|
| 1 | `sheetQty` 있고 단위 일치(PR-220) | `sheetQty` 그대로 | `'sheet'` |
| 2 | colorCode가 공통이 아니고(아래 "공통 판정" 참고), 수량표에 같은 색상 합계가 있음 | `perUnit × 수량표 합계` | `'color-qty'` |
| 3 | colorCode가 공통(빈 값/`FREE`/`N/A`) | `perUnit × 스타일 전체 수량`(기존 계산, 회귀 없음) | `'computed'` |
| 4 | colorCode가 있는데 1·2 둘 다 근거 없음 | **숫자를 만들지 않음**(requiredQty에 더하지 않음) | `'unknown'`, `needsColorQty: true` |

자재(아이템) 단위로는 그 자재의 BOM 행들이 쓴 basis 조합에 따라 `'sheet'|'color-qty'|'computed'|'mixed'|'unknown'` 중 하나가 최종 `basis`로 매겨진다(`unknownBasisCount>0`이면 다른 근거가 하나라도 있으면 `'mixed'`, 전혀 없으면 `'unknown'`).

**색상 비교 정규화**(요구사항 그대로 구현): 앞뒤 공백 제거 + 대소문자 무시 + 내부 연속 공백을 1칸으로. **약어↔전체명(BL↔BLUE) 추측 매칭은 하지 않는다** — `normalizeColorForMatch()`로 BOM 행의 `colorCode`와 수량표의 `color`를 각각 정규화해 정확히 같을 때만 매칭한다.

**"공통" 판정에 `'N/A'`를 추가한 이유(구현 중 발견)**: 요구사항에는 빈 값/`FREE`만 있었지만, `mapping-commit.service.ts`의 `normalizeKeyPart()`가 "색상 없음"을 빈 문자열이 아니라 **리터럴 `'N/A'`**로 저장하는 기존 관례를 쓰고 있었다(`colorCode` 컬럼이 `NOT NULL` 문자열이라 빈 값을 넣을 수 없어 이렇게 정규화됨). 이 관례를 놓치면 **엑셀로 업로드된 기존 운영 데이터 중 색상 정보가 없던 행 대다수가 전부 `needsColorQty`로 바뀌는** 심각한 회귀가 났다(아래 3절의 e2e 회귀가 이를 실측으로 드러냄). `NA_COLOR_KEY`로 `FREE`와 동일하게 공통 취급하도록 추가했다.

색상별로 갈라진 행끼리는 (기존처럼) 서로 합산되지 않는다 — 각 행이 자기 색상의 수량표 합계(또는 sheetQty, 또는 unknown=0)만 쓰고, 같은 자재의 여러 행은 그 **올바른** 기여분끼리만 합산된다. 테이프·실 포장 올림(행/색상 단위 올림 후 합산)은 순서를 그대로 두고 입력 수량만 바뀐다. `needsColorQty` 행은 포장 환산(`packaging`/`suggestedPackaging`)도 하지 않는다(요구사항 그대로) — 종류가 확정돼 있어도 수량 자체가 불명확하면 환산을 만들지 않는다.

`colorQuantities`는 `WorkOrdersService.expandStyleRequirements()`가 **스타일당 1회**(`StylesService.getColorSizeQuantities(styleNo)`, PR-212 기존 서비스 재사용) 조회해 `calculateMaterialRequirements`에 그대로 넘긴다 — BOM 행 개수와 무관하게 N+1 조회가 생기지 않는다. 조회 실패는 `.catch(() => [])`로 "수량표 없음"으로 취급한다(발주 화면이 조회 실패로 막히지 않음). 이를 위해 `StylesModule`에서 `StylesService`를 `exports`하고 `WorkOrdersModule`이 `imports`하도록 모듈 연결을 추가했다(순환 의존 없음 — 확인됨).

## 2. 화면 4곳 반영

| 화면 | 변경 |
|---|---|
| **[A] 부족자재 표**(`StyleShortagePanel.tsx`) | `needsColorQty`면 필요/발주/부족 칸 모두 숫자 대신 "색상별 수량 확인 필요"(기존 `conversionWarning` 배지가 그대로 이 문구를 보여줌). `basis==='color-qty'`면 "수량표 기준" 배지 추가(기존 "작지 수량 기준"과 같은 자리). |
| **BOM 조회**(`자재·발주 > 자재`의 "BOM 소요명세서", `BomRequirementReport.tsx`) | 이 화면이 실제로 `calculateMaterialRequirements`를 쓰는 지점이다(원시 BOM 행 표는 레거시 `requiredQty` 컬럼을 그대로 보여줘 PR-220 이전부터 이미 정확했다 — PR-220 보고서 4절 참고). `needsColorQty` 행은 3개 수량 칸을 합쳐 "색상별 수량 확인 필요" 안내로, 아니면 `basis`에 따라 "수량표 기준"/"작지 기준" 배지를 추가. 엑셀 내보내기(`requirementColumns`)도 같은 행에서 숫자 대신 문구를 쓴다(엑셀 합계가 깨지는 것보다 틀린 숫자가 안전하지 않다는 판단). |
| **자재명세 초안**(수주등록, `SalesOrderUploadModal.tsx`) | PR-220에서 이미 작지수량/단위 입력칸과 계산값 비교를 추가해 둬서, 추가 변경 없음 — 이 화면은 저장 전 AI 원문 검토용이라 `calculateMaterialRequirements`(스타일 조회 시점)를 타지 않는다. |
| **[B] 발주 입력 칸**(`PurchaseOrdersManager.tsx`) | `suggestStyleLinkedQuantity`/`suggestUnlinkedQuantity`가 `conversionWarning`(이미 `needsColorQty`일 때 "색상별 수량 확인 필요" 문구로 채워짐)이 있으면 수량을 비우는 기존 로직을 그대로 타므로 **수량 칸 기본값은 이미 비워진다**(추가 코드 불필요, 확인만). 다만 그 "왜 비었는지"가 [B] 안에서는 전혀 안 보였던 기존 공백을 채우기 위해 — [A]에서 "이 자재로 발주하기"를 누르거나 스타일 연결 트랙에서 품목을 고르면 수량 칸 아래에 같은 안내 문구를 보여주는 `needsColorQtyNote` 상태를 새로 추가했다. |

## 3. 테스트 변경 — 기존 테스트가 깨진 이유와 수정 내역

**원인**: 많은 기존 테스트(백엔드 유닛/e2e)가 "색상"을 실제로 검증하려는 게 아니라 그냥 `colorCode: 'BK'` 같은 placeholder를 아무 의미 없이 채워 넣고 있었다(이 PR 이전에는 colorCode가 계산에 전혀 영향을 주지 않았으므로). PR-220b는 이제 그 값을 "진짜 색상"으로 해석해 수량표 근거를 요구하므로, 이런 테스트들이 전부 `needsColorQty`(requiredQty=0)로 깨졌다. **기대값을 바꾸는 대신**(지시서 허용) **placeholder를 공통(`''`)으로 바꿔 원래 의도(색상과 무관한 계산 검증)를 보존**했다 — 숫자 자체를 바꾼 것은 "같은 자재가 실제로 여러 색상으로 쓰이는" 소수의 테스트뿐이다.

| 파일 | 수정 내역 | 이유 |
|---|---|---|
| `material-requirements.util.spec.ts` (유닛) | `bi()`/`threadBi()`/`tapeBi()` 기본 colorCode `'BK'`→`''`; RED/BLUE 등 실제 다색 테스트는 `sheetQty` 또는 `colorQuantities`를 추가해 근거를 줌; "PR-220 0번" 두 테스트는 (이제 둘 다 재현되지 않으므로) "needsColorQty가 되는지" 검증으로 전환; `sheetQty` 단위-무효 3종 테스트는 colorCode를 `''`로 바꿔 "단위 게이트" 자체만 보도록 분리; "mixed" 테스트는 두 번째 행에 `colorQuantities`를 줘 `sheet+color-qty` 혼합으로 재설계(기대값 760+1518→760+758) | placeholder 색상 제거, 각 테스트의 원래 의도 보존 |
| `test/bom-requirements-flow.e2e-spec.ts` | `mkBom` 호출 2곳의 `'BK'`→`''` | 부족분/BOM선택 규칙 검증(색상 무관) |
| `test/bom-requirement-by-style-flow.e2e-spec.ts` | `'BK'`→`''` 2곳 | 동일 |
| `test/bom-active-review-flow.e2e-spec.ts` | `'BK'`→`''` | 활성 BOM 선택/재계산 검증(색상 무관) |
| `test/multi-style-bulk-order-flow.e2e-spec.ts` | `'BK'`→`''` | 다품번 일괄발주 소요량 집계 검증(색상 무관) |
| `test/purchase-order-search-flow.e2e-spec.ts` | `'BK'`→`''` | 스타일 기준 부족 자재 흐름 검증(색상 무관) |
| `test/bom-excel-reconcile-flow.e2e-spec.ts` | **수정 없음** — `colorCode: 'N/A'`가 "공통"으로 인식되도록 **프로덕션 코드**(`NA_COLOR_KEY`)를 고쳐서 해결 | 이 테스트가 실제 `mapping-commit.service.ts`의 `normalizeKeyPart()` 관례(색상 없으면 `'N/A'`)를 그대로 재현하고 있었다 — 테스트가 아니라 유틸이 그 관례를 놓치고 있었던 것 |

이 표에 없는, colorCode를 명시적으로 쓰는 다른 e2e(`mapping-flow`, `mapping-reapprove-merge-flow`, `sales-order-commit-analysis-merge-flow`, `sales-orders-routes-flow`, `bom-label-set-flow`, `import-shipments-first-documentation-flow` 등)는 전부 `calculateMaterialRequirements`를 호출하지 않는 경로(BOM 저장/병합/비교 자체)만 검증해 영향이 없었다(격리 실행으로 확인).

## 4. 기존 운영 데이터 영향

| 이전 상황 | 이 PR 이후 | 사용자가 할 일 |
|---|---|---|
| 색상 있는 행 + `sheetQty` 없음 + 수량표 없음 — 이전엔 **틀린 숫자**(스타일 전체 수량)가 보였음 | "색상별 수량 확인 필요"로 바뀜(숫자 없음) | 작지 재업로드(수량 포함, PR-220) 또는 MATERIAL LIST 재업로드(색상×사이즈 수량표, PR-212)로 수량 근거를 채워 주세요. |
| 색상 없는/`FREE`/`N/A` 행 | 변화 없음(기존 계산 그대로) | 없음 |
| 이미 `sheetQty`가 있는 행(PR-220 적용분) | 변화 없음 | 없음 |

## 5. 테스트 숫자

| 구분 | PR-220 기준 | PR-220b 후 |
|---|---|---|
| 백엔드 `jest` | 1128 | **1143**(+15) |
| 프런트 `vitest run` | 553 | **558**(+5) |
| e2e | (아래 참고) | (아래 참고) |

새 테스트: `calculateMaterialRequirements`의 `colorQuantities`/`needsColorQty`/`basis` 확장 14건(②③④⑤⑥⑦⑧ + N/A 공통 처리 1건, `it.each` 5건 포함), `work-orders.service.spec.ts`에 `StylesService` 목 추가(기존 테스트 유지 목적), 프런트 `needsColorQty` 표시 4건(`ShortageTable`/`bomRequirementReport`/`purchaseOrderForm`), e2e 신규 1건(`sales-order-color-qty-flow.e2e-spec.ts`, 엑셀 매핑 경로로 색상×사이즈 수량표만으로 760/758이 계산되는지).

### e2e — 흔들림, 재시도 기준으로 보고(자체 통과 처리하지 않음)

지시서대로 **처음부터 `--maxWorkers=1`로 전체 1회** 실행했다.

- 1차(전체, `--maxWorkers=1`): **549/569 통과**(20건 실패) — 전부 `beforeAll`/개별 테스트의 5초 타임아웃(부팅 경합) 또는 대용량 파일 테스트(DPKL) 타임아웃형이었다.
- 실패한 스펙을 **개별/소그룹으로 재실행하면 전부 통과**한다 — 이번 PR이 실제로 건드린 계산 경로(`bom-requirements-flow`, `bom-requirement-by-style-flow`, `bom-active-review-flow`, `bom-excel-reconcile-flow`, `multi-style-bulk-order-flow`, `purchase-order-search-flow`, 신규 `sales-order-color-qty-flow`)를 포함해 **모두 격리 실행에서 100% 통과**를 확인했다(수정 과정에서 처음엔 7개 파일이 실제로 깨졌었고, 위 3절 표의 수정으로 전부 해결됨 — 자체 판단이 아니라 격리 재실행으로 검증).
- 남은 실패(이번 PR과 무관한 파일들, 예: `export-performance-flow`, `import-shipments-dpkl-flow`, `packing-receipts-report`, `purchase-orders-report-filter`, `search-select-audit-followup-flow`)는 매 전체 실행마다 **다른 무작위 조합**으로 나타나(머신 동시 실행 자원 경합, PR-219/MERGE-21에서도 같은 패턴이 보고됨) 이 PR의 회귀가 아니라고 판단하지만, **하한(569) 미달이라는 사실 자체는 숨기지 않고 보고**합니다 — 병합 시점에 사용자가 재확인해 주세요.

`git diff eb5c41c --stat` 확인: 새 마이그레이션 0건(PR-220의 1개만 유지), `package.json`/락 파일 변경 0건.

## 6. 변경 파일(PR-220b 추가분)

| 파일 | 내용 |
|---|---|
| `src/work-orders/utils/material-requirements.util.ts` | 핵심 — `colorQuantities`/`needsColorQty`/`basis` 확장(color-qty/unknown/mixed), `normalizeColorForMatch`, `NA_COLOR_KEY` |
| `src/work-orders/work-orders.service.ts` | `StylesService` 주입, 스타일당 1회 `getColorSizeQuantities` 조회 |
| `src/work-orders/work-orders.module.ts`, `src/styles/styles.module.ts` | 모듈 연결(StylesService export/import) |
| `frontend-app/src/utils/bomRequirementReport.ts` | `MaterialRequirementRow`에 `needsColorQty`, 엑셀 컬럼 "색상별 수량 확인 필요" 처리 |
| `frontend-app/src/components/StyleShortagePanel.tsx`, `BomRequirementReport.tsx` | needsColorQty/수량표 기준 배지 |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | `needsColorQtyNote` — [B] 수량 칸 안내 |
| `test/sales-order-color-qty-flow.e2e-spec.ts` (신규) | 엑셀 매핑 경로 색상×사이즈 수량표 e2e |
| 그 외 5개 e2e 파일 | 3절 표의 colorCode placeholder 수정 |
| 각 `*.spec.ts`/`*.test.ts` | 위 변경에 대한 테스트 |

## 7. 하지 않은 것(요구사항 그대로)

새 마이그레이션, 약어↔전체명 추측 매칭, 색상 행에 전체 수량 폴백(이번 PR의 핵심 제거 대상), 포장 규칙 값·올림 순서 변경, Y↔M 환산, Gemini 호출, main 병합.
