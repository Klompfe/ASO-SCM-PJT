# PR-196 완료 보고: 발주 현황을 "스타일별"로 분리

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 사항을 보려는 사람).

- 브랜치: `fix/per-style-po-status` (`origin/main` `00138e0`에서 분기 — PR-188/190/192/194 어느 것과도 독립)
- **마이그레이션 없음.** `PurchaseOrder.styleNo` 컬럼은 PR-185에서 이미 있고, 그 값을 "제대로 보는" 코드만 고쳤다.
- **운영 DB에 전혀 접속하지 않았습니다.**
- 기존 발주의 `styleNo` **일괄 자동 백필은 하지 않았습니다**(이름/품목 추측 금지 — PR-185 원칙 그대로).

## 1. 원인과 고친 규칙

발주(PurchaseOrder)는 PR-185부터 `styleNo`를 저장하지만, 아래 세 곳이 여전히 **품목(itemId)만** 보고 발주를 찾아 "다른 스타일의 같은 품목 발주가 섞여 보이는" 버그가 있었다:
1. `order-process-stages.service.ts`의 `getMaterialReadiness`/`getProcurementStatusReport` — 점검표 "발주·입고·출고 현황".
2. `export-shipments.service.ts generate()` — 자재가 여러 스타일 BOM에 있으면 "가장 나중에 만든 BOM"의 스타일이 INVOICE에 찍힘.
3. `packing-receipts.service.ts resolveBomItemOrFail()` — 같은 이유로 포장내역 양식에 엉뚱한 스타일.

새 순수 함수 `src/purchase-orders/utils/po-style-attribution.util.ts`에 귀속 규칙을 한 곳에 모았다:
- **연결 발주**(`po.styleNo === S`) → S 몫.
- **미연결 발주**: 활성 BOM 기준으로 그 자재를 쓰는 스타일이 **정확히 1개**면 그 스타일 몫("자동 귀속"), **2개 이상**이면 **누구 몫으로도 세지 않음**(모호 — 추측 금지, 화면에 "미연결 발주 있음" 표시).
- **취소(CANCELLED) 발주는 모든 경우에서 제외**(호출자 책임 — 유틸은 상태를 보지 않음).

## 2. 변경 요약

### 백엔드

| 파일 | 내용 |
|---|---|
| `src/purchase-orders/utils/po-style-attribution.util.ts` (신규) | `buildItemStyleUsage(boms)`, `attributePo(po, usage)`(LINKED/AUTO/AMBIGUOUS/ORPHAN), `poBelongsToStyle`. 순수 함수, 13건 단위 테스트. |
| `src/purchase-orders/utils/resolve-po-bom-item.util.ts` (신규) | export-shipments/packing-receipts가 공유하는 BOM 행 탐색 — 연결 발주는 그 스타일의 BOM(활성 우선), 미연결은 단일 후보일 때만. `STYLE_MISMATCH`/`AMBIGUOUS_UNLINKED`/`NO_BOM` 결과를 구분 반환. 7건 단위 테스트. |
| `src/styles/order-process-stages.service.ts` | `getMaterialReadiness`/`getProcurementStatusReport`가 귀속 규칙을 쓰도록 재작성. `ProcurementStatusRow`에 `unlinkedPoCount`/`autoAttributedPoCount`/`targetRdd`/`brand` 추가(기존 필드 변경 없음). **쿼리 수는 그대로**(스타일별 1회 조회 로직에 "전체 BOM 1회 조회"만 추가 — 자재 개수와 무관하게 고정). **취소된 발주는 "입고완료" 계산에서 제외**(의도된 수정 — 전에는 취소 건이 섞여 영원히 미완료로 보일 수 있었음). `computeOverallStatus` 시그니처/문구는 그대로. |
| `export-shipments.service.ts generate()` | `resolveBomItemForPurchaseOrder` 사용. 연결 발주는 그 스타일 BOM만, 미연결+모호 자재는 **400 + 안내 문구**("...'미연결 발주 정리'에서 스타일을 연결해 주세요."). |
| `packing-receipts.service.ts resolveBomItemOrFail()` | 동일. 스타일 모호 시 같은 문구로 막는다. 더 이상 사실과 다른 기존 주석("PurchaseOrder에는 styleNo가 없다")도 갱신. |
| `purchase-orders.service.ts` | `assertStyleLinkable` private 해제(재사용), `findUnlinked()`(`GET /purchase-orders/unlinked`), `linkStyle(id, styleNo)`(`PATCH /purchase-orders/:id/style-link`), `linkStyleBulk(links)`(`POST /purchase-orders/style-link/bulk`, all-or-nothing, 최대 100건). 미연결(styleNo null)에만 적용 — 이미 연결됐거나 취소된 발주는 400. |

### 프론트엔드

| 파일 | 내용 |
|---|---|
| `ProcurementStatusReport.tsx` | "발주하기"/"발주 보기" 버튼이 `onGoToPurchaseOrders(r.styleNo)`로 스타일번호를 넘긴다. `unlinkedPoCount>0`이면 주황 배지("미연결 발주 N건", 눌러서 정리 화면 이동), `autoAttributedPoCount>0`이면 회색 보조 문구("자동 귀속 N건"). |
| `App.tsx` | `poPrefillStyleNo` 상태 추가(기존 `poPrefillItemId`와 동일 패턴), 새 서브탭 "미연결 발주 정리" 추가(기존 서브탭 변경 없음). |
| `PurchaseOrdersManager.tsx` | 새 prop `prefillStyleNo`/`onStylePrefillConsumed` — 받으면 기존 `styleSearch` 경로(`getStyleRequirements` → `StyleShortagePanel`)를 그대로 태워 그 스타일의 부족분 표를 바로 연다. 목록 조회에 `filterStyleNo`를 추가해 그 스타일(+자동 귀속분, 백엔드가 이미 PR-185부터 지원하던 `styleNo` 필터 재사용)로 거른다. |
| `UnlinkedPurchaseOrders.tsx` (신규) | 표(품목/수량/상태/업체/발주일/귀속 종류/연결할 스타일 드롭다운). AUTO 행은 스타일이 미리 골라져 있지만 체크 + [선택 항목 연결 확정]을 눌러야 저장. AMBIGUOUS는 비워 두고 사람이 고름. ORPHAN은 "연결할 스타일 없음" 문구만(체크박스 비활성). 필터: 품목 검색/상태/귀속 종류. "한 발주를 여러 스타일에 나눌 수 없습니다" 안내문. |
| `unlinkedPurchaseOrders.ts` (신규, 순수 함수) | `buildInitialChosenStyleNo`, `resolveStyleLinkTargets`(체크 안 한 행은 저장 대상에서 빠짐을 보장), `filterUnlinkedRows`. 9건 단위 테스트. |

## 3. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **64 suites / 821 tests** 통과 — 신규: `po-style-attribution.util.spec.ts` 13건, `resolve-po-bom-item.util.spec.ts` 7건, `order-process-stages.service.spec.ts`에 PR-196 회귀 테스트 6건(스타일 A 연결 발주가 B로 안 샘/RECEIVED로 바꿔도 B에 안 새어듦/자동 귀속 1건/모호 2건/취소 제외/포장대기 선택이 안 새어듦) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **66 suites / 519 tests** 통과 — 신규 `test/purchase-order-style-attribution-flow.e2e-spec.ts` 12건: 미연결 목록(AUTO/AMBIGUOUS 구분), style-link 단건(성공/재연결 400/존재안함 400/취소 400), bulk(all-or-nothing), export-shipments generate()의 스타일 분리 + 모호 400 |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **52 files / 336 tests** 통과(회귀 없음) — 신규: `unlinkedPurchaseOrders.test.ts` 9건 |
| `npm run lint` | 실행 불가 — 저장소 전체에 ESLint 설정 파일이 없음(이전 PR들에서도 확인한 기존 상태, 이 PR과 무관) |

### 프론트 렌더 테스트에 대해
"점검표 버튼 클릭 시 styleNo 전달", "미연결 배지 클릭 시 화면 전환" 같은 상호작용은 이 환경(`renderToStaticMarkup`만 지원, 클릭 이벤트 미실행)에서 직접 테스트할 수 없다(이번 세션의 다른 PR들과 동일한 제약). 대신 그 상호작용을 구동하는 판단 로직(미연결 발주 정리 화면의 초기 선택값 구성, 저장 대상 결정 — "체크 안 한 행은 저장 호출에 안 들어감", 필터링)은 `unlinkedPurchaseOrders.ts`로 뽑아 순수 함수로 전부 테스트했다.

## 4. 화면에서 확인할 것 체크리스트
① 스타일 A로 발주 후 점검표에서 **스타일 B가 여전히 "미발주"**로 남아 있는지(이번 버그의 핵심 회귀 확인 — 운영 DB를 읽지 않았으므로 "기존 미연결 발주가 몇 건인지"는 직접 화면에서 확인해 주세요).
② 점검표의 "발주하기"/"발주 보기"를 클릭하면 발주관리 탭으로 전환되며 그 스타일의 부족분 표가 바로 열리는지.
③ 주황 "미연결 발주 N건" 배지 → "미연결 발주 정리" 탭으로 이동 → 스타일을 연결 → 점검표로 돌아가 반영됐는지.
④ 같은 자재를 2개 이상 스타일이 쓰는 **기존(모호한) 미연결 발주**로 인보이스/포장내역 생성을 시도하면 안내 문구가 뜨고 막히는지(정리 화면에서 연결하면 풀림).

## 5. 알려진 한계(지시대로 그대로 적음)
- 여러 스타일이 쓰는 자재의 **기존(미연결) 발주**는 "미연결 발주 정리"에서 사람이 스타일을 연결하기 전까지 어느 스타일에도 "발주완료"로 잡히지 않는다 → 점검표에 일시적으로 "미발주"가 늘어 보일 수 있다(주황 배지로 구분). **의도된 안전 동작**이다.
- 같은 이유로 스타일이 모호한 기존 발주는 인보이스/포장내역 양식 생성이 막힌다 — 정리 화면에서 연결하면 풀린다.
- 한 발주는 한 스타일에만 연결된다(한 발주를 여러 스타일로 나누는 기능은 만들지 않음 — 나눠야 하면 발주를 스타일별로 새로 만들어야 한다).
- 취소된 발주를 "입고완료" 계산에서 제외하도록 고쳤다(의도된 수정) — 전에는 취소 건이 섞여 영원히 "입고대기"로 막히는 경우가 있었다.

## 6. 하지 않은 것(명시적 지시 준수)
- 새 테이블/컬럼/마이그레이션 없음.
- 기존 발주의 `styleNo` 일괄 자동 백필 없음(사람이 "미연결 발주 정리"에서 직접 확인·연결).
- 발주 수량의 스타일 간 분할, 재고(Inventory) 처리 변경, 입고 처리 로직 변경 없음(재고는 여전히 품목 기준).
- 다품번/시즌 단위 발주 화면(PR-194 영역) 건드리지 않음 — `unlinkedPoCount`/`autoAttributedPoCount`/`targetRdd`/`brand` 필드만 미리 추가해 둠(PR-194가 PR-196을 먼저 병합한 뒤 진행한다는 전제).

## 7. 브랜치 SHA
커밋 완료 후 `fix/per-style-po-status` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
