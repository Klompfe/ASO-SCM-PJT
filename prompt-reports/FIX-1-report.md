# FIX-1 완료 보고: 운영 DB 스키마 유실(export_shipment_lines 컬럼 2개) 긴급 복구 + 재발 방지

Written for: 이 저장소를 관리하는 개발자(운영 DB 복구 결과를 확인하려는 사람).

- 브랜치: `fix/schema-drift-repair` (`origin/main` `422bd6d`에서 분기)
- queue 정책: `pause-after` — push까지만, main 병합은 하지 않음.
- **운영 DB에 쓰기를 한 유일한 단계는 3단계의 `ADD COLUMN IF NOT EXISTS` 2개**(지시에서 명시적으로 승인된 범위). 1·2단계는 완전히 읽기 전용이었다.

## 1단계 — 전수 점검 결과 (읽기 전용)

`AppDataSource`(마이그레이션용, 모든 엔티티 로드, `synchronize: false`)의 `createSchemaBuilder().log()`로 "동기화한다면 실행될 쿼리"만 뽑고 **실행하지 않았다**. 결과:

| 분류 | 내용 |
|---|---|
| **엔티티엔 있는데 DB엔 없는 것(진짜 유실)** | `export_shipment_lines.materialSubType`(character varying), `export_shipment_lines.priceBasisNote`(text) — 이 2개뿐이었다. |
| **이름만 다른 것(유실 아님, 손대지 않음)** | `items`/`supplier_material_categories`의 FK 제약 3개와 `customs_exchange_rates`의 UNIQUE 제약 1개가 "DROP 후 재생성" 대상으로 나왔지만, 이건 마이그레이션이 명시적으로 지은 이름(`FK_items_category` 등)과 TypeORM 기본 네이밍 전략이 자동 생성하는 해시 이름이 다를 뿐 **제약 자체는 존재한다**. synchronize를 실행하면 멀쩡한 제약을 지웠다 재만드는 무의미한 변경이라 그대로 뒀다(지시의 "DROP 목록" — 손대지 말라고 한 항목에 해당). |
| **TypeORM이 원하는 보조 인덱스(유실 아님)** | `supplier_material_categories`에 `supplierId`/`categoryId` 각각의 단일 인덱스를 synchronize는 자동으로 만들고 싶어 하지만, 해당 마이그레이션은 애초에 PK+FK만 만들고 이 인덱스를 만든 적이 없다. "원래 있었는데 사라진 것"이 아니라 "synchronize 스타일과 마이그레이션 스타일의 차이"라 유실로 분류하지 않았고 손대지 않았다. |

### 지시받은 항목 개별 확인(읽기 전용, 전부 "존재함")

| 항목 | 결과 |
|---|---|
| `purchase_order.orderType` | 존재 |
| `purchase_order_lines`(테이블) | 존재 |
| `export_shipments.exchangeRateSource` | 존재 |
| `customs_exchange_rates`(테이블) | 존재 |
| `material_categories`(테이블, 10개 시드 전부) | 존재(겉감~기타, sortOrder 1~10) |
| `items.categoryId` | 존재 |
| `mido_price_items` 테이프 시드 2행(다데/암홀) | 존재 ("테이프(TAPE) 다데", "테이프(TAPE) 암홀") |
| `material_packaging_unit_rules` 시드 5행 | 전부 존재(AMHOL/COA_SA/DADE/OBA_SA_SKU_I_SA/POLY_JINUIDO) |
| `brand_price_rules`(테이블) | 없음 — **유실이 아니라 PR-185가 아직 main에 병합되지 않아서**(정상). |

**결론: 유실은 `export_shipment_lines`의 두 컬럼뿐이었다.** 다른 PR이 만든 테이블/컬럼/시드 데이터는 전부 온전했다.

### 데이터 손실 가능성 추정

- `export_shipment_lines`는 조회 결과 **전체 0행**이었다(수출선적서류는 1건 있지만 그 문서는 라인이 비어 있는 DRAFT). `priceSource`가 채워진(가격 확정된) 라인도, 콘/롤 단위(unit에 '콘'/'CONE'/'롤'/'ROLL' 포함) 라인도 0건이었다.
- **사람이 다시 확인해야 할 항목: 없음.** 컬럼이 없어진 시점에 그 컬럼에 실제 값이 들어 있던 라인 자체가 없었던 것으로 보인다(테이블이 비어 있으므로 "어떤 값이 사라졌는지"를 복구할 대상이 없다).

## 2단계 — 원인 확인 (읽기 전용)

- 이 PC에서 이번 대화(세션) 전체의 기록(약 5.6만 줄 jsonl)을 `node dist/main`, `nest start`, 운영 DB 호스트(`ep-soft-sound-b3lvd0oe`) 문자열로 훑었다. **운영 호스트를 가리키며 `NODE_ENV=production` 없이 서버/마이그레이션을 실행한 명령은 이 기록에서 찾지 못했다** — 확인한 명령들은 전부 같은 줄에 `NODE_ENV=production`을 함께 포함하고 있었다.
- 다만 **같은 세션 안에서 이미 한 번, 똑같은 매커니즘으로 사고가 난 전례가 있다**: `purchase_order.orderType` 컬럼이 "엔티티에 그 필드가 없는 오래된 체크아웃 상태에서 `node dist/main`(synchronize:true)을 운영 DB에 실행"해 지워졌고, 그때 복구한 기록이 이전 작업 요약에 남아 있다. 즉 **메커니즘 자체는 실제로 일어난 적이 있다**(내 스스로의 실행으로). `materialSubType`/`priceBasisNote` 건에 대해 똑같은 범인을 지목할 직접 증거는 이번 조사 범위(이 세션의 기록)에서는 못 찾았다 — 이전의 다른(압축되어 사라졌거나 이 PC의 다른) 세션에서 일어났을 가능성이 높다고 본다.
- **결론: "확인 불가"** — 정확한 실행 시점·명령은 특정하지 못했지만, 원인 메커니즘(`.env`가 운영을 가리킨 채 `NODE_ENV=production` 없이 실행 → synchronize가 켜져 엔티티에 없는 컬럼을 지움)은 이미 한 번 실증된 것과 동일하다고 판단해 4단계 재발 방지를 그 메커니즘 기준으로 설계했다.
- `package.json` 확인: `start:dev`는 `nest start --watch`(NODE_ENV 지정 없음, 로컬 `.env`의 `NODE_ENV` 값을 그대로 씀 — `.env`에는 `NODE_ENV` 키 자체가 없다). `test:e2e`는 `DB_TYPE=sqlite`를 테스트 파일 상단에서 강제하므로(`process.env.DB_TYPE='sqlite'`) 원격 Postgres를 건드리지 않는다. `.env`의 `DB_HOST`는 운영 Neon 호스트 그대로다(비밀번호 등은 보고서에 쓰지 않음).

## 3단계 — 운영 복구 (추가만)

### 적용한 SQL 전문

```sql
ALTER TABLE "export_shipment_lines" ADD COLUMN IF NOT EXISTS "materialSubType" character varying;
ALTER TABLE "export_shipment_lines" ADD COLUMN IF NOT EXISTS "priceBasisNote" text;
```

### 적용 전/후 컬럼 목록

- 적용 전: `materialSubType`/`priceBasisNote` 없음(쿼리 결과 0행).
- 적용 후: `materialSubType`(character varying), `priceBasisNote`(text) 둘 다 존재 확인.

### 복구 직후 확인

- `NODE_ENV=production`으로 로컬 서버를 운영 DB에 연결해(읽기 요청만) 확인:
  - `GET /export-shipments` → **200**, 실제 데이터(`id:16, styleNos:["PR157CBM..."], status:"DRAFT", lines: []`) 반환.
  - `GET /export-shipments/16` → **200**, 같은 데이터 반환.
- Puppeteer로 선적관리 > 수출 화면을 열어 목록이 에러 없이 렌더되는 것을 확인(스크린샷은 로컬 산출물로 저장, 레포에는 커밋하지 않음). 화면에 발주 #16(심지/INTERLINING, 다경, 수량 7)과 문서 #16이 정상적으로 나왔다.
- 이 확인에 쓴 임시 로그인 계정(`fix1-verify-…@test.com`)은 확인 직후 운영 DB에서 삭제했다(남은 테스트 데이터 없음).

### 다른 유실 항목

1단계에서 이 2개 컬럼 외에 "마이그레이션이 만들었어야 하는데 없는 것"은 발견되지 않았다 — 추가로 적용한 SQL은 없다.

## 복구 마이그레이션 (`fix/schema-drift-repair` 브랜치)

`src/migrations/1791650000000-RepairExportLineColumns.ts` 추가:

- `up()`: 위와 동일한 `ADD COLUMN IF NOT EXISTS` 2줄만.
- `down()`: 의도적으로 빈 구현(복구를 되돌리면 같은 사고를 반복하는 셈이라 revert를 막는다).
- 번호 `1791650000000`은 PR-184(`1791600000000`)와 PR-185 예정(`1791700000000`) 사이.

### Neon 테스트 브랜치(`ep-divine-scene-b3mhdu6u…`)에서 검증

- 이 테스트 브랜치는 운영을 복사해 만든 것이라 **같은 유실이 그대로 있었다**(복구 전 운영과 동일하게 `materialSubType`/`priceBasisNote` 없음 — 유실이 테스트 브랜치 생성 이전부터 있었다는 사실의 재확인이기도 하다).
- `migration:show`: `1791650000000`이 `[ ]`(미적용)으로 나옴.
- `migration:run`(1차): 두 컬럼이 새로 생성됨(쿼리 로그로 확인). 컬럼 조회 결과 둘 다 존재.
- `migration:run`(2차): `No migrations are pending` — 추가 실행 없이 깨끗하게 no-op.
- 테스트 브랜치는 이 보고 시점 기준 아직 살아 있었다(2026-10-10 13:59 KST 자동삭제 예정이라 이후 재확인이 필요하면 새로 만들어야 한다).

## 4단계 — 재발 방지 (`fix/schema-drift-repair` 브랜치, 같은 커밋 예정)

### 변경 내용

- 새 순수 함수 `shouldSynchronizePostgres({ dbSynchronize, dbHost })`(`src/common/database/should-synchronize-postgres.util.ts`):
  - `DB_SYNCHRONIZE === 'true'`가 아니면(미설정 포함) 항상 `false`.
  - `DB_SYNCHRONIZE === 'true'`이고 `DB_HOST`가 `localhost`/`127.0.0.1`/`postgres`(docker-compose 서비스명, 대소문자·공백 무시) 중 하나면 `true`.
  - 그 외(원격 호스트, 또는 `DB_HOST` 미설정)에는 **`RemoteSynchronizeError`를 던진다** — 서버가 시작되지 않는다.
- `src/app.module.ts`의 Postgres 연결 경로가 이 함수를 쓰도록 교체. **`NODE_ENV`는 더 이상 Postgres synchronize 여부를 결정하지 않는다.** sqlite 경로(e2e/로컬 전용)는 기존 `NODE_ENV !== 'production'` 로직을 그대로 유지(지시대로).
- `docs/DEPLOYMENT.md`에 `DB_SYNCHRONIZE` 환경변수 설명과 "원격 DB에서는 synchronize가 항상 꺼져 있다"는 문장을 추가(README는 건드리지 않음 — DB 관련 기존 문서가 `docs/DEPLOYMENT.md`였다).

### 로컬 개발 영향

- 로컬에서 Postgres(원격이 아닌 `localhost`/`postgres`)를 쓰면서 기존처럼 synchronize로 스키마를 자동 맞추고 싶으면 `.env`에 `DB_SYNCHRONIZE=true`를 **명시적으로** 추가해야 한다(이전엔 `NODE_ENV=production`만 안 쓰면 자동으로 켜졌다).
- 원격 DB(Neon 등 — 운영이든 테스트 브랜치든)에 연결해서 새 컬럼이 필요하면, 이제는 **무조건 `npm run migration:run`**을 써야 한다(synchronize로 "어쩌다 보니" 반영되는 경로 자체가 막혔다).

### 테스트

- `shouldSynchronizePostgres` 단위 테스트 5건(로컬/원격/명시적 설정/미설정/대소문자·공백/호스트 미설정 조합) — 전부 통과.
- 백엔드 전체 `jest`(59 suites / 726 tests)와 e2e 전체(`--maxWorkers=2`, 63 suites / 475 tests) 재실행 — 전부 통과(이 경로 변경이 sqlite 테스트에는 영향을 주지 않음을 확인).
- `npm run build` 통과.

### 브랜치

- `fix/schema-drift-repair` — 아직 커밋/푸시 전(이 보고 직후 커밋한다). main 병합은 보류(pause-after).
