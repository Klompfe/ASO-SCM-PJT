# PR-184 완료 보고: 관세청 주간환율(수출/수입) + INVOICE 환율 추천 + 수입통관 참고 표시 + 로그인 팝업

Written for: 이 저장소를 관리하는 개발자(마이그레이션/검증 결과를 확인하려는 사람).

- 브랜치: `feat/customs-exchange-rates` (`origin/main`의 `0504335`에서 분기 — PR-183은 아직 main에 없고, 이 PR은 그 내용에 의존하지 않는다)
- queue 정책: `pause-after` — main 병합은 하지 않음. 푸시는 이 브랜치만.
- 운영 DB: 마이그레이션 실행 없음, 서버 기동 없음. 검증은 sqlite e2e와 단위 테스트로만 수행.

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
- 다음 단계(main 반영)에서 운영 DB에 이 마이그레이션이 배포되면, 위 4번에 적어둔 실데이터 확인(테스트 행 2개 등록 → 실제 INVOICE 1건에서 추천/출처 확인 → 테스트 행 삭제)을 진행해야 한다.
