# MERGE-48 — PR-244a 마이그레이션 사전 검증 결과 (Neon 테스트 브랜치)

대상: `feat/currency-columns-backend` @ `65dc907`, 병합 전 main `9ead89a`(origin/main 과 브랜치 병합 결과 "Already up to date").
마이그레이션: `1792300000000-AddCurrencyToBomItemAndPurchaseOrder.ts`

```sql
-- up
ALTER TABLE "bom_item_details" ADD COLUMN IF NOT EXISTS "currency" character varying(3) DEFAULT 'KRW'
ALTER TABLE "purchase_order"   ADD COLUMN IF NOT EXISTS "currency" character varying(3) DEFAULT 'KRW'
-- down
ALTER TABLE "purchase_order"   DROP COLUMN IF EXISTS "currency"
ALTER TABLE "bom_item_details" DROP COLUMN IF EXISTS "currency"
```

## 게이트 0 요약
- 변경 19개 파일, 전부 `src/`·`test/`. 마이그레이션 추가 1개(`1792300000000` > main 최대 `1792200000000`), 기존 마이그레이션 수정 0, package/lock·`.env*`·엑셀/이미지/`prompt-reports`·`frontend-app/` 변경 0.
- 엔티티 테이블 이름(`bom_item_details`, `purchase_order`)이 마이그레이션과 일치.
- 테스트(트리 동일, 65dc907): 백엔드 jest 1312 / e2e 622(80 스위트, `--maxWorkers=2`) / 프런트 vitest 808 — 하한 충족, 실패 0.

## 게이트 1 — Neon 테스트 브랜치 검증 (값 없음, 개수·구조·같음/다름만)
접속: 환경변수로 host 만 덮어씀(`.env` 미수정). 실행 전 코드로 "덮어쓴 host == 입력 TEST_DB_HOST, `.env` 의 운영 host 와 다름" 확인(통과).

| # | 항목 | 기대 | 실제 |
|---|---|---|---|
| 1 | 실행 전 currency 컬럼 | 두 테이블 모두 없음 | 없음 |
| 1 | 실행 전 행 수 / 단가 비교값 기록 | 기록 | bom_item_details 3141행, purchase_order 29행 / 단가 해시 기록(보고서에는 값 미기재) |
| 1 | 마지막 적용 마이그레이션 | 1792200000000 | 1792200000000 (`AddBomItemManualRequiredQty`) |
| 2 | `migration:run` 1회 | 이번 1개만 실행, 성공 | "1 migrations are new" → `AddCurrencyToBomItemAndPurchaseOrder1792300000000` 성공, 다른 마이그레이션 실행 없음, `migrations` 에 1792300000000 기록 |
| 3 | 스키마 | varchar(3), NULL 허용, 기본 'KRW' | 두 테이블 모두 character varying(3), nullable YES, default 'KRW' |
| 4 | 행 수 불변 | 3141 / 29 | 3141 / 29 (같음) |
| 4 | 단가 합계·순서별 해시 불변 | 같음 | 같음 |
| 4 | 기존 행 currency | 전부 'KRW', NULL 0 | bom_item_details 3141/3141 KRW, NULL 0 · purchase_order 29/29 KRW, NULL 0 |
| 5 | `migration:run` 재실행 | 변경 없음 | "No migrations are pending", 스냅샷 불변 |
| 6 | 트랜잭션 안 UPDATE 'USD' / NULL (ROLLBACK) | 둘 다 성공 | 두 테이블 모두 성공 |
| 6 | 롤백 후 `currency <> 'KRW'` 행 수 | 0 | 두 테이블 모두 0 |
| 7 | `migration:revert` 1회 | currency 두 컬럼만 제거, 행 수·단가 불변 | 두 컬럼 제거, 마이그레이션 기록 1792300000000 제거, 행 수·단가 해시 같음 |
| 7 | 다시 `migration:run` | 복구 | 성공, 컬럼·기본값 복구, 전 행 KRW(NULL 0), 스냅샷 같음 |

결론: 테스트 브랜치 최종 상태 = 마이그레이션 적용됨(운영 반영 전 상태 아님, 테스트 브랜치 한정). 운영 DB(.env host)에는 어떤 명령도 실행하지 않음.

main 병합은 하지 않음(게이트 2 는 `Render 확인 완료` 줄 필요).
