# MERGE-24 — PR-220 + PR-220b main 반영 보고서

대상: 브랜치 `feat/sheet-qty-per-bom-row` (head `553bef8`, 사용자 입력 SHA와 일치). **게이트 1까지 완료, main에는 아직 반영하지 않았습니다.** `Render 확인 완료` 줄이 없어 게이트 2는 진행하지 않습니다.

## 게이트 0 — 대상 확인 결과

- `origin/feat/sheet-qty-per-bom-row` = `553bef8`(일치). 커밋 이력에 PR-220(`77ab11d`, `eb5c41c`)과 PR-220b(`5693fa8`, `553bef8`) 모두 존재 확인.
- `origin/main` = `dd12a56`(분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/sheet-qty-per-bom-row`, 34개)

| 구분 | 파일 |
|---|---|
| 마이그레이션(신규, 1개) | `src/migrations/1792100000000-AddBomItemSheetQty.ts` |
| work-orders(계산) | `src/work-orders/utils/material-requirements.util.ts`(.spec), `src/work-orders/work-orders.service.ts`(.spec), `src/work-orders/work-orders.module.ts` |
| mapping(커밋) | `src/mapping/dto/commit-mapping.dto.ts`, `src/mapping/services/mapping-commit.service.ts`(.spec) |
| BOM 엔티티 | `src/boms/entities/bom-item.entity.ts`, `src/boms/utils/add-bom-item-sheet-qty.migration.spec.ts` |
| 비전 스키마 | `src/sales-orders/dto/ai-analysis.dto.ts`, `src/sales-orders/vision.service.ts`(.spec), `src/sales-orders/sales-orders.service.ts`(.spec) |
| styles(모듈 연결) | `src/styles/styles.module.ts` |
| e2e(7개) | `test/sales-order-sheet-qty-flow.e2e-spec.ts`, `test/sales-order-color-qty-flow.e2e-spec.ts`, `test/bom-active-review-flow.e2e-spec.ts`, `test/bom-requirement-by-style-flow.e2e-spec.ts`, `test/bom-requirements-flow.e2e-spec.ts`, `test/multi-style-bulk-order-flow.e2e-spec.ts`, `test/purchase-order-search-flow.e2e-spec.ts` |
| 프런트 | `frontend-app/src/api/salesOrders.service.ts`, `components/BomRequirementReport.tsx`, `components/PurchaseOrdersManager.tsx`, `components/SalesOrderUploadModal.tsx`, `components/ShortageTable.test.tsx`, `components/StyleShortagePanel.tsx`, `utils/bomRequirementReport.ts`(.test), `utils/purchaseOrderForm.test.ts` |
| 보고서 | `prompt-reports/PR-220-report.md`(PR-220b 장 포함) |

**검증 결과**: ① 신규 마이그레이션 **정확히 1개** ② 타임스탬프 `1792100000000` > main 최대값 `1792000000000` ③ 기존 마이그레이션 파일 수정 0개 ④ `package.json`/락 파일 변경 0개 ⑤ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ⑥ 범위 — 위 표 전부 `work-orders`/`mapping`/BOM 엔티티·마이그레이션/비전 스키마(`requiredQtyUnit` 추가만)/테스트/`frontend-app`/`prompt-reports` 범위 안입니다. **`src/styles/styles.module.ts` 1곳만 지시서가 나열한 범위에 직접 이름이 없었지만**, `WorkOrdersService`가 PR-220b의 색상×사이즈 수량표 조회(`StylesService.getColorSizeQuantities`)를 재사용하려면 그 서비스를 `exports`해야 해서 필요한 최소 배선입니다 — 중단하지 않고 진행했으며, 다르게 판단하시면 알려 주세요.

### 마이그레이션 SQL 인용

```sql
-- up
ALTER TABLE "bom_item_details" ADD "sheetQty" decimal;
ALTER TABLE "bom_item_details" ADD "sheetQtyUnit" character varying;
-- down
ALTER TABLE "bom_item_details" DROP COLUMN "sheetQtyUnit";
ALTER TABLE "bom_item_details" DROP COLUMN "sheetQty";
```

컬럼 추가만(NULL 허용, 기본값 없음), 기존 컬럼 변경·삭제 없음. down은 추가한 2개 컬럼만 역순으로 삭제. 확인 완료.

### PR-220-report.md 요약

계산 우선순위(확정): ① `sheetQty`(작지 수량, 단위 일치) → ② 같은 색상의 색상×사이즈 수량표(PR-212) 합계 × 요척 → ③ 색상 없음/`FREE`/`N/A`(공통 행) → 전체 수량 × 요척(기존 동작) → ④ 색상은 있는데 근거 없음 → "색상별 수량 확인 필요"(숫자 생성 안 함). PR-220 테스트 1128(이후 PR-220b로 1143), 프런트 553(이후 558), e2e 1차 통과(PR-220/220b 모두 보고서에 기록된 전수).

### 충돌 해결

없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1143 이상, 실패 0 | ✅ **1143/1143** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 558 이상, 실패 0 | ✅ **558/558** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 1 — Neon 테스트 브랜치 검증 결과

`TEST_DB_HOST`는 환경변수로만 덮어써서 사용했습니다(`.env` 파일 미수정). 실행 전 코드로 확인: 덮어쓴 `DB_HOST`가 `TEST_DB_HOST`와 일치하고 `.env`의 운영 host와 다름을 확인(둘 다 `true`) — 이후 모든 마이그레이션 명령을 진행했습니다.

| 항목 | 기대 | 실제 |
|---|---|---|
| 실행 전 — `sheetQty`/`sheetQtyUnit` 컬럼 | 없음 | 없음(빈 배열) |
| 실행 전 — 행 수(`bom_item_details`/`bom_master`/`master_style`) | 참고용 | 3000 / 109 / 84 |
| 실행 전 — 마지막 적용 마이그레이션 | `AddStyleColorSizeQuantities1792000000000`(main 최신과 동일) | 일치 |
| `migration:run` 1회 | 성공, 새 마이그레이션 1개만 실행 | ✅ "1 migrations are new migrations must be executed" → `AddBomItemSheetQty1792100000000`만 실행·성공 |
| 스키마 확인 | `sheetQty` decimal/nullable, `sheetQtyUnit` varchar/nullable, 기본값 없음 | ✅ 둘 다 `is_nullable='YES'`, `column_default=null` |
| 행 수 불변 | 3000 / 109 / 84 | ✅ 3000 / 109 / 84(동일) |
| 기존 행의 새 컬럼 전부 NULL | NOT NULL 개수 0 | ✅ `sheetqty_not_null=0`, `sheetqtyunit_not_null=0` |
| `migration:run` 재실행(멱등성) | 변경 없이 종료 | ✅ "No migrations are pending" |
| 트랜잭션 내 UPDATE→ROLLBACK | 값 채움 성공 → NULL 복귀 성공 → 롤백 후 잔존 없음 | ✅ 영향 행 1건씩, 롤백 후 재조회 NOT NULL 개수 0 |
| `migration:revert` 1회 | 새 컬럼만 제거, 행 수·다른 컬럼 불변 | ✅ 컬럼 삭제됨, 행 수 3000/109/84 동일 |
| `migration:run`으로 복구 | 원상 복구 | ✅ 재실행 성공, 테스트 브랜치는 마이그레이션 적용된 상태로 남음 |

(값 자체는 보고서에 적지 않았습니다 — 구조·행수·성공/실패만 기록.)

## 게이트 2 — main 반영 결과

사용자 입력에 `Render 확인 완료` 확인 — 진행.

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `dd12a56` |
| 병합 후 main SHA(= 병합 SHA) | `3814bee` |
| 병합 방식 | `git merge --ff-only feat/sheet-qty-per-bom-row` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `4d033e9...` — 게이트 0 검증 당시 브랜치 트리와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**Render는 배포 시작 때 `npm run migration:run:prod`를 자동 실행하므로 이 push가 곧 운영 마이그레이션입니다.**

`git push origin main` 완료(`dd12a56..3814bee`).

## 사용자가 배포 후 확인할 것

1. Render Live, 배포 로그에 새 마이그레이션(`AddBomItemSheetQty1792100000000`)이 적용됐다는 줄, `/health` 200, Cloudflare 빌드 성공.
2. 같은 작지(MB74BLM107Z)를 수주등록으로 다시 올린다(Gemini 1회 호출). 자재명세 초안에서 겉감 BL 행은 작지에 인쇄된 BL 수량(≈760), KH 행은 KH 수량(≈758)으로 보이고 1518이 두 행에 반복되지 않는지.
3. 색상은 있는데 작지 수량도 수량표도 없는 행은 숫자 대신 "색상별 수량 확인 필요"가 보이는지(전체 수량 대체 없음).
4. 발주관리 > 발주 탭 [A] 부족자재 표에서 겉감이 색상별 두 줄로 나뉘어 각각 올바른 필요량이 보이는지. "이 자재로 발주하기"를 누르면 [B] 수량 칸이 비어 있는지.
5. 예전에 올려 둔 자료는 이 PR 이후에 다시 올려야 작지 수량이 채워지는지(과거 데이터는 자동으로 바뀌지 않음).

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지, 이미 적용된 마이그레이션은 별도 절차 필요).
