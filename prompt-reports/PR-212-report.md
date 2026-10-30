# PR-212 — 스타일별 색상×사이즈 수량 테이블 신설 + MATERIAL LIST(CLOOR/SIZE) 파서 확장

브랜치: `feat/style-color-size-quantities` (base: `origin/main` ffd3ceb, MERGE-20 반영 커밋) · **병합하지 않음.** 마이그레이션은 작성만 하고 이 단계에서 실행하지 않았습니다(운영 DB에 어떤 명령도 실행 안 함, SELECT 포함).

## 1. 마이그레이션 (추가 전용)

파일: `src/migrations/1792000000000-AddStyleColorSizeQuantities.ts`

**타임스탬프 선택 근거**: main의 현재 최대값은 `1791800000000`(`AddItemThreadTapeSubtype`). `git ls-tree origin/feat/mido-price-table-admin-r1 src/migrations/`로 확인한 그 브랜치의 마이그레이션은 `1791900000000`(`AddBrandTableCodeAndFabricLineUnit`)으로 main보다 큽니다. 둘 중 어느 쪽이 먼저 병합되든 순서가 꼬이지 않게 **`1792000000000`**(둘보다 큼)으로 정했습니다.

**최종 SQL**:
```sql
-- up()
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

-- down()
ALTER TABLE "style_color_size_quantities" DROP CONSTRAINT "FK_style_color_size_qty_styleNo";
DROP TABLE "style_color_size_quantities";
```
기존 테이블/데이터는 전혀 건드리지 않습니다(데이터 보정 SQL 없음, 다른 마이그레이션 파일 수정 없음).

**엔티티·FK 정책**: `src/styles/entities/style-color-size-quantity.entity.ts` — `OrderProcessStage`(동일 패턴: `styleNo` 컬럼 + `@ManyToOne(MasterStyle)` + `@JoinColumn`)를 그대로 따랐습니다. FK는 `ON DELETE NO ACTION`으로 — `master_style.styleNo`를 참조하는 다른 모든 테이블(`contract`/`order_shipments`/`order_process_stages`/`bom_master`)이 전부 이 정책이고, `StylesService.remove()`가 스타일 삭제 시 이 테이블들을 애플리케이션 레벨에서 먼저 지우는 관례를 그대로 따릅니다(DB가 CASCADE로 대신 처리하지 않음). **이번 PR에서 `styles.service.ts`의 `remove()`에 `StyleColorSizeQuantity` 삭제 한 줄을 추가했습니다** — 이게 없으면 수량이 있는 스타일을 삭제할 때 FK 위반으로 기존 삭제 기능이 깨지기 때문입니다(새 발견, 조용히 넘기지 않고 수정).

## 2. 파서 (`src/mapping/utils/style-color-size-quantity-parser.util.ts`, 순수 함수)

118개 시트(`misens.xlsx`/`vanek.xlsx`) 중 CLOOR/SIZE 헤더가 있는 모든 시트(65+73건)를 직접 열어 구조를 재확인했습니다(실제 업무 데이터는 저장소에 넣지 않았고, 테스트는 코드로 만든 합성 시트만 씁니다). 모두 CLOOR/SIZE가 절대행 index 3이었지만 **하드코딩하지 않고** 첫 20행을 훑어 찾습니다.

| 규칙 | 저장 | 경고/비고 |
|---|---|---|
| 정수 ≥0 | 저장 | — |
| 0 또는 빈 칸 | **저장 안 함** | 경고 없음(정책상 정상) |
| 소수·음수·문자 | 저장 안 함 | `QTY_CELL_INVALID`(위치 포함) |
| 색상 칸 빈칸 + 수량 있음 | `NA`로 저장 | `QTY_COLOR_BLANK` |
| 같은 색상 국내 블록에 2번 | 먼저 나온 행만 저장(합산 안 함) | `QTY_COLOR_DUPLICATE` |
| 중국 블록에 0 아닌 값 | 저장 안 함 | `QTY_CHINA_IGNORED`(시트당 1회만) |
| CLOOR/SIZE를 못 찾음 | 빈 결과 | `info` 안내만(업로드는 그대로 계속) |
| 집계 셀(TOTAL/EACH SIZE TOTAL) | **절대 안 읽음** | 색상×사이즈 원본 셀만 직접 합산 |

사이즈 열은 CLOOR/SIZE 오른쪽부터 "TOTAL" 텍스트가 나오기 전까지 비어있지 않은 칸을 전부 사이즈로 본다(2~4칸, `FREE` 등 문자도 허용, 중간 빈 칸은 건너뛸 뿐 멈추지 않음). 국내/중국 블록은 H열(index 7)에 라벨이 붙은 행을 찾아 그 행+다음 2행(3행 고정)으로 본다 — 이 또한 CLOOR/SIZE 행 위치에 상대적이라 헤더가 밀려도 같이 움직입니다(테스트로 확인).

BOM 파싱(`bomStartIndex=13`)은 전혀 건드리지 않았고, `SectionParser.parse()` 안에서 독립적으로 호출합니다.

## 3. `totalQty` 규칙

`headerRow[8]`(QTY) 기반 값은 그대로 유지합니다(PR-211 동작 불변— **들어온 값이 유효한 양수면 기존 값 유무와 무관하게 항상 그 값으로 갱신**하는 기존 규칙은 그대로 둡니다. 이 PR이 추가한 것은 그 값이 **못 읽혔을 때(0)의 새 대안**뿐입니다):

| 상황 | 동작 |
|---|---|
| headerRow 값이 유효한 양수 | 그 값으로 갱신(기존 PR-211 동작, 기존 값이 있어도 갱신됨) |
| headerRow 값이 0/못읽음 + 기존 값이 없음(0) | 색상×사이즈 합계(`totalQtyCandidate`)로 채움 |
| headerRow 값이 0/못읽음 + 기존 값이 이미 양수 | **절대 덮어쓰지 않음**(합계 후보로도) |
| 기존 양수 값을 그대로 둔 경우, 합계와 값이 다르면 | `TOTAL_QTY_MISMATCH` 알림(참고용, 기존값·합계값 둘 다 표시) |

주의: "기존 양수 totalQty는 절대 덮어쓰지 않는다"는 **합계 후보(totalQtyCandidate)에만** 적용됩니다. headerRow가 실제로 새 양수 값을 읽어온 경우는 그 값이 "다시 읽은 진짜 값"이라 PR-211 때부터 항상 갱신해 왔고, 이번 PR도 그 동작을 바꾸지 않았습니다(기존 테스트 `기존 215 + 파싱값 800(양수) → 800으로 갱신(기존 동작 유지)`로 재확인).

## 4. 재업로드 병합 규칙 (`mapping-commit.service.ts`, 같은 트랜잭션)

| 상황 | 동작 | 알림 |
|---|---|---|
| 새 (color,size), 기존에 없음 | INSERT(`source=MATERIAL_LIST`) | — |
| 기존 `source=MANUAL` | 건드리지 않음 | `QTY_KEPT_MANUAL`(건수) |
| 기존 값과 같음 | 변화 없음 | — |
| 기존 값과 다름(MANUAL 아님) | UPDATE | `QTY_UPDATED`(건수 + 상위 10건 "색상/사이즈: 이전→새") |
| 기존에 있고 새 시트에 없음 | **삭제 안 함** | `QTY_NOT_IN_SHEET`(건수만) |
| `colorSizeQuantities`를 안 보냄(구버전 프런트) | **전혀 손대지 않음**(위 알림도 없음) | — |

"안 보냄"과 "보냈는데 빈 배열"(CLOOR/SIZE를 못 찾은 정상 케이스)을 구분합니다 — 전자는 완전 무시(`undefined` 체크), 후자는 기존 행 전부를 "시트에 없음"으로 정직하게 알립니다.

알림 `type`은 기존 구조(`AUTO_APPLIED`/`NEEDS_REVIEW`)만 재사용했습니다(새 타입을 만들지 않음) — `QTY_UPDATED`=AUTO_APPLIED(값이 자동으로 바뀜), 나머지 3개(`QTY_KEPT_MANUAL`/`QTY_NOT_IN_SHEET`/`TOTAL_QTY_MISMATCH`)=NEEDS_REVIEW(자동 반영을 보류/건드리지 않음 — 기존 `FACTORY_MISMATCH`와 같은 결).

## 5. 조회 API

`GET /master-styles/:styleNo/quantities` (기존 `/master-styles/:styleNo` 관례 그대로). 권한: 다른 스타일 조회 API와 동일(가드 없음). 수량 없으면 `404`가 아니라 빈 배열.

**응답 예(합성 값)**:
```json
{
  "styleNo": "MB00TEST",
  "sizes": ["55", "66", "77"],
  "rows": [
    { "color": "BK", "size": "55", "qty": 260 },
    { "color": "BK", "size": "66", "qty": 250 },
    { "color": "BE", "size": "55", "qty": 240 }
  ],
  "totalByColor": [{ "color": "BK", "qty": 510 }, { "color": "BE", "qty": 240 }],
  "grandTotal": 750
}
```
사이즈 순서는 DB에 저장 당시 엑셀 열 순서를 보존하는 유일한 신호인 `id`(자동증가, 커밋 시 열 순서대로 insert) 오름차순 최초 등장 순으로 결정합니다.

## 6. 화면

`MappingPreviewModal.tsx`에 "색상×사이즈 수량" 표(행=색상, 열=사이즈, 마지막 행/열=합계)를 추가했습니다. 수량이 없으면 "수량표 없음". 총 생산수량 칸은 `totalQty`가 0이고 합계가 있으면 합계를 "(색상×사이즈 합계, QTY 칸 미기재)" 표시와 함께 보여줍니다. 파서 경고(`QTY_CHINA_IGNORED` 등)도 작은 안내 목록으로 보여줍니다. 기존 필요량 표시(PR-216 `materialRequirementDisplay.ts`)는 건드리지 않았습니다.

스타일 관리 화면(읽기 전용 표 추가)은 기존 상세 영역과 자연스럽게 맞물리는 지점을 찾지 못해(각 화면이 이미 자기 역할에 집중된 구조) **후속 후보로 남겼습니다**(§8).

## 7. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/migrations/1792000000000-AddStyleColorSizeQuantities.ts` | 신규 마이그레이션(유일) |
| `src/styles/entities/style-color-size-quantity.entity.ts` | 신규 엔티티 |
| `src/styles/styles.module.ts` | 엔티티 등록 |
| `src/styles/styles.service.ts` | `getColorSizeQuantities()` 추가, `remove()`에 삭제 라인 추가(FK 보호) |
| `src/styles/styles.controller.ts` | `GET :styleNo/quantities` 추가 |
| `src/styles/styles.service.spec.ts` | 새 리포지토리 의존성 모킹 추가(기존 테스트 깨짐 수정) |
| `src/mapping/utils/style-color-size-quantity-parser.util.ts` (+`.spec.ts`) | 신규 파서, 테스트 17건 |
| `src/mapping/utils/section-parser.util.ts` | 파서 연결, `ParsedSheetResult`에 필드 추가 |
| `src/mapping/mapping.controller.ts` | 파싱 응답에 `colorSizeQuantities`/`totalQtyCandidate` 추가 |
| `src/mapping/dto/commit-mapping.dto.ts` | `CommitColorSizeQuantityDto`, `totalQtyCandidate` 필드 추가 |
| `src/mapping/services/mapping-commit.service.ts` (+신규 spec) | 병합 로직, `mergeOverview` 확장, 테스트 10건 |
| `test/style-color-size-quantities-flow.e2e-spec.ts` | e2e 5건(업로드→커밋→조회→재업로드→변경) |
| `frontend-app/src/utils/styleColorSizeQuantities.ts` (+`.test.ts`) | 피벗 유틸, 테스트 2건 |
| `frontend-app/src/components/MappingPreviewModal.tsx` (+신규 test) | 수량표/경고 렌더, 테스트 5건 |
| `frontend-app/src/utils/commitNotices.ts` | 새 알림 코드 라벨 추가 |

## 8. 테스트 숫자(전/후)

| 항목 | 전(MERGE-20) | 후 | 증가 |
|---|---|---|---|
| 백엔드 jest | 1057 | **1084** | +27 |
| e2e(`--maxWorkers=2`) | 558 | **563** | +5 |
| 프런트 vitest | 522 | **529** | +7 |
| 백엔드 build | 성공 | 성공 | — |
| 프런트 build | 성공 | 성공 | — |

`git diff origin/main --stat` 확인: `src/migrations/`에 새 파일 **정확히 1개**, 기존 마이그레이션 수정 0, `package.json`/락 파일 변경 0, 엑셀/CSV/이미지 파일 0.

## 9. 후속 PR 후보

- 수동 수정 API/화면(색상×사이즈 수량을 사람이 직접 고치는 경로) — 이번 PR은 조회만.
- 중국 수량 지원(`market=CHINA`) — 테이블은 이미 열어뒀으나 저장 로직 없음.
- PR-213 발주 자동 채우기, PR-214 겉감 색상별 소요량 — 이번 PR의 기반 위에서 진행.
- 작지 AI 인식(`RESPONSE_SCHEMA`/PROMPT) 쪽 색상×사이즈 인식 — 손대지 않음.
- 스타일 관리 화면에 읽기 전용 수량표 추가 — 자연스러운 위치를 못 찾아 보류.
- Y/M 단위 정책이 확정되면(PR-216 열린 사항과 동일 맥락) 시트의 실제 "단위" 열 파싱도 함께 검토.

## 10. 사람이 화면에서 확인할 것 (병합·Neon 검증 후)

① 합성(또는 실제) MATERIAL LIST를 올리면 미리보기에 색상×사이즈 표와 합계가 보인다.
② 저장 후 같은 파일을 다시 올려도 수량이 중복되지 않고 변경 0(알림 없음).
③ 수량을 바꿔 다시 올리면 `QTY_UPDATED` 변경 알림이 보인다.
④ 기존 스타일의 양수 총수량이 재업로드 후에도 유지된다(헤더 QTY가 0으로 다시 읽혀도).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
