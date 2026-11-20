# MERGE-54 — PR-249 머지 결과

- 대상: `feat/bulk-save-server-guard` (head ac2e69d) → `main` fast-forward (533bca7 → ac2e69d)
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트
| | 병합 직전 main(533bca7, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1408 | 1435 | 1435 통과 |
| 프런트 vitest | 915 | 935 | 935 통과 |
| e2e (`--maxWorkers=2`) | 639 | 648 | 648 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과.
**e2e `--maxWorkers=2` 이력**: PR 작업 중 이 옵션에서 `purchase-order-search-flow`, `import-shipments-first-documentation-flow` 가 실패했다가(단독 실행·`--maxWorkers=1` 에서는 통과) 보고됐다. 이번 머지 검증(`--maxWorkers=2`)에서는 실패 없이 648/648 통과해 재현되지 않았다. 원인은 확인하지 못했고 병렬 경합(환경 메모의 e2e 시간 초과)으로 추정할 뿐이다.

## 변경 파일 (17개, 범위 내)
백엔드: `src/mapping/services/mapping-commit.service.ts`(+spec), `src/mapping/utils/order-overview-merge.util.ts`(+spec), `src/sales-orders/sales-orders.service.ts`(+spec), `src/sales-orders/dto/ai-analysis.dto.ts`, `src/sales-orders/dto/sales-order-bom-compare.dto.ts`, `test/bulk-save-server-guard-flow.e2e-spec.ts`, `test/contract-approval-flow.e2e-spec.ts`
프런트: `api/salesOrders.service.ts`, `components/SalesOrderBomCompareStep.tsx`(+test), `components/SalesOrderUploadModal.tsx`, `utils/commitNotices.ts`, `utils/orderOverviewReview.ts`(+test)
마이그레이션·package/lock·`.env`·데이터 파일·작지 인식 스키마/프롬프트·수입 선적/서류 코드·`prompt-reports/`·`CLAUDE.md` 없음.

## 오더개요 대상 필드 7개
`totalQty`(총수량), `buyer`(바이어), `styleName`(스타일명), `brand`(브랜드), `itemType`(품목), `productionType`(임가공 구분), `targetRdd`(납기). 공장·CMT단가는 기존 보류 규칙 그대로(허용 목록 밖 → `overwriteOrderFields` 에 넣으면 400).
규칙: 기존 비어 있음→채움 / 같음→불변 / 다름→기존 유지 + `orderOverviewConflicts` / 들어온 값 비어 있음→보존. 비교는 trim·대소문자 변환 없음, 총수량은 숫자값, 납기는 YYYY-MM-DD. 사용자가 `overwriteOrderFields` 로 고른 필드만 교체. 가드는 `commit()` 옵션(`overviewGuard`)이며 작지 저장(`commitAnalysis`)만 켠다 — 엑셀 `/mapping/commit`·reconcile·PR-211/212 총수량 경로는 옵션이 없어 기존 동작 그대로.

## 계약 동작
- 같은 스타일에 승인 대기(PENDING_APPROVAL) 계약이 있으면 새로 만들지 않고 가장 최근 1개를 갱신(여러 개여도 나머지는 불변).
- 승인된 계약은 수정하지 않는다. 승인된 계약만 있을 때 재저장하면 기존 동작대로 새 대기 계약이 생긴다(e2e 로 고정).
- 계약 생성·갱신은 `commit()` 의 `afterMerge` 훅(스타일 저장과 같은 트랜잭션)에서 실행되고 실패하면 전체 롤백(단위 테스트). 계약에 넣는 필드(총수량·납기·공장·바이어·임가공·CMT/FOB 단가·단가 신뢰도·메모)는 이전과 같은 규칙으로 병합 후 오더개요에서 읽어 채운다.

## 기존 테스트 변경 요약
- `contract-approval-flow.e2e-spec` (PR-066): 바뀐 기대는 "같은 스타일 재등록 시 대기 계약이 2건으로 쌓임" → "대기 계약 1건 유지·갱신(총수량 스냅샷은 기존 오더개요 값 1000)" 한 가지. 제거된 단언은 쌓임 전용(2건, 모두 PENDING, 첫 계약 총수량 1000, 두 번째 2000)뿐이다. 승인 시 `approvedByUserId`/`approvedAt`, 권한(403), 재승인(400), 두 번째 승인 시 첫 계약 SUPERSEDED, 거절, 삭제 단언은 그대로. 두 번째 계약은 "승인 후 재등록"으로 만들도록 흐름만 바뀌었다.
- `sales-orders.service.spec`: 계약 생성이 훅으로 옮겨져 모의 `commit` 이 `afterMerge` 를 실행하도록 조정(제거된 줄은 모의 repo 정의·`mockResolvedValue` 두 줄뿐, `commit` 호출 단언에는 두 번째 인자 `expect.anything()` 추가, compare 호출 단언에 overview 추가). 단언 약화 없음.

## 한계
- 프런트 jsdom 없음: 비교 화면의 버튼 클릭 전이는 순수 함수, 표시는 정적 렌더로 검증했고 모달의 토스트·비교 화면 진입은 자동 테스트가 없다 → 화면에서 직접 확인.
- 작지 일괄 저장 사전 점검 표(PR-250)·엑셀 일괄 승인 보강(PR-251) 미구현. 일괄 저장은 `overwriteOrderFields` 를 보내지 않아 서버 기본(채움/유지)을 따르고, 유지한 항목은 결과 토스트로 안내(저장은 막지 않음).
- 스펙 저장·계약-스펙 연결 갱신(`triggeredBySalesOrderSpecId`)은 기존대로 트랜잭션 밖.
