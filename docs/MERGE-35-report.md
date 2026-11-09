# MERGE-35 — PR-231(BOM 행 "필요수량 직접 지정") 게이트 0/게이트 1 검증 결과

대상: 브랜치 `feat/bom-manual-required-qty`. **main에는 아무것도 반영하지 않았다**(게이트 2 미진행 — "Render 확인 완료" 줄 없음). 이 보고서는 브랜치에만 커밋한다.

## SHA 확인 메모
지시서의 기대 SHA는 `9d4ce96`(PR-231 코드 `cbb6add` + 보고서 `9d4ce96`)였으나 실제 브랜치 head는 `2c4a3de`였다. 확인 결과 `2c4a3de`는 이전 세션에서 이미 수행한 "최신 main 합치기"(당시 main=PR-230까지)의 병합 커밋이고 PR-231 자체 코드(`cbb6add`)·보고서(`9d4ce96`) 내용은 변경되지 않았음을 확인(사용자 승인 후 계속 진행).

## 게이트 0 — 대상 확인 / 최신 main 합치기 / 전체 검증

### 1) 브랜치 변경 파일 범위 점검 (PR-231 고유 변경, `git diff origin/main...feat/bom-manual-required-qty` 기준, main 합치기 이후)
| 항목 | 결과 |
|---|---|
| ① `src/migrations/`에 추가된 파일 수 | **1개**(`1792200000000-AddBomItemManualRequiredQty.ts`) |
| ② 타임스탬프가 main의 최신 마이그레이션(`1792100000000-AddBomItemSheetQty`)보다 큼 | ✅ (`1792200000000`) |
| ③ 기존 마이그레이션 파일 수정 | **0개** |
| ④ `package.json`/락 파일 변경 | **0개** |
| ⑤ `.env*`/`*.xlsx`/`*.xls`/`*.pdf`/`*.csv`/이미지/`vision-eval-out/` | **없음** |
| ⑥ 변경 범위 | 엔티티(`bom-item.entity.ts`), 마이그레이션 1개, DTO(`update-bom-item.dto.ts`), 서비스(`boms.service.ts`+spec), `material-requirements.util.ts`(+spec), `mapping-commit.service.ts`(+spec), 프런트(`appliedQuantity.ts`+test, `bomQtyReason.ts`, `bomRequirementReport.ts`, `ItemsManager.tsx`, `StyleShortagePanel.tsx`, `boms.service.ts`, `ShortageTableManualBadge.test.tsx`), `prompt-reports/PR-231-report.md` — **기대 범위와 일치**, 그 밖의 모듈 변경 없음 |

**부가 발견(해결됨)**: PR-231의 feat 커밋(`cbb6add`) 자체는 범위에 없는 `prompt-reports/PR-230-report.md`를 삭제하는 변경을 포함하고 있었다(발견 당시 현재 main에는 그 파일이 존재). 다만 브랜치의 이후 "main 합치기" 병합 커밍(`2c4a3de`, 이전 세션)이 main 쪽 내용을 가져오면서 이미 해당 파일을 복구한 상태였음을 확인(브랜치 HEAD 기준 파일 존재, 추가 조치 불필요).

### 2) 마이그레이션 up/down SQL (`1792200000000-AddBomItemManualRequiredQty.ts`)
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
컬럼 추가만(전부 nullable, 기본값 없음), 기존 컬럼/행 값 변경 없음. down은 추가한 3개 컬럼만 역순으로 제거. ✅ 기준 충족.

### 3) PR-231-report.md 요약 + 코드로 재확인
- 우선순위: **수동 지정 > 색상×사이즈 수량표 > 총수량×요척 > 작지 값 > 근거 없음**(전: 수동 없이 동일한 순서).
- 저장 위치: `bom_item_details`(= `BomItem`)에 컬럼 3개 추가.
- 재저장 병합: 같은 (자재명,색상,규격) 재커밋 시 수동 값 유지(코드 변경 없이 보존), `reconcile() REPLACE`(자재 교체)는 수동 값 초기화(설계 결정).

코드로 직접 재확인한 4개 항목:
| 확인 항목 | 결과 |
|---|---|
| ① PATCH로 null 해제 가능 + 범위 검증 | ✅ `manualRequiredQty?: number \| null`에 `@IsOptional @IsNumber @Min(0) @Max(1_000_000_000)` — null도 `@IsOptional`로 통과해 해제로 처리 |
| ② 수동 행에서 불일치/오독/비정상 요척 경고가 숨겨지는지 | ✅ `material-requirements.util.ts`: `hasManualQty`이면 `rowBasis='manual'`을 최우선 분기로 사용하고, `if (unitMatches && rowBasis !== 'manual')` 가드로 작지-대조 집계(`sheetPresentCount` 등, 경고 판단의 기반)에서 완전히 제외 |
| ③ 수동 값 없는 행이 PR-226/228과 동일 | ✅ `hasManualQty`가 아닐 때의 분기(`isCommonColor`/`colorQtyValue`/`unitMatches`/기타)는 기존 PR-226/228 코드 그대로(수동 분기만 앞에 추가됨), 회귀 테스트(`material-requirements.util.spec.ts`) 포함 |
| ④ `mapping-commit.service.ts`가 새 컬럼을 건드리지 않는지 | ✅ `commit()` 경로는 새 컬럼을 전혀 참조하지 않음(PR-233 병합 후에도 동일). `reconcile() REPLACE`만 명시적으로 3개 컬럼을 `null`로 초기화(자재 교체 시 의도된 동작) |

### 4) 최신 main 합치기
- `git merge origin/main`(main=`36cdcdb`, PR-232/MERGE-36/PR-233/MERGE-37 포함) — **자동 병합 성공, 충돌 없음**(`ItemsManager.tsx`, `mapping-commit.service.ts`, `mapping-commit.service.spec.ts` 3개 파일이 양쪽에서 각자 다른 위치를 수정해 기계적으로 합쳐짐). 병합 커밋 `15ab406`, push 완료.
- 병합 후 전체 테스트에서 `mapping-commit.service.spec.ts`의 PR-231 전용 테스트 1건이 mock 설정 문제로 실패(PR-233이 `commit()`의 자재 조회를 `findOne`→`find`+메모리 매칭으로 바꾼 데 따른 기존 mock의 `find(Item)` 분기 누락, 기능 코드 문제 아님) — mock만 보강해 커밋 `08b6015`로 push.

### 5) 전체 테스트 결과 (하한 대비)
| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ |
| 백엔드 `jest`(전체) | 1214 이상 | ✅ **1214/1214** |
| 프런트 `tsc -b` | 성공 | ✅ |
| 프런트 `vitest run` | 681 이상 | ✅ **681/681** |
| 프런트 `npm run build` | 성공 | ✅ |
| e2e(`--maxWorkers=2`) | 584 이상, 실패 0 | ✅ **584/584 — 1차 통과**(재시도 불필요) |

검증 완료 시점 브랜치 HEAD: `08b6015`, 트리 해시: `33bbe8a92...`.

## 게이트 1 — Neon 테스트 브랜치 검증

테스트 브랜치 host는 환경변수(`DB_HOST`)로만 덮어써 사용했다(`.env` 파일 미수정). 매 실행 전 코드로 "덮어쓴 host == TEST_DB_HOST" 그리고 "덮어쓴 host != .env 운영 host"를 확인했다(둘 다 충족 — 운영 DB에는 어떤 명령도 실행하지 않음).

### 1) 실행 전 상태
| 항목 | 값 |
|---|---|
| 새 컬럼 3개 존재 여부 | 없음(0건) |
| `bom_item_details` 행 수 | 3053 |
| `bom_master` 행 수 | 109 |
| `master_style` 행 수 | 84 |
| 마지막 적용 마이그레이션 | `AddBomItemSheetQty1792100000000`(main과 동일 — 이 PR의 마이그레이션 외에는 밀린 것 없음) |

### 2) `migration:run` 1회
- 결과: **성공**. "1 migrations are new migrations must be executed" — **이번 PR의 마이그레이션 1개만** 실행됨. `migrations` 테이블에 `1792200000000` 기록.

### 3) 스키마 확인 (실행 후)
| 컬럼 | 타입 | NULL 허용 | 기본값 |
|---|---|---|---|
| `manualRequiredQty` | numeric | YES | 없음 |
| `manualRequiredQtyNote` | character varying(200) | YES | 없음 |
| `manualRequiredQtyAt` | timestamp without time zone | YES | 없음 |

### 4) 행 수 불변 + 새 컬럼 전부 NULL
| 항목 | 기대 | 실제 |
|---|---|---|
| `bom_item_details` 행 수 | 3053(불변) | 3053 ✅ |
| `bom_master` 행 수 | 109(불변) | 109 ✅ |
| `master_style` 행 수 | 84(불변) | 84 ✅ |
| 새 컬럼 NOT NULL 행 수 | 0 | 0 ✅ |

### 5) `migration:run` 재실행(멱등성)
- 결과: **"No migrations are pending"** — 변경 없이 종료. ✅

### 6) 트랜잭션 내 동작 확인(반드시 ROLLBACK, 값 미기록)
| 항목 | 기대 | 실제 |
|---|---|---|
| ① 기존 행 1건에 3개 컬럼 UPDATE | 성공 | ✅ 성공(3개 컬럼 모두 값 있음 확인) |
| ② 같은 행을 NULL로 되돌림 | 성공 | ✅ 성공(3개 컬럼 모두 NULL 확인) |
| ROLLBACK 이후 새 컬럼 NOT NULL 행 수 | 0 | ✅ 0 |

### 7) `migration:revert` → `migration:run` 왕복
| 단계 | 기대 | 실제 |
|---|---|---|
| `migration:revert` 1회 | 새 컬럼 3개만 제거, 다른 컬럼/행 수 불변 | ✅ 3개 컬럼 제거, 행 수 3053/109/84 불변, 마지막 마이그레이션이 `AddBomItemSheetQty1792100000000`으로 되돌아감 |
| `migration:run`으로 복구 | 다시 1개 실행, 테스트 브랜치가 "마이그레이션 적용된" 상태로 남음 | ✅ 복구 완료 |

**게이트 1 결론: 전부 통과.** 테스트 브랜치는 현재 마이그레이션이 적용된 상태로 남아 있다(왕복 검증 완료 후 복구함).

---

## 여기서 멈춤

"Render 확인 완료" 줄이 없으므로 **게이트 2(main 병합)는 진행하지 않았다.** main에는 어떤 커밋도 push하지 않았다. 다음 단계가 필요하면 "Render 확인 완료" 줄을 붙여 재지시한다.
