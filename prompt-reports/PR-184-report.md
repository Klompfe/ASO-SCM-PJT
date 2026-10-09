# PR-184 완료 보고: 관세청 주간환율(수출/수입) + INVOICE 환율 추천 + 수입통관 참고 표시 + 로그인 팝업

Written for: 이 저장소를 관리하는 개발자(마이그레이션/검증 결과를 확인하려는 사람).

- 브랜치: `feat/customs-exchange-rates` (`origin/main`의 `0504335`에서 분기해 작업 — 이후 `origin/main`이 PR-183 반영으로 `0c45e61`까지 움직여 MERGE-6에서 병합/충돌 해결함, 7절 참고)
- queue 정책: `pause-after`로 시작했으나, MERGE-6 지시에서 "Render 확인 완료" 확인을 받아 main 반영까지 진행함(8절).
- 운영 DB: 직접 마이그레이션 실행·서버 기동 없음(아래는 모두 Neon 테스트 브랜치에서 수행). sqlite e2e·단위 테스트에 더해, MERGE-6에서 테스트 브랜치 기준 실데이터 점검을 추가로 수행했다(7절).

## 1. 구현 요약

| 영역 | 내용 |
|---|---|
| 마이그레이션 `1791600000000` | `customs_exchange_rates` 테이블 생성(유니크: rateType+currency+validFrom). `export_shipments`에 nullable `exchangeRateSource` 컬럼 1개 추가. 그 외 기존 테이블/컬럼/데이터는 건드리지 않음. 시드 데이터 없음(실제 환율은 담당자가 입력). |
| 백엔드 모듈 | `src/customs-exchange-rates/`: CRUD(쓰기는 MANAGER/ADMIN, 조회는 로그인한 모든 사용자), 기간 겹침 거절(같은 rateType+currency만, 다른 구분/통화는 허용), `GET /lookup`(경계일 포함 조회, 없으면 `previous` 참고값만), `GET /status`(수출·수입 한 번에, 날짜 생략 시 한국시간 기준 오늘). |
| 수출선적서류 연계 | 생성(`POST /export-shipments/generate`)과 환율수정(`PATCH /:id/exchange-rate`) 둘 다에서 저장하려는 환율값이 그 주 EXPORT/IMPORT 등록값과 같은지 서버가 스스로 판정해 `exchangeRateSource`에 저장(프론트가 보낸 구분은 신뢰하지 않음, 둘 다 일치하면 EXPORT 우선, 둘 다 다르면 MANUAL). 기존 라인 재계산/확정 규칙(PR-157)은 그대로. |
| 프론트 | 사이드바 "마스터·설정 > 주간 환율"(탭: 수출/수입, 추가 폼, 직전 주 참고 표시). INVOICE 생성/상세 폼에 구분 선택(수출 기본/수입) + 추천(찾음→미리 채움+배지, 못 찾음→경고+직전 주 참고, 이미 입력→덮어쓰지 않음). 수입통관 화면에 건마다 해당 주 수입 환율 참고 표시(계산/저장 없음). 로그인 직후(및 토큰 복원 시) 수출·수입 중 하나라도 미등록이면 팝업(쓰기 권한 있으면 입력 폼, 없으면 상단 안내 배너), "나중에"는 같은 세션 동안만 기억. |

## 2. 마이그레이션 검증 — **미검증(빈 DB)**

- Docker 데몬이 실행 중이 아니어서 빈 DB에서 마이그레이션 체인을 처음부터 돌리지 못했다(PR-183 때와 같은 상태).
- 마이그레이션 SQL은 `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`만 쓰는 추가 전용이고, `down()`은 이 PR이 만든 객체만 지운다.
- 운영 DB에는 이 마이그레이션을 실행하지 않았다(지시대로— Render 배포 시점에만 실행됨).

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run build` (백엔드) | 통과 |
| backend `jest` 전체 | 57 suites / 708 tests 통과 |
| backend e2e 전체(`jest-e2e`) | 62 suites / 465 tests 통과(신규 `customs-exchange-rates-flow` 9건 포함) |
| frontend `tsc --noEmit -p tsconfig.app.json` | 통과 |
| frontend `vitest run` 전체 | 46 files / 300 tests 통과 |

### `exchangeRateSource` 판정 — e2e로 4경우 모두 확인
수출 등록값과 일치 → `CUSTOMS_WEEKLY_EXPORT`, 수입 등록값과 일치 → `CUSTOMS_WEEKLY_IMPORT`, 둘 다 다름 → `MANUAL`, 환율 자체가 없음 → `null`. 생성 경로와 `PATCH :id/exchange-rate` 경로 둘 다 같은 규칙으로 동작함을 `test/customs-exchange-rates-flow.e2e-spec.ts`에서 확인.

### 겹침/권한 규칙
같은 구분+통화 기간 겹침 400(충돌 기간을 메시지에 포함), 다른 구분·다른 통화는 같은 기간이어도 허용, 수정 시 자기 자신은 겹침 검사에서 제외, USER는 조회 200/쓰기 403.

## 4. 실데이터(운영 DB) 확인 — 이번 PR에서는 수행하지 않음

`customs_exchange_rates` 테이블은 아직 운영 DB에 없다(이 PR의 마이그레이션이 main에 병합되고 배포돼야 생긴다). pause-after 정책상 이 PR은 main 병합·운영 마이그레이션을 하지 않으므로, "테스트 환율 행을 넣고 Puppeteer로 확인 후 삭제"하는 실데이터 검증은 **이번 PR에서는 할 수 없다** — PR-183과 같은 이유로, main 반영(향후 MERGE 단계)과 배포 이후로 미룬다. 그때 가서 `note: 'PR-184 TEST'`로 표시한 임시 행만 만들고 확인 후 삭제하는 절차를 따르면 된다.

## 5. 스크린샷

라이브 브라우저 스크린샷은 찍지 않았다(위 4번과 같은 이유 — 운영 DB에 아직 테이블이 없어 실제 화면을 띄워 확인할 수 없음). 각 화면의 동작은 정적 렌더 테스트(`CustomsExchangeRatesManagerLabels.test.tsx`, `WeeklyExchangeRatePopupLabels.test.tsx`)와 순수 로직 테스트(`customsExchangeRates.test.ts`, 20건 — 팝업 표시 여부, 역할별 분기, 날짜 제안, 배지 상태)로 확인했다.

## 6. 제시님께 필요한 후속 입력

- 실제 주간 환율(수출/수입) 값을 "주간 환율" 화면에서 입력해 주셔야 운영에서 추천이 동작한다.
- 샘플 TY-260918K의 1343이 수출/수입 환율 중 어느 쪽인지, 같은 주의 수출·수입 환율 두 값을 등록한 뒤 비교해서 확인이 필요하다(이 PR은 "모른다"를 전제로 구분 선택 드롭다운을 뒀다).

## 7. 운영 복사본 검증 + main 병합 충돌 해결 (MERGE-6, 2026-10-09/10)

### 7.1 main 병합 충돌 해결

`origin/main`이 `0c45e61`(PR-183 반영)로 움직여 PR-184 브랜치가 fast-forward 불가능해졌다. `git merge origin/main`으로 합치고 예상된 3개 파일·7곳 충돌을 전부 "양쪽 다 유지"로 해결했다(다른 파일은 건드리지 않음, 병합 후 `grep -rn '<<<<<<<\|>>>>>>>' src frontend-app/src` 결과 없음 확인):

- `src/app.module.ts`: `CustomsExchangeRatesModule` import/등록과 `MaterialCategoriesModule` import/등록 모두 유지.
- `frontend-app/src/components/Sidebar.tsx`: `TabId`에 `'customsExchangeRates'`·`'materialCategories'` 모두, NAV 항목 "주간 환율"·"품목군 관리" 모두, `ICONS`에 두 아이콘의 `<svg>` 블록 모두 온전하게 유지(태그 안 깨짐 확인).
- `frontend-app/src/App.tsx`: `CustomsExchangeRatesManager`/`WeeklyExchangeRatePopup`와 `MaterialCategoriesManager` import 모두, `switch`의 두 `case` 모두 유지.

병합 커밋: `985f97c` ("merge: origin/main(PR-183) into PR-184").

병합 후 재검증: 백엔드 `npm run build` 통과, `jest` 58 suites/721 tests 통과, e2e `--maxWorkers=2`로 63 suites/475 tests 통과(기본 동시성에서는 리소스 경합으로 3개 suite가 간헐 실패 — 개별 재실행/동시성 축소 재실행 모두 통과해 코드 결함이 아님을 확인, PR-183 MERGE-5 때와 같은 현상). 프론트 `tsc --noEmit`/`vitest run` 47 files·309 tests 통과.

### 7.2 Neon 테스트 브랜치(`ep-divine-scene-b3mhdu6u...`, 2026-10-10 13:59 KST 자동 삭제 예정) 마이그레이션 사전 검증

1. `migration:show`: `1791500000000`(PR-183)은 `[X]`, `1791600000000`(PR-184)은 `[ ]` — 기대한 상태.
2. `migration:run`: 에러 없이 완료.
3. **실행 전/후 비교**(읽기 전용 쿼리):

   | 항목 | 실행 전 | 실행 후 |
   |---|---|---|
   | `export_shipments` 행 수 | 1 | 1 |
   | `items` 행 수 | 355 | 355 |
   | `suppliers` 행 수 | 9 | 9 |
   | `exchangeRateUsdKrw`가 NOT NULL인 행 수 / 합계 | 1 / 1300 | 1 / 1300 |
   | `exchangeRateDate`가 NOT NULL인 행 수 | 1 | 1 |
   | `exchangeRateSource`가 NOT NULL인 행 수 | (컬럼 없음) | 0 |

   기존 `export_shipments`의 `exchangeRateUsdKrw`/`exchangeRateDate` 값이 전혀 바뀌지 않았고(소급 계산 없음), 새 컬럼은 기존 행에 대해 모두 null로 남았다. `customs_exchange_rates` 테이블 존재(0행), `export_shipments.exchangeRateSource` 컬럼 존재(nullable) 확인.
4. **반복 실행 안전성**: `migration:revert` → `1791600000000`만 되돌려짐(`DROP COLUMN exchangeRateSource`, `DROP TABLE customs_exchange_rates`만 실행됨, `1791500000000`은 그대로) → `migration:run` → 에러 없이 재적용 → `migration:show`에서 다시 `[X]` 확인.

**결론: 1단계 통과.**

### 7.3 테스트 브랜치에서 실데이터 점검(Puppeteer, 버려도 되는 복사본에서만 수행)

`npm run build` 중 `tsconfig.build.tsbuildinfo`(증분 빌드 캐시)가 낡아 있어 `dist/main.js`가 재생성되지 않는 문제를 발견 — 삭제 후 재빌드로 해결(이 PR·다른 PR의 소스 코드 결함이 아니라 로컬 빌드 캐시 문제). `NODE_ENV=production`, `DB_HOST=`테스트 브랜치로 백엔드(`node dist/main.js`, 포트 3000)와 프론트 `vite` 개발 서버(포트 5173)를 띄우고, 테스트 계정을 등록해 MANAGER로 격상한 뒤(테스트 브랜치 DB에서만) Puppeteer(헤드리스 Chrome)로 확인했다. 스크린샷은 로컬 산출물로 저장했다(레포에는 커밋하지 않음).

- **로그인 직후 팝업(환율 둘 다 없음)**: "이번 주 관세청 환율이 등록되지 않았습니다" 제목과 수출/수입 입력 폼 두 개가 모두 렌더됨. 적용 시작일 기본값이 오늘(`2026-10-09`), 종료일이 +6일(`2026-10-15`)로 자동 채워짐.
- **수출 환율(1343) 저장 → 수입 환율 폼만 남음 → 수입 환율(1350) 저장 → 팝업 닫힘**(대시보드로 돌아가 "수입 환율이 등록되었습니다" 토스트 확인). 이후 `GET /customs-exchange-rates/status`를 API로 재확인한 결과 `EXPORT.found=true(1343)`, `IMPORT.found=true(1350)` — 팝업 플로우가 실제로 DB에 반영됐음을 확인.
- **"주간 환율" 관리 화면**: 수출 탭에 방금 저장한 1343.0000(2026-10-09~2026-10-15) 행이 목록에 표시됨.
- **INVOICE 생성 폼 추천(찾음)**: Invoice Date에 `2026-10-09`를 입력하자 환율 입력칸이 `1343`으로 자동 채워지고 "관세청 주간환율(수출) 2026-10-09~2026-10-15 적용 — 확인 필요" 배지가 떴다(페이지 텍스트로 직접 확인).
- **수입통관 참고 표시(찾음)**: 실제 수입통관 건(`356X11WC1`, invoiceDate `2026-09-21`)의 주를 덮는 테스트 수입 환율(1333, `note: 'PR-184 TEST - import ref demo'`)을 등록한 뒤, 해당 건 카드에 "참고: 해당 주 수입 환율 1,333 (2026-09-18~2026-09-24)"가 정확히 표시됨.

이 점검에 쓴 테스트 계정·환율 행은 테스트 브랜치에만 있고(운영 DB에는 아무 것도 쓰지 않음), 이 브랜치는 2026-10-10 13:59(KST) 자동 삭제되므로 별도로 지우지 않았다.

### 7.4 발견한 사실 — PR-184와 무관한 기존 운영 결함

실데이터 점검 중 `GET /export-shipments`가 **운영 DB에서 이미 500 에러**를 내고 있음을 발견했다: `export_shipment_lines` 테이블에 `materialSubType`/`priceBasisNote` 컬럼이 없는데, `migrations` 테이블에는 `AddExportLineMaterialSubTypeAndPriceBasisNote1791400000000`이 적용된 것으로 기록돼 있다(테스트 브랜치와 실제 운영 DB 둘 다 읽기 전용으로 확인 — 같은 증상). 추정 원인은 알 수 없고(해당 마이그레이션 실행 당시 DDL이 실패했는데 기록만 남았거나, 별도 경로로 컬럼이 제거됐을 가능성), **이 PR의 범위 밖이라 고치지 않았다.** 이 때문에 수출선적서류 목록·상세 조회가 현재 운영에서 broken 상태일 수 있으며, 이번 점검에서 "기존 INVOICE 1건 상세에서 추천/출처 확인"은 이 결함 때문에 하지 못했다(대신 새 INVOICE 생성 폼에서 같은 추천 로직이 동작함을 확인했다 — 코드 경로는 동일). **제시님이 별도로 확인·수정을 판단해야 하는 기존 결함입니다.**

### 7.5 main 반영

"Render 확인 완료" 확인을 받아 진행했다. `origin/main`이 `0c45e61`에서 움직이지 않음을 재확인한 뒤 `git switch main && git merge --ff-only feat/customs-exchange-rates`로 반영했다(아래 8절).

## 8. main 반영 완료

- `origin/main`이 `0c45e61`에서 움직이지 않은 것을 재확인한 뒤 `git merge --ff-only`로 fast-forward.
- **최종 main SHA: `9b90929`** (`985f97c` merge(origin/main→PR-184 충돌 해결) + `9b90929` docs(7절 추가), 둘 다 main에 포함. PR-183의 `617c4e6`/`1a19a03`도 당연히 포함).
- 푸시 직전에 다시 확인: 백엔드 build 통과, `jest` 58 suites/721 tests 통과, 프론트 `tsc --noEmit`/`vitest run`(47 files/309 tests) 통과.
- `git push origin main` 완료.
- 브랜치 `feat/customs-exchange-rates`는 삭제하지 않았다.
- **확인 필요**: Render 배포 로그에서 `AddCustomsExchangeRates1791600000000`(실제 클래스명) 마이그레이션이 적용됐는지 제시님이 확인해 주셔야 한다. 7.2절 검증은 Neon 테스트 브랜치에서 한 것이고, 운영 DB에는 이 push로 트리거되는 Render 배포 과정에서 처음 적용된다.
- **별도 확인이 필요한 기존 결함**: 7.4절에 적은 `export_shipment_lines.materialSubType`/`priceBasisNote` 컬럼 누락(운영 DB에서 확인됨, `GET /export-shipments` 500 에러 유발) — 이 PR과 무관하며 고치지 않았다. 원인 조사·수정은 별도로 판단해 주세요.
- PR-185는 이 반영이 끝났으므로 제시님이 다시 보내면 선행 조건이 충족된다.
