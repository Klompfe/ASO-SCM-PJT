# PR-222 — 수주등록 저장 화면(자재명세 초안)에 "발주수량(적용)" 열 추가

대상 브랜치: `feat/mapping-preview-applied-qty` (origin/main에서 분기, push만 — **병합 없음**)

## 1. 현황 파악

### "계산값" 표시가 어디서 오는지

`frontend-app/src/components/SalesOrderUploadModal.tsx`의 "작지수량(출고량)" 칸(수정 전 948행 부근)은:
```
계산값: {(item.consumption ?? 0) * (result.overview.totalQty ?? 0)}
```
— **색상을 전혀 보지 않는 단순 `요척 × 총수량`**이다. `basis`/`computedQty`/`needsColorQty`/`mismatch` 필드는 **이 화면에 전혀 없다** — `AiBomItem`(`frontend-app/src/api/salesOrders.service.ts`)에는 해당 필드가 없고, 이 화면의 커밋 경로(`commitAnalysis()` → `/sales-orders/commit-analysis`)는 `colorSizeQuantities`를 서버로 보내지도 않는다(`src/sales-orders/sales-orders.service.ts:77` 이하 `mappingCommitService.commit()` 호출 인자 확인 — `colorSizeQuantities` 없음). 그 테이블은 **MATERIAL LIST 엑셀 업로드**(`/mapping/commit`, `mapping-commit.service.ts:178` `mergeColorSizeQuantities`)로만 채워진다.

### [A] 부족자재 표의 규칙

`StyleShortagePanel.tsx`(69~107행)는 서버가 내려주는 `basis`/`mismatch`/`needsColorQty`를 그대로 보여준다. 그 값은 `src/work-orders/utils/material-requirements.util.ts`의 BOM 행 단위 결정(241~275행)에서 나온다:
1. 작지수량(`sheetQty`) 있고 단위(자재 단위=작지수량 단위) 일치 → `basis='sheet'`
2. 아니고 색상이 공통(빈칸/FREE/N/A)이 아니며 같은 색상의 `style_color_size_quantities`(PR-212) 합계가 있음 → `basis='color-qty'`
3. 색상이 공통 → `basis='computed'`(총수량×요척)
4. 색상은 있는데 근거 없음 → `basis='unknown'`(숫자 안 만듦, `needsColorQty`)

**이 PR이 추가하는 "발주수량(적용)" 열은 위 4단계 규칙을 그대로 복제한다**(`frontend-app/src/utils/appliedQuantity.ts`의 `resolveAppliedQuantity`) — 계산 로직 자체를 바꾸지 않고, 백엔드와 같은 식을 프런트에도 옮겨 적었다(`materialRequirementDisplay.ts`/`warningChips.ts`와 같은 기존 패턴 — 두 TS 프로젝트가 분리돼 있어 직접 import할 수 없다).

### 규칙이 "완전히 같은지" — 알려진 차이 (중단 사유 아님, 투명하게 기록)

| 항목 | [A](커밋 후, 백엔드) | 이 화면(커밋 전, 초안) | 비고 |
|---|---|---|---|
| 작지수량 단위 비교 대상 | 저장된 `Item.unit`(마스터 단위) | 자재명이 **기존 마스터에 이미 있으면** 그 `Item.unit`, **새 자재면** 단위를 알 수 없어 비교 불가 → sheet 근거를 쓰지 않고 다음 우선순위로 넘어감 | 새 자재는 커밋 시점에야 Item이 만들어져 단위가 아직 없다 — 초안 화면의 구조적 한계(계산 로직 변경 아님) |
| 색상×사이즈 수량표 | `StylesService.getColorSizeQuantities(styleNo)`(DB) | 같은 엔드포인트(`GET /master-styles/:styleNo/quantities`)를 프런트에서 직접 호출 | 같은 데이터, 같은 정규화(`normalizeColorForMatch`) |
| 집계 단위 | 자재(Item) 기준으로 여러 BOM 행을 합산(`WorkingRow`) | **행 하나 단위**(아직 Item에 묶이지 않은 원시 행) | 지시서의 "값 규칙" 자체가 행 단위라 이 PR의 범위와 일치(섹션 2) |

위 차이는 "커밋 전 초안이라 아직 모르는 정보(새 자재의 단위)"에서만 생기며, **계산 로직(우선순위/정규화 규칙)은 완전히 동일**하다. 근거 없는 추측(예: 새 자재 단위를 사용자가 쓴 작지수량 단위로 간주)은 하지 않고, 이 경우만 sheet 근거를 보수적으로 건너뛴다.

### 포장단위 공용 유틸

`frontend-app/src/utils/materialRequirementDisplay.ts`의 `formatBomItemQty(qty, {subtype, itemName, itemUnit}, rules)`를 그대로 재사용한다 — `rules`는 `GET /material-packaging-unit-rules`(기존 엔드포인트, `materialPackagingUnitRules.service.ts`)를 모달이 열릴 때 1회 조회한다.

## 2. "발주수량(적용)" 열

위치: "작지수량(출고량)" 열 바로 오른쪽(새 `<th>`/`<td>`, `min-w-[150px]`).

### 적용 규칙 표 (합성 값 예)

| 입력(합성) | 근거 | 표시 |
|---|---|---|
| 작지수량 760yd, 단위 일치 | 작지 | `760 yd` |
| 작지수량 없음, 색상 BL 수량표 합계 499, 요척 0.26 | 색상수량표 | `130 yd`(129.74 → 올림) |
| 색상 빈칸/FREE/N/A, 요척 0.26, 총수량 3000 | 계산 | `780 yd` |
| 색상 KH, 수량표에 BL만 있음(KH 없음) | — | `색상별 수량 확인 필요`(숫자 없음) |
| 실 130m, 종류=코아사(2500m/콘, 합성 규칙) | 계산 | `1콘` |
| 실 130m, 종류 미지정 | 계산 | 숫자 + "실/테이프 종류 확인 필요" 경고 |
| 작지수량 600yd, 계산값 780yd(차이 23%, ±5% 초과) | 작지 | `600 yd` + "작지 값 적용 600 / 계산값 780" 추가 줄 |

- 값 옆 작은 배지(작지/색상수량표/계산)에 `title`로 계산식을 보여준다(예: `색상 합계 499 × 요척 0.26 = 129.74`).
- `mismatch`(작지수량 vs 계산값 ±5% 초과, `basis==='sheet'`일 때만)는 기존 `rowBadges.requiredQtyMismatch`(1% 기준, 기존 경고 — **그대로 유지**)와는 별개로, 이 열 안에서만 "작지 값 적용 N / 계산값 M"을 추가로 보여준다(백엔드 `SHEET_QTY_MISMATCH_THRESHOLD_PCT=0.05`와 같은 기준).
- 작지수량 입력칸(`bom-sheet-qty-${index}-${i}`)을 고치면 `item.requiredQty`가 바뀌어 같은 렌더에서 `appliedQuantities`가 다시 계산된다(React state 기반, 별도 동기화 불필요).
- 기존 "계산값: N" 회색 글씨는 **그대로 유지**(참고용, 요청대로 색상 구분 없는 단순 식).
- **계산값을 "작지수량" 입력칸에 자동으로 써 넣지 않는다** — 새 읽기 전용 열에만 표시한다.

## 3. 표 위 요약 한 줄

자재명세 표 바로 위(기존 "AI가 읽은 값이므로..." 안내문 아래)에 추가:
```
기획수량(총수량) 3,000 · 적용수량이 확정된 행 7 / 9 · 색상별 수량 확인 필요 2
```
기획수량은 오더개요의 `totalQty`를 그대로 쓰고 없으면 "미입력". 기존 "확인 필요 N건 — ..." 요약 띠(파일 상단)는 건드리지 않았다.

## 4. 테스트

### 새 순수 함수 테스트 — `frontend-app/src/utils/appliedQuantity.test.ts`(9개, 전부 합성 값)

① 작지수량 760yd → `sheet`/760 ② 색상수량표(합계499)×요척0.26 → `color-qty`/129.74(올림 전), `ceilToInt`로 130 확인 ③ 색상 없는 행(빈칸/FREE/N/A, 대소문자 혼용) → `computed` ④ 색상 있고 근거 없음 → `unknown`/0 ⑤-a 실 130m+코아사(합성 2500m/콘) → `formatBomItemQty`로 `1콘` ⑤-b 오바사 종류 미지정 → `SUBTYPE_NEEDED` ⑥ mismatch: 2.6% 차이(false) vs 23% 차이(true) ⑦ 작지수량 760→800으로 바꾸면 적용 수량도 760→800 + 단위 불일치(작지 m, 자재 yd) 시 sheet 근거를 쓰지 않고 computed로 넘어가는지 1건 추가.

### 기존 테스트

`SalesOrderUploadModal.test.tsx`의 기존 3개 테스트(PR-221에서 추가한 모달 폭 확인 포함) **수정 없이 통과**. 새 열의 렌더링(배지/title/collapsed 등)은 PR-221과 같은 이유로 이 하네스(`renderToStaticMarkup`, jsdom/testing-library 없음, `results`가 내부 `useState`)로 직접 검증할 수 없었다 — 로직은 전부 `appliedQuantity.ts`의 순수 함수 테스트로 대신했다.

### 전체 테스트 숫자

| 구분 | 하한(MERGE-25 기준) | 결과 |
|---|---|---|
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 566 이상 | ✅ **575/575**(+9 신규) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(1회) | 1143 이상 | ✅ **1143/1143**(변경 없음 — 백엔드 파일 미변경) |
| e2e | 569 이상 | **생략** — 백엔드 변경 0개(마이그레이션 포함)라 영향 가능성이 없음 |

`git diff origin/main --stat` 확인: 추적 파일 변경은 `frontend-app/src/api/styles.service.ts`, `frontend-app/src/components/SalesOrderUploadModal.tsx` 2개(+ 신규 `frontend-app/src/utils/appliedQuantity.ts`, `appliedQuantity.test.ts`) — 전부 `frontend-app/` 범위. `src/migrations/`/`package.json`/락 파일 변경 0.

## 5. 변경 파일

| 파일 | 내용 |
|---|---|
| `frontend-app/src/utils/appliedQuantity.ts`(신규) | 백엔드 규칙 복제(`resolveAppliedQuantity`, `buildColorQtyMap`) |
| `frontend-app/src/utils/appliedQuantity.test.ts`(신규) | 위 9개 테스트 |
| `frontend-app/src/api/styles.service.ts` | `getStyleColorSizeQuantities()` 추가(기존 백엔드 엔드포인트 호출, 서버 변경 없음) |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 새 열("발주수량(적용)") + 요약 한 줄 + 색상수량표/포장규칙 조회(useEffect) + 기존 자재 단위 맵 확장 |
| `prompt-reports/PR-222-report.md`(신규, 이 문서) | 보고서 |

경고 문구·분류·순서, 저장/검증 로직, 입력칸 동작은 바꾸지 않았다. 단위(Y↔M) 환산 코드도 넣지 않았다(단위 불일치는 `formatBomItemQty`의 `UNIT_MISMATCH` 경고로만 표시).

## 사람이 화면에서 확인할 것 (병합·배포 후)

1. 수주등록 > 작지 업로드 > 저장 화면에서, 작지수량이 비어 있던 행에도 "발주수량(적용)" 열에 정수·포장단위로 값과 근거 배지(작지/색상수량표/계산)가 보인다.
2. 근거 배지에 마우스를 올리면 계산식(예: `색상 합계 499 × 요척 0.26 = 129.74`)이 보인다.
3. 색상×사이즈 수량표에 그 색상이 없는 행은 숫자 대신 "색상별 수량 확인 필요"만 보인다.
4. "작지수량" 입력칸을 고치면 "발주수량(적용)" 열이 즉시 바뀐다.
5. 저장 후 발주관리 [A] 부족자재 표의 필요량(자재 기준 합계)이, 이 화면에서 보인 행별 적용수량의 합과 일치한다(새 자재 단위 한계는 위 "알려진 차이" 참고).

## 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리했다(아래 `git log` 참고). **main에 병합하지 않았다.**
