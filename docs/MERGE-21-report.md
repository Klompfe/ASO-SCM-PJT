# MERGE-21 — PR-212 main 반영 사전 점검 (게이트 0 결과)

대상: `feat/style-color-size-quantities` (SHA `2b96fa3`) → `main` (현재 `ffd3ceb`)

## 1. 대상 확인

- `origin/feat/style-color-size-quantities` SHA: `2b96fa3fb6fcacab199d31197508e8ad0bed54bb` — 사용자 입력과 일치.
- `origin/main` SHA: `ffd3ceb007354fba325ba108ff220dea2c0d08ff`.

## 2. 변경 파일 범위 (`git diff --name-only origin/main...origin/feat/style-color-size-quantities`, 19개)

| 구분 | 파일 |
|---|---|
| 마이그레이션 | `src/migrations/1792000000000-AddStyleColorSizeQuantities.ts` (신규 1개) |
| 엔티티/모듈 | `src/styles/entities/style-color-size-quantity.entity.ts`, `src/styles/styles.module.ts` |
| 스타일 조회/삭제 | `src/styles/styles.controller.ts`, `src/styles/styles.service.ts`, `src/styles/styles.service.spec.ts` |
| 파서/매핑 | `src/mapping/utils/style-color-size-quantity-parser.util.ts`(+spec), `src/mapping/utils/section-parser.util.ts`, `src/mapping/mapping.controller.ts`, `src/mapping/dto/commit-mapping.dto.ts`, `src/mapping/services/mapping-commit.service.ts`(+colorSizeQuantity.spec) |
| e2e | `test/style-color-size-quantities-flow.e2e-spec.ts` |
| 프런트 | `frontend-app/src/components/MappingPreviewModal.tsx`(+test), `frontend-app/src/utils/styleColorSizeQuantities.ts`(+test), `frontend-app/src/utils/commitNotices.ts` |
| 보고서 | `prompt-reports/PR-212-report.md` |

확인 결과:
- ① `src/migrations/`에 추가된 파일 **정확히 1개** — 충족
- ② 타임스탬프 `1792000000000` > main 최대(`1791800000000`) 및 미병합 `feat/mido-price-table-admin-r1` 최대(`1791900000000`) — 충족
- ③ 기존 마이그레이션 파일 수정 **0개** — 충족
- ④ `package.json`/락 파일 변경 **0개** — 충족
- ⑤ `.env*`, `*.xlsx/xls/pdf/csv`, 이미지, `vision-eval-out/` 없음 — 충족
- ⑥ 변경 범위가 수량 테이블/파서/커밋 서비스/스타일 조회·삭제/테스트/프런트/보고서로 한정 — 충족, 그 외 모듈 변경 없음

## 3. 마이그레이션 up/down SQL (인용)

```sql
-- up
CREATE TABLE "style_color_size_quantities" (
    "id" SERIAL NOT NULL,
    "styleNo" character varying NOT NULL,
    "color" character varying NOT NULL,
    "size" character varying NOT NULL,
    "market" character varying NOT NULL DEFAULT 'DOMESTIC',
    "qty" integer NOT NULL,
    "source" character varying NOT NULL DEFAULT 'MATERIAL_LIST',
    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_style_color_size_qty_key" UNIQUE ("styleNo", "color", "size", "market"),
    CONSTRAINT "PK_style_color_size_quantities" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_style_color_size_qty_styleNo" ON "style_color_size_quantities" ("styleNo");
ALTER TABLE "style_color_size_quantities"
  ADD CONSTRAINT "FK_style_color_size_qty_styleNo"
  FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- down
ALTER TABLE "style_color_size_quantities" DROP CONSTRAINT "FK_style_color_size_qty_styleNo";
DROP TABLE "style_color_size_quantities";
```

신규 테이블 추가뿐이며 기존 테이블/데이터 변경·삭제 없음. FK는 다른 `styleNo` 참조 테이블과 동일하게 `ON DELETE NO ACTION`(스타일 삭제 시 `StylesService.remove()`가 애플리케이션 레벨에서 먼저 삭제). 유니크 `(styleNo, color, size, market)` 확인.

## 4. 최신 main 합치기

브랜치(`feat/style-color-size-quantities`, `2b96fa3`)는 `origin/main`(`ffd3ceb`)을 이미 선조로 포함(`git merge-base --is-ancestor origin/main HEAD` → 참). 생성 이후 main에 새 커밋이 없어 **병합 불필요(변경 없음), 병합 커밋 없음, push 없음**.

## 5. 전체 검증

| 항목 | 하한 | 결과 | 비고 |
|---|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 | |
| 백엔드 `jest`(전체) | 1084 | ✅ 1084/1084 (73 suites) | |
| e2e (`--maxWorkers=2`) | 563 | ⚠️ 552/563, 11 실패 | `purchase-order-search-flow.e2e-spec.ts`에서 `POST /items`가 500 — PR-212 변경 파일과 무관, 동시성(worker 간 SQLite 경합) 플레이키니스로 판단 |
| e2e 재실행 (`--maxWorkers=1`) | 563 | ✅ 563/563 (70 suites) | 재실행 후 전부 통과 — 스스로 통과 처리하지 않고 재실행 근거 기록 |
| 프런트 `tsc -b` | 성공 | ✅ 성공 | |
| 프런트 `vitest run` | 529 | ✅ 529/529 (68 files) | |
| 프런트 `build` | 성공 | ✅ 성공 | 기존과 동일한 청크 크기 경고만 있음(신규 아님) |

숫자 감소 없음, 실패 0(재실행 기준). 게이트 0 통과.

## 6. 게이트 1 — Neon 테스트 브랜치 검증

테스트 브랜치 host(`ep-lucky-field-b3up1ef9.c-4.ap-southeast-1.aws.neon.tech`)로 접속 — 환경변수로만 덮어씀(`.env` 파일 미수정). 실행 전 연결 host가 `TEST_DB_HOST`와 일치하고 `.env`의 운영 host(`ep-soft-sound-b3lvd0oe...`)와 다름을 코드로 확인(일치 시 즉시 중단하도록 작성) — 통과.

| 항목 | 기대 | 실제 |
|---|---|---|
| ① 실행 전 상태 | `style_color_size_quantities` 없음 | ✅ 없음. `master_style` 84행 / `style_overview` 109행 / `bom_item_details` 3000행(변경 없어야 함). 마지막 적용 마이그레이션 `AddItemThreadTapeSubtype1791800000000` |
| ② `migration:run` 1회 | 성공, `migrations`에 `1792000000000` 기록 | ✅ 성공. `Migration AddStyleColorSizeQuantities1792000000000 has been executed successfully` |
| ③ 스키마 | 컬럼/타입/NOT NULL/기본값(`market` DEFAULT `'DOMESTIC'`, `source` DEFAULT `'MATERIAL_LIST'`), PK, UNIQUE(styleNo,color,size,market), styleNo 인덱스, FK→master_style(styleNo) | ✅ 전부 일치. `information_schema.columns` / `pg_constraint` / `pg_indexes`로 확인 |
| ④ 새 테이블 행 수 / 기존 테이블 불변 | 0 / 84·109·3000 | ✅ `{new_table:0, master_style:84, style_overview:109, bom_item_details:3000}` |
| ⑤ `migration:run` 재실행 | 변경 없이 종료 | ✅ `No migrations are pending` |
| ⑥ 제약 동작(트랜잭션+ROLLBACK, styleNo 값은 비공개) | INSERT 성공 / 중복 INSERT 유니크 위반 / 없는 styleNo FK 위반 / 음수 qty 허용(CHECK 없음, 설계 의도대로) / 참조 중인 스타일 삭제 시 FK 위반(CASCADE 아님) | ✅ 전부 기대대로. `23505`(unique), `23503`(FK) × 2, 음수 qty `ALLOWED`. 종료 후 새 테이블 행 수 0으로 복귀 |
| ⑦ `migration:revert` → 재실행(왕복) | 테이블 삭제 후 다른 테이블 행 수 불변 → 재실행으로 복구 | ✅ revert 후 `style_color_size_quantities` 없음, 나머지 84/109/3000 불변 → `migration:run` 재실행으로 테이블 복구, 0행 |

**결론**: 테스트 브랜치 기준 마이그레이션 up/down/재실행/제약조건 모두 설계대로 동작. 운영 DB에는 어떤 명령도 실행하지 않았음(연결 자체가 테스트 브랜치 host로만 한정). 테스트 브랜치는 현재 마이그레이션이 적용된 상태(복구 완료)로 남아 있음.

게이트 1 통과. **main에는 아무것도 반영하지 않았음 — 여기서 멈춤.** 게이트 2(`Render 확인 완료` 문구 필요)는 사용자 승인 전까지 진행하지 않음.

---

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
