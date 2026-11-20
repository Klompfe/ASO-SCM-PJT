# MERGE-56 — PR-251 머지 결과

- 대상: `feat/excel-bulk-approve-guard` (head 53f0c3e) → `main` fast-forward (3727076 → 53f0c3e). 브랜치는 이미 origin/main(3727076)을 포함해 별도 merge 없음.
- 프런트 전용·마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트
| | 병합 직전 main (측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1438 | 1438 | 1438 통과 |
| 프런트 vitest | 973 (새 테스트 파일 제외 측정) | 996 | 996 통과 |
| e2e | 648 | 648 | 648 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과. e2e `--maxWorkers=2` 에서 실패 없음(`=1` 재실행 불필요). 이번에는 `=2` 실패 이력이 없다.

## 변경 파일 (3개, 범위 내, 프런트만)
`frontend-app/src/components/ItemsManager.tsx`, `src/utils/excelBulkApprove.ts`(신규), `src/utils/excelBulkApprove.test.ts`(신규). 백엔드·마이그레이션·package/lock·`.env`·데이터 파일·`prompt-reports/`·`CLAUDE.md` 없음.

## 재확인 판정 규칙 (fail-closed)
- 승인(`commitMapping`) 호출 지점 중 이 PR 이 다루는 엑셀 목록 경로는 모두 `approveGuarded` 를 거친다: 일괄 승인·실패만 다시 일괄(`runApprove` → `runGuardedBatch`), 개별 "다시 승인"(`handleRetryOne`). 승인 직전 스타일마다 `checkStyleExists` 를 다시 호출한다.
- `parseExistsResponse`: `{exists:true}` → 이미 등록됨(승인 안 함), `{exists:false}`(정확히 boolean) → 승인, 그 밖(예외·타임아웃·`exists` 누락·문자열 "false"·null·배열·객체 아님)은 unknown → 승인 안 함, 실패 목록에 남겨 "다시 승인" 가능.
- 재확인은 스타일마다 순차, 한 스타일의 확인 실패가 다른 스타일을 막지 않는다.

## 중복 판정 키
앞뒤 공백 제거 + 대문자(`styleNoSimilarity.ts` 와 같은 방식). 번호가 있고 파싱에 성공한 시트만 대상, 같은 파일·다른 파일 구분 없음. 중복은 모든 시트가 일괄에서 제외되고 목록에 사유와 함께 남는다. 개별 "다시 승인"에는 중복 제외를 적용하지 않고 재확인만 거친다(하나 승인 후 나머지는 "이미 등록됨").

## 남은 코드 위치 메모 (Gate A 점검에서 확인)
- `ItemsManager.tsx` 업로드 직후 등록 확인(약 880~884행)은 아직 `catch → false` 이다. **배지 표시용**이며, 이 값은 승인 판단을 대신하지 않는다(승인은 항상 직전 재확인이 결정). 다만 확인 실패 스타일이 "미등록"으로 표시되고 일괄 승인 대상 후보에 들어간다 — 재확인에서 걸러진다.
- 재확인과 승인 사이의 짧은 시간차(TOCTOU)는 남아 있다(서버에는 승인 가드 없음 — 엑셀 `/mapping/commit` 은 변경 없음).
- jsdom 없음: 일괄 승인 버튼·확인창·토스트·목록 배지는 자동 테스트가 없다(순수 함수 + tsc/빌드) → 화면 확인 필요.

## 후속 PR 후보 (이번 PR 에서 고치지 않음)
1. **개별 승인 모달의 오더개요 덮어쓰기**: `frontend-app/src/components/MappingPreviewModal.tsx` `handleCommit`(약 443행)이 `getBomDiff` 후 `!diff.hasExistingBom` 이면 `doCommit()`(약 429행 `commitMapping`)으로 바로 병합한다. 스타일은 등록돼 있으나 자재 행이 하나도 없으면 PR-249 오더개요 가드 없이 옛 방식(총수량·바이어·스타일명 등 덮어쓰기)으로 저장된다(공장·CMT 단가는 보류). 방안: 개별 승인 경로 `/mapping/commit` 에도 가드를 켜거나 스타일이 있으면 항상 비교 화면을 거치게 함.
2. 이 모달 경로는 `checkStyleExists` 재확인을 하지 않는다(개별 승인 자체가 사람이 한 건씩 보고 하는 경로).
3. 엑셀 업로드 목록 sessionStorage 에 파싱된 BOM 행(업무 데이터)이 저장되는 문제(PILOT-26 사용자 결정 #4)는 미결.
