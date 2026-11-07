# PR-231 — 자재명세(BOM) 행의 "필요수량 직접 지정(수동)" 추가

브랜치: `feat/bom-manual-required-qty` (origin/main에서 분기). 마이그레이션 1개(additive-only). **병합하지 않음 — push만.**

## 1. 현황 파악

### 1-1. 기존 수정 API / 계산 적용 지점

| 대상 | 현재 상태 |
|---|---|
| `BomItem`(`bom_item_details`) | `consumption`(요척)·`requiredQty`(저장 스냅샷)·`sheetQty`/`sheetQtyUnit`(작지 원문, PR-220)만 있음 — 수동 지정 값을 저장할 컬럼 없음. |
| 수정 API `PATCH /boms/items/:id` (`UpdateBomItemDto` → `BomsService.updateItem`) | `composition/hsCode/threadType/tapeType/consumption/spec/colorCode/category`만 받음. 권한 가드 없음(다른 인증 사용자와 동일 — `setActiveBom`만 MANAGER/ADMIN 제한, `updateItem`은 제한 없음, 이번 PR도 그대로 유지). |
| 서버 소요량 계산 `calculateMaterialRequirements`(`material-requirements.util.ts`) | 자재(Item) 단위로 **BOM 행을 합산**하며, 행마다 우선순위(PR-226) `색상×사이즈 수량표 > 총수량×요척 > 작지 값 > 근거 없음`을 적용. **이 PR이 손댄 유일한 서버 계산 지점.** |
| 프런트 계산 `resolveAppliedQuantity`(`appliedQuantity.ts`) | 서버와 같은 규칙을 **BOM 행 1개 단위**로 복제(PR-222/226/228). `ItemsManager.tsx`(자재·BOM 조회)가 직접 쓴다. |
| [A] 부족자재 표 (`StyleShortagePanel.tsx`) | `calculateMaterialRequirements`의 결과(자재 단위 집계)를 그대로 보여준다 — **행 하나 = 자재 하나**(색상이 여러 개면 합쳐짐). |
| 재저장 병합(`mapping-commit.service.ts`) | 같은 (자재명,색상,규격)이면 `commit()`은 `sheetQty/sheetQtyUnit`만 갱신, 다른 필드는 건드리지 않고 `continue`(존 PR-212/220 원칙). `reconcile()`의 `OVERWRITE`/`REPLACE`는 로드한 엔티티를 그대로 `save()`하므로 명시적으로 건드리지 않는 컬럼은 보존된다. |

### 1-2. 저장 위치 결정

**`bom_item_details`(= `BomItem` 엔티티)에 새 컬럼 3개 추가**를 그대로 선택했다 — `sheetQty`/`sheetQtyUnit`과 같은 테이블(그 행 하나의 소요량 관련 값)이고, 조회(`GET /boms?styleNo=`)가 엔티티를 그대로 돌려줘 프런트 전달도 추가 작업 없이 된다. `manualRequiredQtyBy`(지정한 사람)는 **만들지 않았다** — `grep -rn "ReviewedBy\|UpdatedBy\|CreatedBy\|ApprovedBy" src`가 0건이라 이 코드베이스에 아직 그런 감사(audit) 컬럼 패턴이 없음을 확인했다(지시사항의 "없으면 만들지 말 것" 조건).

## 2. 마이그레이션 (`src/migrations/1792200000000-AddBomItemManualRequiredQty.ts`, 1개)

```sql
-- up
ALTER TABLE "bom_item_details" ADD "manualRequiredQty" decimal;
ALTER TABLE "bom_item_details" ADD "manualRequiredQtyNote" character varying(200);
ALTER TABLE "bom_item_details" ADD "manualRequiredQtyAt" timestamp;

-- down
ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQtyAt";
ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQtyNote";
ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQty";
```
세 컬럼 모두 nullable, 기본값 없음, 기존 컬럼/데이터 변경 없음. 타임스탬프 `1792200000000`은 `origin/main`의 최신 마이그레이션(`1792100000000-AddBomItemSheetQty`)보다 큼. **엔티티의 `manualRequiredQtyAt`는 `@Column({ nullable: true })`로 타입을 명시하지 않았다** — `type: 'timestamp'`를 명시하면 sqlite(e2e 테스트 DB)가 `DataTypeNotSupportedError`를 던진다는 걸 e2e 실행 중 발견(기존 `Item.packagingReviewedAt`도 같은 이유로 타입 생략); 타입 없이 두면 TypeORM이 TS `Date` 타입에서 드라이버별 컬럼 타입(Postgres `timestamp` / sqlite `datetime`)을 추론한다. 마이그레이션 SQL 자체는(운영 DB가 Postgres라) `timestamp`로 그대로 둔다.

## 3. 우선순위 — 전/후

| | 전(PR-226/228) | 후(PR-231) |
|---|---|---|
| 적용 순위 | 색상×사이즈 수량표(color-qty) > 총수량×요척(computed) > 작지 값(sheet, 계산값 없을 때만) > 근거 없음(unknown) | **수동 지정(manual) > 색상×사이즈 수량표 > 총수량×요척 > 작지 값 > 근거 없음** |
| 경고(불일치/오독/비정상 요척) | 계산값·작지 값이 같이 있으면 적용 | **수동 지정 행에서는 전혀 계산하지 않는다**(집계에 들어가지 않음) — 경고 필드 자체가 `undefined`로 남는다 |
| needsColorQty | 색상 있고 근거 없음 | 수동 지정하면 **해제**(needsColorQty → false, 수동 값이 우선) |

서버(`material-requirements.util.ts`)·프런트(`appliedQuantity.ts`) 양쪽에 **같은 교차 fixture 원칙**으로 적용했다(`manual` basis 추가, 경고 필드는 수동일 때 전부 `false`/미설정).

### 자재 단위 집계와 "행" 단위 수동 지정의 경계(알려진 한계)

`calculateMaterialRequirements`는 **자재(Item) 단위**로 여러 BOM 행(색상별)을 합산한다. 수동 지정은 **행 단위**이므로, 같은 자재에 색상 행이 여러 개이고 그중 일부만 수동 지정이면:
- `basis`는 `'mixed'`가 된다(수동 아닌 다른 행의 근거와 섞여서).
- 그래도 `hasManualOverride: true`(새 필드)가 있어 화면이 "수동 지정 포함" 배지를 보여줄 수 있다.
- 비-수동 행에서 온 불일치 경고는 그 행 몫으로 그대로 뜬다(수동 지정 행 자신의 경고만 숨겨진다 — 의도된 동작).

대부분의 자재는 색상당 한 행이라(또는 공통 색상 한 행) 실무 영향은 적다고 보고, 완전한 행별 분리는 이번 PR 범위를 벗어난다고 판단해 미루었다.

## 4. 재저장 병합 / 자재 교체 동작

| 동작 | 수동 값 유지 여부 | 근거 |
|---|---|---|
| **같은 작지/엑셀 재업로드**(`mapping-commit.service.ts commit()`, 같은 (자재명,색상,규격)) | **유지** | 기존 코드가 `sheetQty`/`sheetQtyUnit`만 바꾸고 나머지(수동 컬럼 포함)는 손대지 않은 채 같은 엔티티를 `save()`한다 — 회귀 테스트로 확인(아래 4절). |
| **`reconcile()` OVERWRITE**(같은 자재, 값만 갱신) | **유지**(코드 변경 없음, 로드한 엔티티를 그대로 save) | 명시적으로 건드리지 않음 — 같은 자재에 대한 사람의 판단이라 유지가 맞다고 판단. |
| **자재 교체**(`BomsService.swapMaterial`, `reconcile() REPLACE`) | **초기화(해제)** — 기본값으로 선택 | "이 자재(행)"에 대한 사람의 판단이라 자재 자체가 바뀌면 더 이상 유효하지 않다(사용자 확정 요구사항 "이어지지 않는 것을 기본으로"). |
| **행 삭제** | 해당 없음(행 자체가 없어짐) | — |

## 5. 수동 값을 읽는 곳 / 읽지 않는 곳

| 화면/API | 반영 여부 |
|---|---|
| `GET /boms?styleNo=`(자재·BOM 조회) | ✅ 엔티티 그대로 반환되므로 `manualRequiredQty`/`Note`/`At` 자동 포함 |
| `PATCH /boms/items/:id`(수정 API) | ✅ 이번 PR에서 추가 |
| `GET /work-orders/style-requirements`([A] 부족자재 표, `calculateMaterialRequirements`) | ✅ `basis='manual'`/`hasManualOverride` |
| `ItemsManager.tsx` "소요수량" 주 값(`resolveAppliedQuantity`) | ✅ |
| `StyleShortagePanel.tsx`([A] 표) | ✅ "수동 지정 포함" 배지 |
| **BOM 소요명세서(`BomRequirementReport.tsx`)·엑셀 내보내기** | ❌ **미적용(건드리지 않음)** — 지시사항대로 범위 확장 금지, 목록만 보고 |
| **저장 화면 초안(`SalesOrderUploadModal.tsx`)** | ❌ 수동 입력 추가하지 않음(지시사항) — 저장 전 BOM 행이 아직 없어 수동 값을 불러올 경로도 없음(변경 없음) |

## 6. 구현 요약

- **엔티티** `src/boms/entities/bom-item.entity.ts`: `manualRequiredQty`(decimal, nullable), `manualRequiredQtyNote`(varchar(200), nullable), `manualRequiredQtyAt`(Date, type 생략 — 위 3절 참고).
- **DTO** `update-bom-item.dto.ts`: `manualRequiredQty?: number | null`(`@IsOptional @IsNumber @Min(0) @Max(1e9)`), `manualRequiredQtyNote?: string | null`(`@IsOptional @IsString @MaxLength(200)`). `@IsOptional()`은 class-validator 규칙상 `undefined`/`null` 둘 다 하위 검증을 건너뛰므로 `null`도 그대로 통과해 서비스가 "해제" 요청으로 처리한다.
- **서비스** `boms.service.ts updateItem()`: `manualRequiredQty === null`이면 세 컬럼 모두 해제, 숫자면 소수 3자리로 반올림 저장 + `manualRequiredQtyAt = now()`, 값은 안 보내고 사유만 보내면 사유만 갱신(값·시각은 그대로). `BomItemBeforeSnapshot`에도 추가해 변경 로그에 남는다. `swapMaterial()`은 자재 교체 시 세 컬럼을 명시적으로 초기화.
- **서버 유틸** `material-requirements.util.ts`: `RequirementBomItem.manualRequiredQty` 추가, 행별 `rowBasis` 판단에서 수동 값을 최우선 분기로 추가(`unitMatches` 대조 집계에서도 배제), `basis`에 `'manual'` 추가, `hasManualOverride` 신규 노출 필드.
- **매핑 병합** `mapping-commit.service.ts`: `reconcile() REPLACE` 분기에 자재 교체 시 세 컬럼 초기화 추가(그 외 경로는 코드 변경 없음 — 이미 보존됨).
- **프런트 유틸** `appliedQuantity.ts`: `resolveAppliedQuantity`에 `manualRequiredQty`/`manualRequiredQtyNote` opts 추가, `basis`에 `'manual'`, 경고 3종(`mismatch`/`sheetQtyLooksLikeTotalQtyMisread`/`extremeConsumptionMismatch`) 전부 수동일 때 `false`, `manualNote` 신규 필드. `APPLIED_BASIS_LABEL.manual = '수동'`.
- **`bomQtyReason.ts`**: `LiveQtyReasonInput.basis`에 `'manual'` 추가(타입만 — manual은 항상 값이 있어 이유 없음, 로직 변경 없음).
- **`bomRequirementReport.ts`**(프런트 타입): `MaterialRequirementRow.basis`에 `'manual'`, `hasManualOverride` 추가.
- **`ItemsManager.tsx`**: 수정 모드에 "필요수량 직접 지정" 숫자 입력(placeholder에 지금 계산값) + 단위 표시 + 사유 입력(선택, 200자) + "수동 지정 해제(계산값 사용)" 버튼(확인 없이 즉시 저장+새로고침) 추가. 저장 시 계산값과 10배 이상(또는 1/10 이하) 차이 나면 `window.confirm`. 소요수량 주 값 옆에 "수동" 배지(title에 계산값(참고)·지정 시각·사유).
- **`StyleShortagePanel.tsx`**: `hasManualOverride`면 "수동 지정 포함" 배지. 경고는 코드를 추가로 숨기지 않았다 — 서버가 수동 행은 애초에 그 필드들을 채우지 않으므로 자연히 안 뜬다.
- **`boms.service.ts`(프런트 API 모듈)**: `BomItemRow`/`UpdateBomItem`에 세 필드 타입 추가.

## 7. 테스트 (합성 값, Gemini 호출 없음)

| 영역 | 파일 | 추가 개수 |
|---|---|---|
| 서버 유틸(우선순위/경고 숨김/0 허용/해제/needsColorQty 해제/포장환산/mixed) | `material-requirements.util.spec.ts` | 6 |
| 서버 수정 API(설정/사유/0/해제/사유만/미전송 시 유지) | `boms.service.spec.ts` (updateItem) | 6 |
| 서버 자재 교체 초기화 | `boms.service.spec.ts` (swapMaterial) | 1 |
| 재저장 병합 보존 / REPLACE 초기화 | `mapping-commit.service.spec.ts` | 2 |
| 프런트 유틸(우선순위/0/회귀/needsColorQty 해제/사유/qty 그대로) | `appliedQuantity.test.ts` | 6 |
| [A] 표 배지/경고 숨김(정적 렌더) | `ShortageTableManualBadge.test.tsx`(신규 파일) | 3 |
| **합계** | | **24** |

`ItemsManager.tsx`의 수정 모드 입력(입력/저장 호출/확인창/배지)은 이 프로젝트의 테스트 환경(jsdom/testing-library 없음, `editingBomItemId` 상태 상호작용이 필요해 `renderToStaticMarkup`으로 도달 불가 — 기존 PR-226~230과 같은 제약)에서 직접 검증할 수 없다. 핵심 로직(`resolveAppliedQuantity`의 수동 분기, 10배 확인 조건의 `isExtremeConsumptionMismatch` 재사용)은 순수 함수 테스트로 검증했다.

### 테스트 숫자 (전/후)
| | 전(MERGE-33 기준) | 후 |
|---|---|---|
| 백엔드 jest | 1199 | **1214**(+15) |
| 프런트 vitest | 666 | **675**(+9) |
| e2e | 569 | **569**(1차 `--maxWorkers=2`에서 전부 통과) |
| 백엔드 `npm run build` | — | ✅ |
| 프런트 `tsc -b` / `npm run build` | — | ✅ / ✅ |

**e2e 관련 발견**: 1차 실행에서 `DataTypeNotSupportedError: Data type "timestamp" ... is not supported by "sqlite"`로 전체 72개 스위트가 `beforeAll` 타임아웃으로 실패했다(앱 부팅 자체가 안 됨) — `manualRequiredQtyAt` 엔티티 컬럼에 `type: 'timestamp'`를 명시한 게 원인이었다. `Item.packagingReviewedAt`의 기존 주석(타입 생략 규칙)을 보고 같은 방식으로 수정한 뒤 재실행해 1차에 569/569 전부 통과했다(마이그레이션 자체의 `timestamp` SQL은 Postgres 운영 DB용이라 그대로 둠).

## 8. 알려진 한계
- 같은 자재에 여러 색상 BOM 행이 있고 일부만 수동 지정이면 `basis`가 `'mixed'`로 보일 수 있다(3절 참고) — `hasManualOverride`로 보완했지만 완전한 행별 UI 분리는 하지 않았다.
- `manualRequiredQtyBy`(지정한 사람) 컬럼은 만들지 않았다 — 이 코드베이스에 아직 그런 감사 컬럼 패턴이 없어서(지시사항에 따른 결정).
- BOM 소요명세서/엑셀 내보내기는 이번 PR에서 전혀 건드리지 않았다(지시사항) — 필요하면 후속 PR에서 같은 패턴(`manualRequiredQty` 필드 추가 + `basis='manual'` 분기)으로 확장 가능.
- 저장 화면 초안(`SalesOrderUploadModal.tsx`)은 BOM 행이 아직 생성되기 전 단계라 수동 값을 불러올 경로 자체가 없다(변경 없음, 지시사항과 일치).

## 9. 병합 시 필요한 것
**마이그레이션이 있으므로 Neon 테스트 브랜치에서 `up()` 실행 검증이 필요하다.** 이번 PR에서는 운영 DB 접근·마이그레이션 실행을 전혀 하지 않았다(지시사항).

## 10. 사람이 화면에서 확인할 것 (병합·배포 후, 자재·BOM 조회)

1. 행 "수정"에 "필요수량 직접 지정" 칸이 있고 placeholder에 지금 계산값이 보인다.
2. 값을 넣고 저장하면 소요수량이 그 값으로 바뀌고 옆에 "수동" 배지가 붙는다(title에 계산값·지정 시각·사유).
3. 실/테이프는 수동 값 기준으로 N롤/N콘이 계산된다.
4. 발주관리 [A] 표의 필요량이 같은 수동 값이고 "수동 지정 포함" 배지가 보인다.
5. "수동 지정 해제(계산값 사용)"를 누르면 즉시 계산값으로 돌아간다(확인창 없음).
6. 같은 작지를 다시 저장해도(재업로드) 수동 값이 유지된다.
7. 계산값과 10배 이상 다른 값을 넣으면 저장 전 확인창이 뜬다.

변경 파일: 백엔드 8개(`bom-item.entity.ts`, `update-bom-item.dto.ts`, `boms.service.ts`+`.spec.ts`, `material-requirements.util.ts`+`.spec.ts`, `mapping-commit.service.ts`+`.spec.ts`) + 마이그레이션 1개, 프런트 7개(`appliedQuantity.ts`+`.test.ts`, `bomQtyReason.ts`, `bomRequirementReport.ts`, `ItemsManager.tsx`, `StyleShortagePanel.tsx`, `boms.service.ts`) + 신규 테스트 1개. `package.json`/락 파일 변경 없음.
