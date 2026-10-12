# PR-188 완료 보고: 미도 단가표 관리(일괄 등록) + 미도 브랜드 게이팅 + 빈폴/에잇세컨즈 원단 단위 M

Written for: 이 저장소를 관리하는 개발자(마이그레이션/검증 결과를 확인하려는 사람).

- 브랜치: `feat/mido-price-table-admin` (`origin/main` `00138e0`에서 분기)
- queue 정책: `pause-after` — main 병합은 하지 않음. 푸시는 이 브랜치만.
- 운영 DB: 마이그레이션 실행·서버 기동 없음. 이 PR 작업 범위에서는 운영 DB를 전혀 조회하지도 않았다(이전 PR들과 달리 읽기 전용 투자도 필요 없었음 — 전부 sqlite e2e로 검증).
- **마이그레이션이 있는 PR입니다** — `src/migrations/1791900000000-AddBrandTableCodeAndFabricLineUnit.ts`. main 반영 시 Neon 테스트 브랜치 사전 검증이 필요합니다.

## 1. 구현 요약

| 영역 | 내용 |
|---|---|
| A. 마이그레이션 `1791900000000` | `brand_prefix_rules`에 `priceTableCode`/`fabricLineUnit`(둘 다 nullable) 추가 + 미센스/반에크/루미에반에 `priceTableCode='MIDO'`, 빈폴/에잇세컨즈에 `fabricLineUnit='M'` UPDATE(이미 값이 있으면 건드리지 않음 — `IS NULL` 가드). `mido_price_items`에 `isActive boolean NOT NULL DEFAULT true` 추가. 전부 `ADD COLUMN IF NOT EXISTS`. |
| B. 단가표 후보 브랜드 게이팅 | `PriceReferenceService`가 브랜드 판정과 동시에 `brand_prefix_rules.priceTableCode==='MIDO'`인지 확인해, 미도 브랜드일 때만 미도 단가표 후보(종류 판정/환산/경고 포함 PR-187 로직 전체)를 만든다. 미도가 아니면(또는 브랜드 미상이면) 미도 후보를 아예 만들지 않고 `note`로 안내한다. 브랜드 전용가(`BRAND_RULE`, 뮤트)는 미도 여부와 무관하게 그대로 유지. |
| C. 미도 단가표 관리 API | `POST /mido-price-table`(등록) · `PATCH /:id`(수정/사용중지, 삭제 API 없음) 전부 MANAGER/ADMIN. `POST /import/preview`(CSV → NEW/CHANGED/SAME/ERROR 분류, DB에 안 씀, 권한 제한 없음) · `POST /import/apply`(선택한 행만, all-or-nothing 트랜잭션, MANAGER/ADMIN). `mido_price_items.isActive=false`인 행은 후보 검색(`findCandidates`)·기본 목록 조회에서 제외되지만 관리 화면(`includeInactive=true`)에서는 보인다. |
| D. 프론트 "미도 단가표" 화면 | 사이드바 "마스터·설정"에 추가. 목록(검색, 사용 중지 포함 토글) + 등록/수정/사용중지 폼(MANAGER/ADMIN만, USER는 조회만 + 안내) + CSV 일괄 등록(양식 다운로드, 파일 선택/붙여넣기, 미리보기 표, 신규만 기본 체크·변경은 기본 해제, 선택 적용). |
| E. 테스트 | 아래 5절. |
| F. 수출서류 원단 라인 단위 | `export-shipments.service.ts`의 `generate()`가 FABRIC 라인에서 스타일의 브랜드를 판정해 `brandPrefixRule.fabricLineUnit`이 있으면 `Item.unit`보다 우선 사용(숫자는 그대로, 단위 표기만). 부자재/실/테이프 라인과 기존 생성된 문서는 영향 없음. |

## 2. 마이그레이션 SQL 전문

```sql
-- up()
ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "priceTableCode" character varying;
ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "fabricLineUnit" character varying;
ALTER TABLE "mido_price_items" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

UPDATE "brand_prefix_rules" SET "priceTableCode"='MIDO'
  WHERE "brandName" IN ('미센스','반에크','루미에반') AND "priceTableCode" IS NULL;
UPDATE "brand_prefix_rules" SET "fabricLineUnit"='M'
  WHERE "brandName" IN ('빈폴','에잇세컨즈') AND "fabricLineUnit" IS NULL;

-- down()
ALTER TABLE "mido_price_items" DROP COLUMN IF EXISTS "isActive";
ALTER TABLE "brand_prefix_rules" DROP COLUMN IF EXISTS "fabricLineUnit";
ALTER TABLE "brand_prefix_rules" DROP COLUMN IF EXISTS "priceTableCode";
```

`down()`의 UPDATE 되돌리기는 없다(원래 null이었던 값으로 복구될 뿐 — `DROP COLUMN`이 값 자체를 지우므로 별도 UPDATE 역연산이 필요 없다). 기존 `brand_prefix_rules`/`mido_price_items` 행의 다른 컬럼 값은 전혀 건드리지 않는다.

**운영에 미센스/반에크/루미에반/빈폴/에잇세컨즈라는 정확한 이름의 `brandName` 행이 이미 존재해야** UPDATE가 적용된다. 이번 PR은 운영 DB를 조회하지 않아 그 행들이 실제로 그 이름 그대로 존재하는지 확인하지 못했다 — **main 반영 전 Neon 테스트 브랜치에서 `SELECT "brandName", "priceTableCode", "fabricLineUnit" FROM brand_prefix_rules WHERE "brandName" IN ('미센스','반에크','루미에반','빈폴','에잇세컨즈')`로 5개 브랜드가 전부 업데이트됐는지 확인이 필요하다.**

## 3. F절 — "원단 단위 YD 고정 코드" 후속 검토 목록

`generate()`의 FABRIC 라인 생성부 외에 원단 단위를 하드코딩한 곳을 검색했다. **추가로 발견된 곳 없음** — `src/export-shipments/utils/packing-color-split.util.ts`의 "야드 합계" 주석과 `PackingReceiptRoll`/`CreatePackingReceiptDto`의 "야드" 설명은 필드(`lengthYd`)의 역사적 의미를 적은 주석일 뿐 실제 단위 문자열을 강제하지 않는다(이미 빈폴/에잇세컨즈 데이터가 이 칸에 미터 값을 넣고 있다는 전제와 일치). 프론트(`frontend-app/src/components/*.tsx`, `api/*.ts`)에서도 `'YD'` 하드코딩은 없었다. INVOICE의 단가표 후보 로직(`price-reference.service.ts`의 `unitMismatchWarning` 등)은 이번 PR에서 변경하지 않았다.

## 4. API 목록(신규/변경)

| 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|
| GET | `/mido-price-table` | 인증 | `?includeInactive=true`로 전체, 기본은 사용 중인 행만(신규) |
| GET | `/mido-price-table/candidates` | 인증 | 기존과 동일(내부적으로 `isActive=true`만 사용하도록 변경) |
| POST | `/mido-price-table` | MANAGER/ADMIN | 신규 |
| PATCH | `/mido-price-table/:id` | MANAGER/ADMIN | 신규(수정 + `isActive` 토글, 삭제 API 없음) |
| POST | `/mido-price-table/import/preview` | 인증 | 신규, DB에 쓰지 않음 |
| POST | `/mido-price-table/import/apply` | MANAGER/ADMIN | 신규, all-or-nothing |
| GET | `/purchase-orders/price-reference` | 인증 | 기존 — 응답에 `note` 필드 추가(선택), 미도 브랜드가 아니면 `candidates`에서 `MIDO_TABLE` 후보 제외 |

## 5. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **63 suites / 834 tests** 통과 (PR-188 신규: CSV 파서 15건, `MidoPriceTableService` 관리 API 20건, `price-reference.service.spec.ts`에 브랜드 게이팅 4건 추가) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **66 suites / 522 tests** 통과 — 신규 `mido-price-table-admin-flow.e2e-spec.ts`(8건), `export-shipments-flow.e2e-spec.ts`에 F절 5건 추가, `purchase-order-style-pricing-flow.e2e-spec.ts`에 브랜드 게이팅 2건 추가. (※ 전체 병렬 실행 중 `import-shipments-dpkl-flow`/`import-shipments-first-documentation-flow`의 실제 대용량 파일 파싱 테스트가 리소스 경합으로 1회씩 타임아웃났으나, 단독 재실행 시 둘 다 정상 통과 — 이 PR과 무관한 기존 플레이키 테스트임을 확인.) |
| 프론트 `tsc -b` | 통과 |
| 프론트 `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **53 files / 333 tests** 통과 (신규: `midoPriceImport.test.ts` 3건 — 미리보기 기본 체크 로직, `MidoPriceTableManagerLabels.test.tsx` 3건) |

### 실제 등록 예정 CSV 형식(쉼표/큰따옴표) 검증
`parseMidoPriceCsv`가 RFC 4180 표준 CSV 인용 규칙(쉼표 포함 필드는 `"..."`로 감싸고, 필드 안의 `"`는 `""`로 이스케이프)을 직접 구현했다. 실제 예시(`겉감(POLYESTER 95%, POLYURETHANE 5%)`, `안감(LINING POLYESTER 100%) 58"/60"`)를 그대로 단위 테스트와 e2e 양쪽에 넣어 정확히 파싱되는 것을 확인했다.

## 6. 하지 않은 것(명시적 지시 준수)

- `MidoPriceTableService.findCandidates`의 토큰 부분일치 매칭 로직 — 변경 없음(`isActive` 필터만 추가).
- 운영 DB 접속/마이그레이션 실행, 단가표 데이터를 코드·시드에 넣는 것 — 전부 화면에서 CSV로 등록.
- INVOICE의 단가표 후보 로직(`export-shipments` 쪽 참고단가), PR-187 환산 로직, 발주 계약방식(FOB/CMT) 판단 — F절의 원단 라인 단위 기본값 외에는 변경 없음.
- 브랜드 전용가(`brand_price_rules`, 뮤트)와 미도 단가표의 통합 — 두 체계 그대로 분리 유지.
- 삭제 API 추가 — 의도적으로 만들지 않음(실수 방지, `isActive` 토글만).

## 7. `isActive` 도입 사유(재확인)

기존 시드 행 `겉감(폴리에스터 57"/58" 혼방)`(0.03~0.07)이 실제로는 배색 항목의 값이 겉감으로 잘못 라벨링된 것으로 보인다는 지적이 있었다. 이번 PR은 그 행을 자동으로 고치거나 지우지 않았다 — 새 배색 행을 등록한 뒤 기존 행을 화면에서 "사용 중지" 토글로 끌 수 있게만 해 두었다(사람이 직접 판단·조작).

## 8. 브랜치 SHA

커밋 완료 후 `feat/mido-price-table-admin` 푸시 — SHA는 아래 완료 메시지에서 확인.
