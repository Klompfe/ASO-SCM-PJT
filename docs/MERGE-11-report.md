# MERGE-11 반영 보고서

지시서: `prompt-reports`가 아닌 "MERGE-11 — 통합 병합 지시서"(마이그레이션 없는 PR 9건, 2026-10-14 작성분 + PR-193) — 사용자가 대화로 전달, 파일 미보관.

---

## 단계 9 · PR-193 — "선적 기본정보"에서 Carrier 제외

- 브랜치: `fix/export-defaults-remove-carrier`
- 병합 전 main SHA: `455a961`(PR-192 반영 직후)
- 병합 후 main SHA: `1fd14cb`
- 선행 단계: 없음(독립 — 지시서 순서와 무관하게 먼저 처리)

### 변경 파일 (origin/main...origin/fix/export-defaults-remove-carrier, 10개)
- `frontend-app/src/api/exportShipmentDefaults.service.ts`
- `frontend-app/src/components/ExportShipmentDefaultsManager.tsx`
- `frontend-app/src/components/ExportShipmentManager.tsx`
- `prompt-reports/PR-193-report.md`
- `src/export-shipment-defaults/dto/update-export-shipment-defaults.dto.ts`
- `src/export-shipment-defaults/entities/export-shipment-defaults.entity.ts`
- `src/export-shipment-defaults/export-shipment-defaults.service.spec.ts`
- `src/export-shipment-defaults/export-shipment-defaults.service.ts`
- `src/export-shipments/export-shipments.service.ts`
- `test/export-shipments-flow.e2e-spec.ts`

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음. `package.json`/lock 변경 없음. `carrier` 컬럼은 엔티티에 그대로 남아 있고(추가 전용 원칙 준수) 저장/조회에만 쓰이지 않도록 바뀜 — DB 스키마 변경 없음.

### 충돌 해결 내역
`git merge origin/main`(PR-196·PR-192 반영분 포함) 시 `src/export-shipments/export-shipments.service.ts` 1개 파일에서 자동 병합(auto-merge, 수동 개입 없음) — PR-196이 추가한 스타일 귀속 로직과 PR-193의 carrier 제거가 서로 다른 위치를 건드려 충돌 마커 없이 합쳐짐. 그 외 충돌 없음.

### 테스트 숫자

| 항목 | PR-193 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 63 suites / 798 tests | **65 suites / 834 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 65 suites / 507 tests | **66 suites / 519 tests** |
| 프론트 `vitest run` | (PR-193 보고서에 미기재) | **53 files / 346 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음(선행 반영분 PR-192·PR-196 포함으로 증가) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- 선적 기본정보(설정) 화면에 Carrier 입력 칸이 없다.
- 새 수출 선적 건을 생성하면 헤더의 Carrier가 기본값 없이 빈칸에서 시작한다.
- 건별 헤더에서 Carrier를 직접 입력하는 기능은 그대로 남아 있다(그 값은 저장·사용됨).

---

## 단계 1 · PR-190 (+amend2) — 작지 납기 연도 자동 보정("오늘(KST) 기준" 단순화)

- 브랜치: `fix/target-rdd-year-rollover`
- 병합 전 main SHA: `ebcae0c`(PR-193 보고서 커밋 직후)
- 병합 후 main SHA: `2c11087`
- 선행 단계: 없음

### 변경 파일 (origin/main...origin/fix/target-rdd-year-rollover, 10개)
- `frontend-app/src/api/salesOrders.service.ts`
- `frontend-app/src/components/SalesOrderUploadModal.tsx`
- `frontend-app/src/utils/salesOrderOverviewEdit.test.ts`
- `frontend-app/src/utils/salesOrderOverviewEdit.ts`
- `prompt-reports/PR-190-report.md`
- `src/sales-orders/dto/ai-analysis.dto.ts`
- `src/sales-orders/utils/target-rdd-year-rollover.util.spec.ts`
- `src/sales-orders/utils/target-rdd-year-rollover.util.ts`
- `src/sales-orders/vision.service.spec.ts`
- `src/sales-orders/vision.service.ts`

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음. `package.json`/lock 변경 없음. 브랜치 head가 `159d393`(amend2 이전 기준 SHA)의 자손임을 확인했고, `prompt-reports/PR-190-report.md`에 "7. 보강 — 납기 연도 보정을 '오늘(한국시간)' 기준으로 단순화" 절이 있음을 확인했다(amend2 반영 확인).

### 충돌 해결 내역
`git merge origin/main`(PR-192·PR-196·PR-193 반영분 포함) 시 `src/sales-orders/vision.service.spec.ts` 1개 파일, import 줄 1곳만 충돌:
- PR-192(이미 main)가 추가한 `import { GatewayTimeoutException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';`
- PR-190이 추가한 `import { VisionService, todayKstIso } from './vision.service';`의 `todayKstIso`

양쪽을 모두 살려 두 줄을 나란히 유지하는 것으로 기계적 해결(판단 개입 없음). 그 외 파일(`vision.service.ts` 본문, `salesOrders.service.ts`, `SalesOrderUploadModal.tsx`)은 자동 병합(충돌 없음).

### 테스트 숫자

| 항목 | PR-190 보고서 기준선(보강 후) | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 63 suites / 815 tests | **66 suites / 854 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 65 suites / 507 tests | **66 suites / 519 tests** |
| 프론트 `vitest run` | (PR-190 보고서에 미기재) | **53 files / 348 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음(선행 반영분 PR-192·PR-196·PR-193 포함으로 증가) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- 연도 없는 납기(예: "2/17")가 적힌 작지를 올리면 파란 "연도 자동 보정" 안내가 뜬다.
- 작성일 2026-01-01·납기 2/17인 작지는 납기가 2027-02-17로 채워지고 작성일은 그대로다.
- 납기를 직접 고치면 자동 보정 안내가 사라진다.

---

## 단계 3 · PR-197 — 작지 BOM 행 검토(제외·수정) + 저장된 BOM 삭제·자재 교체

- 브랜치: `feat/bom-row-review-and-delete`
- 병합 전 main SHA: `3c92528`(PR-190 보고서 커밋 직후)
- 병합 후 main SHA: `39f9eeb`
- 선행 단계: 단계 1(PR-190) — main에 있음 확인

### 변경 파일 (origin/main...origin/feat/bom-row-review-and-delete, 13개)
- `frontend-app/src/api/boms.service.ts`
- `frontend-app/src/components/ItemsManager.tsx`
- `frontend-app/src/components/SalesOrderUploadModal.tsx`
- `frontend-app/src/utils/salesOrderBomReview.test.ts`
- `frontend-app/src/utils/salesOrderBomReview.ts`
- `prompt-reports/PR-197-report.md`
- `src/boms/boms.controller.ts`
- `src/boms/boms.module.ts`
- `src/boms/boms.service.spec.ts`
- `src/boms/boms.service.ts`
- `src/boms/dto/swap-bom-item-material.dto.ts`
- `src/boms/dto/update-bom-item.dto.ts`
- `test/bom-item-delete-and-swap-flow.e2e-spec.ts`

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음. `package.json`/lock 변경 없음. `boms.controller.ts` diff 확인 결과 새 엔드포인트 `DELETE /boms/items/:id`, `PATCH /boms/items/:id/material`와 `UpdateBomItemDto` 확장 외에 기존 서버 동작 변경 없음.

### 충돌 해결 내역
`git merge origin/main`(PR-190·PR-192·PR-196·PR-193 반영분 포함) 시 `frontend-app/src/components/SalesOrderUploadModal.tsx` 1개 파일, 3곳 충돌 — 전부 PR-192(업로드 실패 안내: `uploadError`/`loadingElapsedSec`/`fallbackUsed` 상태·import)와 PR-197(BOM 행 검토: `excludedBomIndexes`/`editedBomIndexes`/`existingMaterialNames` 상태·import)이 서로 다른 기능을 나란히 추가한 것이라 **양쪽 다 유지**하는 것으로 기계적 해결(판단 개입 없음):
1. import 블록(상단) — 두 블록 모두 유지
2. state 선언 블록(컴포넌트 상단) — 두 블록 모두 유지
3. `handleClose()` 내 초기화 호출 — 두 그룹 모두 유지

### 테스트 숫자

| 항목 | PR-197 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 62 suites / 806 tests | **66 suites / 865 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 66 suites / 520 tests | **67 suites / 532 tests** |
| 프론트 `vitest run` | (PR-197 보고서에 미기재) | **54 files / 369 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음(선행 반영분 PR-190·PR-192·PR-196·PR-193 포함으로 증가) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- 작지 분석 화면에서 자재명세 행을 제외 체크하거나 값을 수정할 수 있다.
- 자재 마스터에 없는 새 이름은 "새 이름" 배지, 같은 소요량의 중복 행은 "중복" 배지가 뜬다.
- 품목 탭 BOM 보기에서 행을 삭제하거나 자재를 교체하면 부족분 표에 반영된다.
- 요척을 수정(예: 2.7→2.9)하면 변경 전/후를 보여주는 확인창이 뜨고, 확정하면 필요량(롤 수)이 재계산된다.

---

## 단계 5 · PR-194 — 여러 스타일 묶음 일괄발주(다품번 일괄발주) + 보완(시즌·브랜드 필터, 점검표 진입점)

- 브랜치: `feat/multi-style-bulk-order`
- 병합 전 main SHA: `5576f83`(PR-197 보고서 커밋 직후)
- 병합 후 main SHA: `5fd27eb`
- 선행 단계: 단계 4(PR-196) — main에 있음 확인(`f857c10` 조상)

### 게이트 A 추가 확인 — "구버전 PR-194" 여부
`prompt-reports/PR-194-report.md`(브랜치 버전)에 다음 4가지가 모두 반영돼 있음을 확인(최신 보완판):
① 점검표(발주·입고·출고 현황) 체크박스 열(`ProcurementStatusReport.tsx`)
② 시즌(연도+SS/FW)·브랜드·상태 드롭다운(`procurementStatusFilters.ts`의 `filterProcurementStatusRows`/`extractDistinctBrands`)
③ 30건 수동 선택 제한(`toggleStyleSelection` — 자동 상위 30개 선택 없음, 이미 선택된 건 항상 해제 가능)
④ PR-196이 추가한 `targetRdd`(시즌 필터가 사용)·`brand`(브랜드 필터가 사용)·`unlinkedPoCount`(배지 유지) 필드 사용
→ **최신 버전으로 확인, 진행.**

### 변경 파일 (origin/main...origin/feat/multi-style-bulk-order, 26개)
- `frontend-app/src/App.tsx`, `frontend-app/src/api/multiStyleBulkOrderApi.test.ts`, `frontend-app/src/api/purchaseOrders.service.ts`, `frontend-app/src/api/workOrders.service.ts`
- `frontend-app/src/components/MultiStyleBulkOrder.tsx`(신규), `ProcurementStatusReport.tsx`, `PurchaseOrdersManager.tsx`
- `frontend-app/src/utils/bomRequirementReport.ts`, `multiStyleBulkOrder.ts`(+test, 신규), `procurementStatusFilters.ts`(+test, 신규)
- `prompt-reports/PR-194-report.md`
- `src/common/utils/packaging-subtype.util.ts`(+spec), `src/purchase-orders/dto/combined-purchase-order-document.dto.ts`(신규), `purchase-order-document.service.ts`, `purchase-orders.controller.ts`, `purchase-orders.module.ts`, `utils/purchase-order-document.util.ts`(+spec)
- `src/work-orders/utils/material-requirements.util.ts`(+spec), `work-orders.controller.ts`, `work-orders.service.ts`
- `test/multi-style-bulk-order-flow.e2e-spec.ts`(신규)

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음. `package.json`/lock 변경 없음.

### 충돌 해결 내역
`git merge origin/main`(PR-190·PR-192·PR-196·PR-193·PR-197 반영분 포함) — **충돌 없음**(사전 dry-run `git merge-tree`에서도 충돌 0건 확인, 실제 병합도 자동 완료).

### 테스트 숫자

| 항목 | PR-194 보완 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 64 suites / 837 tests | **66 suites / 881 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 67 suites / 531 tests | **68 suites / 544 tests** |
| 프론트 `vitest run` | 55 files / 372 tests | **57 files / 405 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음(선행 반영분 PR-190·PR-192·PR-196·PR-193·PR-197 포함으로 증가) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것 (PR-194-report.md 체크리스트 기준)
- 발주·입고·출고 현황에서 연도+시즌(SS/FW)을 고르면 해당 기간 납기 스타일만 남고, "납기 미정 포함"을 켜기 전까지 납기 미정 스타일은 빠진다.
- 같은 화면에서 체크박스로 스타일을 고르고 "선택 스타일 다품번 일괄발주"를 누르면 다품번 일괄발주 화면으로 이동하면서 고른 스타일이 그대로 선택돼 있다(최대 30개, 30개 찬 상태에서 더 고르면 선택이 바뀌지 않고 안내만 뜬다).
- 같은 자재를 쓰는 스타일 중 하나만 발주하면, 발주·입고·출고 현황에서 그 스타일만 발주완료로 바뀌고 나머지 스타일은 미발주로 남는다(PR-196 회귀 없음).
- 다품번 일괄발주 결과 화면에서 업체별 발주서 다운로드가 동작한다.
- 발주 목록(기존 화면)의 체크박스 열·"선택 발주 합본 발주서" 버튼, 기존 단일 스타일 일괄발주(PR-179) 화면은 변경 없음.

---

## 단계 6 · PR-198 — 자재명세 엑셀 업로드: 기존 BOM과 비교해 사람이 고르는 덮어쓰기·교체 + 작지 스타일번호 유사 경고

- 브랜치: `feat/bom-excel-reconcile`
- 병합 전 main SHA: `8ee5125`(PR-194 보고서 커밋 직후)
- 병합 후 main SHA: `ee05e88`
- 선행 단계: 단계 3(PR-197) — main에 있음 확인

### 변경 파일 (origin/main...origin/feat/bom-excel-reconcile, 24개)
- `frontend-app/src/api/mapping.service.ts`, `styles.service.ts`
- `frontend-app/src/components/MappingPreviewModal.tsx`, `SalesOrderUploadModal.tsx`
- `frontend-app/src/utils/bomDiffReview.ts`(+test, 신규), `styleNoSimilarity.ts`(+test, 신규)
- `prompt-reports/PR-198-report.md`
- `src/boms/utils/bom-name-normalize.util.ts`(+spec, 신규)
- `src/mapping/controllers/mapping-commit.controller.ts`, `services/mapping-commit.service.ts`(+spec)
- `src/mapping/dto/bom-diff.dto.ts`, `bom-reconcile.dto.ts`(신규), `utils/bom-diff.util.ts`(+spec, 신규)
- `src/styles/dto/similar-master-styles.dto.ts`(신규), `styles.controller.ts`, `styles.service.ts`, `utils/style-no-similarity.util.ts`(+spec, 신규)
- `test/bom-excel-reconcile-flow.e2e-spec.ts`(신규)

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음(테스트는 전부 익명 데이터). `package.json`/lock 변경 없음. `src/mapping/services/mapping-commit.service.ts`의 기존 `commit()` 메서드 본문은 diff에 전혀 나타나지 않음(새 메서드 `diff()`/`reconcile()`만 추가) — 기존 `POST /mapping/commit` 동작·응답 변경 없음을 확인.

### 충돌 해결 내역
`git merge origin/main` 시 **충돌 없음** — 사실 병합할 것도 없었다. `feat/bom-excel-reconcile`가 분기한 지점(`8ee5125`)이 이번 게이트 A 시점의 `origin/main` 최신과 정확히 같아 `git merge origin/main`이 "Already up to date"로 끝남(새 커밋 없음, dry-run `merge-tree`도 충돌 0건 확인).

### 테스트 숫자

| 항목 | PR-198 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 69 suites / 917 tests | **69 suites / 917 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 69 suites / 555 tests | **69 suites / 555 tests** |
| 프론트 `vitest run` | 59 files / 425 tests | **59 files / 425 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

선행 단계가 더 반영되지 않아(이미 main과 동일 지점에서 분기) 기준선과 정확히 같음 — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- AI로 만든 BOM이 있는 스타일에 엑셀을 올리면(저장 버튼을 누르면) 비교 화면이 뜬다 — BOM이 없는 스타일은 비교 없이 바로 저장된다.
- "엑셀 기준으로 모두 맞추기"는 체크만 채워 줄 뿐이고, [적용]을 눌러야 실제로 반영된다.
- 이름만 다르고 소요량이 같은 중복 행이 "유사 짝(제안)"으로 한 줄에 묶여 나온다(자동 확정 아님, 사람이 "교체"를 직접 골라야 함).
- 작지 분석 화면에서 AI가 읽은 스타일번호가 기존 스타일과 끝 글자만 다르면 노란 안내와 "OOO로 바꾸기" 버튼이 뜨고, 버튼을 눌러야 입력칸 값이 바뀐다(자동 변경 없음).

---

## 단계 10 · PR-191 — 부족자재 표 헤더 어긋남 수정 + "수정하기"는 이 스타일 미입고 발주일 때만

- 브랜치: `fix/shortage-table-header-and-edit-button`
- 병합 전 main SHA: `8a391c9`(PR-198 보고서 커밋 직후)
- 병합 후 main SHA: `8559688`
- 선행 단계: 단계 4(PR-196)·단계 5(PR-194) — 둘 다 main에 있음 확인

### 게이트 A 추가 확인 — "불필요(이미 해결)" 여부
PR-191 보고서의 0단계에서 `origin/main`(당시 `8ee5125`, PR-196·PR-194 반영 후) 기준으로 두 증상을 코드로 직접 확인: (1) `ShortageTable` 헤더 어긋남 — **아직 있었음**(체크박스 `<td>`는 맨 앞, "일괄" `<th>`는 맨 뒤) (2) "수정하기" 판정이 스타일을 보지 않음 — **아직 있었음**(`PurchaseOrdersManager`가 `buildEditableOrderByItem(pendingOrders)`로 전체 미입고 발주를 자재 기준으로만 거름). 둘 다 미해결이라 **빈 PR이 아니라 실제 수정이 있는 PR**로 확인하고 진행.

### 변경 파일 (origin/main...origin/fix/shortage-table-header-and-edit-button, 6개) — 전부 `frontend-app/` 안
- `frontend-app/src/components/PurchaseOrdersManager.tsx`
- `frontend-app/src/components/ShortageTable.test.tsx`(신규)
- `frontend-app/src/components/StyleShortagePanel.tsx`
- `frontend-app/src/utils/purchaseOrderForm.test.ts`
- `frontend-app/src/utils/purchaseOrderForm.ts`
- `prompt-reports/PR-191-report.md`

백엔드 `src/` 변경 0건(`git diff --stat origin/main -- src/ test/` 확인, PR-191 보고서에도 명시), 마이그레이션 0건, `.env*`/엑셀/PDF/CSV/이미지 없음, `package.json`/lock 변경 없음. 바꾼 기존 테스트는 없음(보고서에 "기존 테스트를 수정한 것은 없다"로 명시 — `SearchSelectField.test.tsx`/`StyleShortagePanelLabels.test.tsx`/`multiStyleBulkOrder.test.ts` 재실행으로 회귀 없음만 재확인).

### 충돌 해결 내역
`git merge origin/main`(PR-198 반영분 포함) — **충돌 없음**(PR-198은 매핑/스타일 유사도 쪽이라 `StyleShortagePanel`/`PurchaseOrdersManager`와 겹치지 않음, dry-run `merge-tree`도 충돌 0건 확인).

### 테스트 숫자

| 항목 | PR-191 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | (백엔드 변경 없음, 재실행 대상 아님) | **69 suites / 917 tests**(PR-191 영향 없음, 기준선 그대로) |
| 백엔드 e2e(`--maxWorkers=2`) | (백엔드 변경 없음, 재실행 대상 아님) | **69 suites / 555 tests**(PR-191 영향 없음, 기준선 그대로) |
| 프론트 `vitest run` | 58 files / 421 tests | **60 files / 441 tests**(선행 PR-198 반영분 +2 files/+20 tests 포함) |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음 — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- 발주 화면 "스타일번호로 필요 자재 찾기" 표의 머리글과 값 열이 일치한다("필요 총수량" 열에 실제 필요 총수량이 보임).
- 이 스타일로 발주한 적 없는 자재는 "수정하기"가 뜨지 않고 "이 자재로 발주하기"가 뜬다.
- 다른 스타일의 미입고 발주가 있으면 자재명 아래 회색 "참고: 다른 스타일 미입고 발주 N건 있음" 문구만 뜬다(버튼 아님).
- 이 스타일에 연결된 미입고 발주가 있는 자재만 주황 "수정하기" 버튼이 뜬다.
- 다품번 일괄발주(PR-194)와 PR-196의 "미연결 발주" 안내는 그대로 동작한다(변경 없음).

---

## 단계 7 · PR-199 — 작지 AI 판독 정확도 측정 하네스 (DB 없음·읽기 전용·로컬 실행)

- 브랜치: `chore/vision-eval-harness`
- 병합 전 main SHA: `18bd713`(PR-191 보고서 커밋 직후)
- 병합 후 main SHA: `16a78a0`
- 선행 단계: 단계 2(PR-192) — main에 있음 확인

### 변경 파일 (origin/main...origin/chore/vision-eval-harness, 31개)
- `.gitignore`(`vision-eval-out/` 추가), `package.json`(`vision:eval`/`vision:eval:test`/`vision:eval:typecheck` 스크립트 3개만 추가)
- `src/sales-orders/vision.service.ts`(`PROMPT`·`RESPONSE_SCHEMA`에 `export`만 추가 — `git diff`로 `commit()`/`analyzeSalesOrder()` 본문 변경 없음 확인)
- `prompt-reports/PR-199-report.md`
- `scripts/vision-eval/` 전체(신규 — `types.ts`, `key-mask.util.ts`, `call-count.util.ts`, `manifest.util.ts`, `golden-extract.util.ts`, `model-runner.ts`, `pdf-tools.ts`, `signals.ts`, `cli.ts`, `scoring/`(style-field·date-field·bom-match·supplier-item·instability), `no-db-import.spec.ts`, 각 `.spec.ts`, `jest.config.js`, `tsconfig.json`)

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/`(결과물 디렉터리 자체) 저장소에 없음 — `.gitignore`에만 패턴 추가. `package.json`에 새 런타임 의존성 없음(스크립트 3개만). `vision.service.ts`는 export 추가 외 변경 없음을 diff로 재확인.

### 충돌 해결 내역
`git merge origin/main`(PR-191 반영분 포함) — **충돌 없음**. 이 브랜치가 PR-199 작업을 시작한 시점에 이미 main 최신(PR-191 포함)에서 분기했기 때문에 "Already up to date"로 끝남(dry-run `merge-tree`도 충돌 0건 확인).

### 테스트 숫자

| 항목 | PR-199 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 69 suites / 917 tests | **69 suites / 917 tests**(export만 추가해 기준선과 정확히 동일) |
| 백엔드 e2e(`--maxWorkers=2`) | 69 suites / 555 tests | **69 suites / 555 tests**(동일) |
| 하네스 전용 `npm run vision:eval:test` | 11 suites / 76 tests | **11 suites / 76 tests** |
| 백엔드 `tsc` · `build` / 하네스 `vision:eval:typecheck` | 통과 | 통과 |

기준선과 정확히 같음(선행 PR-191이 이미 분기 시점에 포함돼 있어 추가 증가 없음) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다. **화면 변화는 없다**(로컬 CLI 도구).

### 사용자가 할 것
로컬에서 `GEMINI_API_KEY`를 환경변수로 설정하고 파일럿을 돌려 `summary.md`를 가져온다(단계 8·PR-200의 합격 기준 비교에 쓴다). 명령 예시는 `prompt-reports/PR-199-report.md` 4번 항목 참고.

---

**다음 입력 필요**: Render 배포 확인 후 `배포확인: PR-199` 줄을 붙여 다시 보내 주세요.
