# MERGE-55 — PR-250 머지 결과

- 대상: `feat/bulk-save-precheck` (head 6663f41) → `main` fast-forward (0a2f192 → 6663f41). 브랜치 커밋 체인: a351574(PR-250) → f824486(fail-closed 보강) → 6663f41(재확인 fail-closed 보강)
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 정지 이력과 수정
- 1차 시도(head a351574): Gate A ③ 에서 정지. 점검 분류가 알 수 없는 응답 값(미지의 자재 행 type, 오더개요·혼용률 status, 누락)을 "변경 없음(저장 안 함)"으로 분류해 변경을 놓치는 fail-open 이었다. 사용자 승인으로 같은 브랜치에 수정 커밋을 추가한 뒤 재개했다.
- 수정 1(f824486): 미지의 값은 변경으로 센다(`unknownItems`), 응답 구조가 비정상이면 확인 필요, 신규는 기존 행·오더개요가 없음이 명확하고 자재 행 목록도 비어 있을 때만. 테스트 8건 추가.
- 수정 2(6663f41, 2단계 Gate A 재독해 중 발견): 저장 직전 재확인 `isStillNew` 도 비정상 응답(예: `hasExistingBom` 누락)을 "여전히 신규"로 볼 수 있는 같은 종류의 fail-open 이어서 `isWellFormedCompare` + `hasExistingBom === false` + 자재 행 비어 있음 + 오더개요 비어 있음일 때만 신규로 보도록 고쳤다. 테스트 2건 추가. 두 수정 모두 `bulkSavePrecheck.ts`/`.test.ts` 안에서만 이뤄졌다.

## 테스트
| | 병합 직전 main(0a2f192, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1435 | 1438 | 1438 통과 |
| 프런트 vitest | 935 | 973 | 973 통과 |
| e2e | 648 | 648 | 648 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과.
**e2e `--maxWorkers=2` 이력**: 병합 후 첫 실행에서 `purchase-order-search-flow` 가 실패했다(이전 PR 작업 중 실패했던 스위트와 같다; 실패한 테스트는 "품목 100개 초과", "공급업체 keyword 검색", "스타일 기준 부족 자재 → 발주 흐름" 등 PR-126 describe 전반). 그 실행에서는 오류 첫 줄을 따로 저장하지 못했다. 같은 조건 `--maxWorkers=2` 재실행은 648/648 통과, `--maxWorkers=1` 전체 실행도 648/648 통과. 이 PR 은 해당 영역을 건드리지 않았고 병렬 경합(환경 메모의 e2e 시간 초과)으로 추정할 뿐 원인은 확인하지 못했다.

## 변경 파일 (9개, 범위 내)
프런트: `components/SalesOrderUploadModal.tsx`, `components/BulkSavePrecheckPanel.tsx`(+test), `utils/bulkSavePrecheck.ts`(+test), `api/salesOrders.service.ts`
백엔드: `src/mapping/services/mapping-commit.service.ts`(+spec), `src/mapping/utils/sales-order-bom-compare.util.ts`
마이그레이션·package/lock·`.env`·데이터 파일·인식 스키마/프롬프트·수입 선적/서류 코드·엑셀 업로드 목록 코드·`prompt-reports/`·`CLAUDE.md` 없음. e2e 는 추가하지 않았다.

## 분류 4종 기준 (fail-closed)
| 분류 | 기준 |
|---|---|
| 신규 | 응답이 해석 가능하고 `hasExistingBom=false`, 자재 행 목록 비어 있음, 오더개요 비교 없음이 **명확할 때만** → 일괄 저장 대상(유일) |
| 변경 없음 | 기존 스타일이고 신규 행·값 변경·삭제 후보·오더개요 변경·알 수 없는 값이 모두 0 → 저장 안 함 |
| 변경 있음 | 신규 자재 행 / 비슷한 이름 후보 / 요척·작지 수량·혼용률 변경 / 삭제 후보 / 오더개요 `fillEmpty`·`differs` / **알 수 없는 값(미지의 행 type·status·누락, 기존·들어온 행이 빠진 same 행, 모순된 응답)** 중 하나라도 → 개별 비교 후 저장 |
| 확인 필요 | 점검 호출 실패 / 번호 없음 / 끝 글자 숫자 / 원본 대조 안 함 / 자재명 빈 행 / 배치 내 번호 중복 / **응답 구조 비정상** → 일괄 저장 제외 |
저장 직전 재확인(`isStillNew`)도 같은 fail-closed 기준이며 재확인 호출이 실패하면 저장하지 않고 실패로 표시한다.

## `bom-compare` `sheetQty` 변경 요약
서버 변경은 compare 응답의 기존 행에 읽기 전용 `sheetQty`(숫자 또는 null) 한 필드를 더한 것뿐이다(`mapping-commit.service.ts` 매핑 한 줄, `sales-order-bom-compare.util.ts` 타입 한 줄). DB 쓰기·기존 응답 필드 변경 없음. 단위 테스트 "기존 행 sheetQty %p → 응답 %p (읽기 전용, 저장 호출 없음)" 와 기존 "비교는 읽기 전용이다 — save/delete/create/count 가 전혀 호출되지 않는다" 가 확인한다.

## 한계
- jsdom 없음: 점검 표의 클릭 흐름(신규 저장·비교하고 저장·닫기)과 모달 연결은 자동 테스트가 없다(순수 함수 + 정적 렌더만) → 화면에서 직접 확인.
- 변경 있음으로 분류됐지만 "비교하고 저장"을 눌렀을 때 서버가 기존 자재 행·오더개요 결정 항목이 없다고 응답하면 "변경할 내용이 없습니다" 안내만 나오고 표에 남는다(저장되지 않음 — 안전 쪽).
- 동일 스타일은 저장하지 않는다(승인된 계약만 있는 스타일 재저장이 새 대기 계약을 만드는 PR-249 기존 동작 때문). 엑셀 일괄 승인(PR-251) 미구현.
