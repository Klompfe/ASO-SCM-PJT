# MERGE-49 — PR-244b main 반영 (단가 통화 선택 화면 + 통화별 합계 + 환산 참고 + 미리 채움 통화 규칙)

- 병합 전 main `756223e` → 병합 후 main `dfdec1f` (`feat/currency-ui`, fast-forward). 마이그레이션 없음(PR-244a 의 통화 컬럼은 이미 운영 적용), 비테스트 백엔드 `src/` 변경 0, package/lock 변경 0.
- 브랜치는 이미 최신 main 을 포함해(merge "Already up to date") 병합 커밋이 생기지 않았다.

## 테스트 (병합 직전 main 기준 측정 → 브랜치)
| | main(756223e) | 브랜치(dfdec1f) | 하한 |
|---|---|---|---|
| 백엔드 jest | 1312 | 1312 통과 | 1312 |
| 프런트 vitest | 808 | 840 통과 (88 파일) | 840 |
| e2e (`--maxWorkers=2`) | 622 | 623 통과 (80 스위트) | 623 |
- `tsc -b`, 프런트 build, 백엔드 build 통과. 실패·재실행 없음. 작업 디렉터리는 대문자 `C:\dev\backend-api`.

## 변경 파일 (27개)
- 프런트 26: `api/boms.service.ts`, `api/purchaseOrders.service.ts`(타입에 currency 추가), 컴포넌트 `BomBulkOrderPanel`, `BulkOrderPreviewModal`, `ItemsManager`, `MappingPreviewModal`, `MultiStyleBulkOrder`, `PurchaseOrderEditModal`, `PurchaseOrderLedgerReport`, `PurchaseOrdersManager`, 신규 `CurrencySelect`, `KrwReferenceNote`, `hooks/useImportRates`, 유틸 `currency`, `krwReference`, `importRateCache`, 수정 `bomBulkOrderGrouping`, `orderPrefill`, `purchaseOrderForm`, `purchaseOrderReport`, 테스트 `CurrencyComponents`, `currency`, `krwReference`, `purchaseOrderReportCurrency`, `orderPrefill`(수정), `purchaseOrderForm`(수정).
- 테스트 1: `test/currency-columns-flow.e2e-spec.ts`(발주 목록 응답의 currency 확인 1건 추가).

## Gate A 확인
1. **합산 지점**: 단가×수량을 합산하는 프런트 지점은 모두 `sumByCurrency`(`utils/currency.ts`) 경유 — `purchaseOrderReport.ts`(상태별·공급업체별), `PurchaseOrderLedgerReport.tsx`(전체 합계는 통화별 합계를 `sumByCurrency` 로 재합산). 행 단위 `amountOf`/`unitPrice*quantity` 는 한 행의 금액일 뿐 통화가 다른 값을 더하지 않는다. `utils/importShipmentReport.ts` 는 수입 선적 라인 합계로, 라인에 통화 컬럼이 없어 나눌 근거가 없어 변경 없음.
2. KRW 만 있을 때 같음: `formatTotals`/`formatAmount`/`formatAmountDefaultLocale` 단위 테스트(기존 `toLocaleString` 문자열과 비교), `purchaseOrderReportCurrency.test.ts`(KRW 만이면 `byCurrency` 없음·`amount` 동일, 열 구성 동일), 생성·일괄·수정 요청에 KRW 일 때 currency 미전송.
3. 통화 선택은 BOM 행 수정·발주 입력·일괄 발주 3곳·발주 수정에 있고 NULL/빈 값은 KRW. 통화를 바꿔도 단가 숫자는 그대로, 알림만 표시(입력을 막지 않음).
4. 환산 참고: 표시 컴포넌트(`KrwReferenceNote`)와 조회 캐시(`importRateCache`)뿐이며 API 서비스 코드·요청 본문에 환산값이 들어가지 않는다(`src/api` 변경은 타입 추가뿐). 수입(IMPORT)·USD·발주일(한국 날짜), 같은 날짜 1회 조회, `found:false` 는 null(직전 구간 값 미적용), 일부 행만 없으면 환산 합계 비움, 저장 차단 없음 — 단위/정적 렌더 테스트로 확인.
5. 미리 채움: BOM 행 통화로 통화 칸 채움("BOM 행 통화" 표시), 최근 발주 단가는 통화가 같을 때만, 다르면 비우고 "최근 발주 단가는 다른 통화(…)라 채우지 않았습니다." 표시, 환산해 넣지 않음. 포장 환산 자재의 기존 단위 불일치 규칙(BOM 단가 제외) 유지(테스트 존재).
6. 서버 응답 변경 없음 — 비테스트 `src/` diff 0, 목록 응답의 currency 는 e2e 로 확인.
7. 업로드 미리보기: 한 줄 안내 추가(import 1줄 + 문단 1개), 기능 변경 없음.
8. **수정된 기존 테스트(기대값에 `currency: 'KRW'` 추가만, 단언 약화·삭제 없음)** — 파일 `src/utils/orderPrefill.test.ts`(pickPricePrefill describe): '포장 환산이 적용되지 않는 행은 BOM 확정 단가를 1순위로 쓴다', 'BOM 확정 단가가 0이거나 없으면(미입력) 최근 발주 단가를 쓴다'(2개 단언), '포장 환산이 적용되는 행은(단위 기준이 달라 자동 환산 금지) BOM 확정 단가를 쓰지 않고 최근 발주 단가만 쓴다', 'BOM 행 수정에서 방금 저장한 단가(포장 환산 없는 일반 행)가 최근 발주 단가보다 우선 적용된다'; 파일 `src/utils/purchaseOrderForm.test.ts`: '이력이 있으면 가장 최근(id 최대) 발주의 공급업체/단가를 돌려준다(서버 정렬에 의존하지 않는다)'. (기대값 5줄 + 1줄 수정.)
9. `PriceReferenceBlock`·PR-219·PR-238/241/242 회귀 테스트는 수정 없이 통과(전체 840 통과).
10. Gemini 호출·마이그레이션·새 의존성·브라우저 저장소 사용 없음(diff grep 0건).

## 남은 한계
동시 수정 충돌 미감지, KRW/USD 외 통화 미지원, 환율 기준일은 발주일 고정, jsdom 이 없어 통화 변경 알림 같은 상호작용은 정적 렌더·순수 함수로만 검증(수동 확인 필요), 수입 선적 라인은 통화 컬럼이 없어 통화 분리 대상 아님.

## 롤백
머지 커밋 revert(force-push 금지). 마이그레이션 없음.
