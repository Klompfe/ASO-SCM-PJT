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

**다음 입력 필요**: Render 배포 확인 후 `배포확인: PR-197` 줄을 붙여 다시 보내 주세요.
