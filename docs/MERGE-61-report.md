# MERGE-61 — PR-256 머지 결과

- 대상: `feat/outer-fabric-audit-list` (head f731d9f) → `main` fast-forward (3824d20 → f731d9f). 브랜치는 이미 `origin/main` 최신(3824d20)을 포함해 합칠 것이 없었다. 마이그레이션·package/lock·파서·서버 저장 규칙 변경 없음 → Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 변경 (14개 파일, +777/−3, 줄바꿈만 바뀐 파일 없음 — `--ignore-all-space` 통계와 동일)
백엔드: `src/boms/boms.controller.ts`(GET 1개 추가), `boms.service.ts`(조회), `dto/outer-fabric-audit-query.dto.ts`, `utils/outer-fabric-audit.util.ts`(순수 계산), `src/sales-orders/utils/vision-guardrails.util.ts`(`isOuterFabricCategory` 추가, 기존 원단류 판정은 같은 매처 재사용), 테스트 4개(`outer-fabric-audit.util.spec.ts`, `outer-fabric-audit-parity.spec.ts`, `boms.outer-fabric-audit.readonly.spec.ts`, `test/outer-fabric-audit-flow.e2e-spec.ts`). 프런트: `App.tsx`(탭), `api/boms.service.ts`, `components/OuterFabricAuditList.tsx`(+test), `utils/outerFabricAudit.ts`. 모듈 등록 변경 없음(`MasterStyle` 은 `dataSource.getRepository` 로 읽음). 기존 파일의 삭제 줄은 `App.tsx` 1줄(탭 상태 타입)과 `vision-guardrails.util.ts` 2줄(매처 추출)뿐이고, 기존 테스트 파일은 하나도 수정되지 않았다(테스트는 전부 신규 파일).

## 판정 규칙과 "활성 BOM" 기준
- 점검 대상 후보: `MasterStyle` 전체(스타일 테이블에 삭제·비활성·임시 상태 칸이 없어 제외할 종류가 없다). 이름은 `StyleOverview.styleName`.
- 스타일별로 **화면과 같은 활성 BOM 하나**를 고른다(`bom_master.isActive` 가 명확한 false(false/0/'0'/'false')가 아닌 BOM 중 id 최대, 모두 비활성이면 전체 중 id 최대 — `pickActiveBom` 과 같은 기준). 따라서 비활성 BOM 만 있는 스타일은 `noBom` 이 아니라 그 BOM(가장 큰 id)으로 점검된다.
- `noBom`: BOM 이 없거나(수입 서류 등으로 생긴 오버뷰·BOM 없는 스텁 스타일 포함) 선택된 BOM 의 행이 0개 — 상태 필터 "BOM 없음"으로 따로 보거나 "겉감 행 없음/혼용률 비어 있음"으로 걸러 볼 수 있다. `noRow`: 겉감 계열 행 없음(안감·`INTERLINING`·`FABRIC` 만 있어도). `blank`: 겉감 행은 있으나 혼용률이 비어 있음(공백만·문자열 아님 포함, 여러 행 중 하나라도). 모두 채워지면 목록 제외. 이상 값(구분이 문자열이 아님, 스타일 없는 BOM)은 겉감으로 치지 않아 누락 쪽에 남는다.
- 정렬: 상태(noRow → blank → noBom) 후 스타일 번호(코드 포인트 순, 안정적). 상태별 개수는 검색어만 적용한 **전체 기준**(페이지 무관). `pageSize` 기본 50, 범위 밖 값(`pageSize>200`, 잘못된 상태·페이지)은 400, 서비스에서도 한 번 더 한정.

## 쓰기 경로 0 근거
서비스 쿼리 3개는 모두 `createQueryBuilder(...).leftJoin(...).select([...]).getRawMany()` — ① 스타일 번호·이름 ② BOM id·활성·스타일 번호 ③ 행의 구분·혼용률·BOM id. 컨트롤러 추가분은 `@Get('outer-fabric-audit')` 하나. 추가된 `src` 코드에서 `save/insert/update/delete/remove/upsert/execute/query(`·`@Post/@Patch/@Put/@Delete` 검색 결과 0건. 테스트: `boms.outer-fabric-audit.readonly.spec.ts`(쓰기·원시 쿼리 메서드가 호출되면 실패하는 mock), e2e `조회는 읽기 전용이다 …`(조회 전후 BOM·행 수 동일). 쿼리에 `IN (...)` 매개변수 목록이 없어(전체 SELECT 후 메모리 집계) DB 매개변수 한도 문제가 없다. 한계: 수만 행을 넘으면 SQL 집계로 바꿔야 한다.

## 라우트 충돌 점검
`boms.controller.ts` 의 GET 은 `@Get()`, `@Get('duplicates')`, `@Get('outer-fabric-audit')` 뿐이고 경로 매개변수(`:id`) GET 은 없다(`:id` 는 `items/:id` Patch/Delete 뿐) → 가로채기 없음. e2e 가 이 경로를 실제 호출하고 기존 BOM 관련 e2e 도 모두 통과.

## 서버·프런트 판정 대조
`outer-fabric-audit-parity.spec.ts` 가 프런트 `compositionReview.ts` 를 TypeScript 로 변환해 실제 실행, 구분 24종(겉감·`겉감 OUT-SHELL`·줄바꿈/연속 공백 표기·`out shell`·`OUTER SHELL`·`SHELL`·`겉 감`·안감·`LINING`·`INTERLINING`·`EDGE TAPE`·`PAD`·`SHELL BUTTON`·THREAD 포함 구분·`FABRIC`·빈 값·null·undefined·숫자)과 겉감 상태 6종을 서버 결과와 비교한다. 참고: `안감(스트라이프)` 는 이 표에 없다(안감은 겉감 계열이 아니라 PR-255 별칭 테스트가 다룸).

## 화면 문구 (원문)
탭 "겉감 점검" / 안내 "완제품 재수입 세율 기준이 되는 겉감 혼용률이 없는 스타일을 모아 보여 줍니다(읽기 전용). "열기"로 해당 스타일의 BOM 조회로 이동해 겉감 행을 추가하거나 혼용률을 입력해 주세요." / 요약 "전체 N개 스타일 중 점검 대상 N개 — 겉감 행 없음 N · 겉감 혼용률 비어 있음 N · BOM 없음 N" / 필터 "전체 누락·겉감 행 없음·겉감 혼용률 비어 있음·BOM 없음", 검색 "스타일 번호·이름 검색", 버튼 "검색" / 열 "스타일·상태·겉감 행 / 전체 행·구분 값", 버튼 "열기"·"이전"·"다음", "N / M 쪽 (현재 조건 N개)" / 힌트 "구분 값에 겉감과 비슷하지만 인식되지 않는 값(예: FABRIC)이 있는지 확인해 주세요." / 로딩 "불러오는 중..." / 빈 상태 "겉감 점검 대상이 없습니다 — 모든 스타일의 겉감 혼용률이 입력되어 있습니다" / 오류 "점검 목록을 불러오지 못했습니다 — 점검 결과를 확인할 수 없는 상태이며 "문제 없음"이 아닙니다. 다시 시도해 주세요." 오류일 때는 데이터를 비워 요약·표·빈 상태가 그려지지 않는다. 화면에 저장·수정·삭제·일괄 입력 버튼 없음(테스트로 고정). 기존 탭의 순서·동작은 그대로(세 번째 탭 추가).

## 한글 깨짐·잔여물 점검
변경 14개 파일 전체에서 대체 문자(U+FFFD)·한자 계열 문자 0건. `git status` 에 의도하지 않은 추적 외 파일·잔여물 없음(첫 시도 파일 작성 명령은 문법 오류로 아무것도 쓰이지 않았음).

## 테스트
| | 직전 main(3824d20, 실측) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1491 | 1527 | 1527 통과 |
| 프런트 vitest | 1055 | 1062 | 1062 통과 |
| e2e `--maxWorkers=2` | 655 | 659 | 659 통과 |

백엔드 `npm run build`, 프런트 `tsc -b`·build 통과. 이후 main 에 추가된 것은 문서 커밋뿐(보고서 커밋 3824d20 포함). e2e `=2` 실패 없음.

## 알려진 한계·후속 후보
목록에서 일괄 수정 없음, 비표준 구분(예: `FABRIC`)은 구분 값 열로 눈 확인, 스타일에 BOM 이 여럿이면 활성 BOM 하나만 점검, 수만 행 규모에서는 SQL 집계 전환 필요, jsdom 이 없어 탭 전환·필터·"열기" 클릭은 정적 렌더·순수 함수까지만 검증. 후속: 스타일 단위 겉감 혼용률 칸, 수입 선적 미리 채우기, 엑셀 미리보기·BOM 조회의 행 추가, 비표준 구분 보정 도구.
