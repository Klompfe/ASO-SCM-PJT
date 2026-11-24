# MERGE-63 — PR-258 머지 결과

- 대상: `feat/outer-fabric-supplement-api` (head cfb69d5) → `main` fast-forward (d235f00 → cfb69d5). 브랜치는 이미 `origin/main` 최신(d235f00)을 포함해 합칠 것이 없었다. 마이그레이션·package/lock·프런트 변경 없음 → Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).
- **이 PR 은 화면이 없어 머지해도 사용자가 이 기능을 호출할 방법이 없다**(PR-259 에서 화면 연결).

## 변경 (6개 파일, +670/−19, 줄바꿈만 바뀐 파일 없음 — `--ignore-all-space` 통계와 동일)
`src/mapping/services/mapping-commit.service.ts`(+158/−~19: 사전 판정·실행·정규화 Item 매칭 추가, ADD 행 생성 추출), `src/mapping/controllers/mapping-commit.controller.ts`(라우트 2개·`@HttpCode(200)`), `src/mapping/utils/outer-fabric-supplement.util.ts`(+spec, 신규 — 순수 판정), `src/mapping/services/mapping-commit.outer-fabric-supplement.spec.ts`(신규), `test/outer-fabric-supplement-flow.e2e-spec.ts`(신규). 프런트·마이그레이션·package/lock·파서·작지 인식·PR-256/257 코드 변경 없음. 기존 테스트 파일 수정·삭제 없음(전부 신규). 변경 6개 파일 깨진 글자 0건.

## `bom-reconcile` ADD 행 생성 추출 — 동작 불변
추출 전 인라인 본문(consumption=`?? 0`, requiredQty=총수량 양수면 `round(요척×총수량, 4자리)` 아니면 `newItem.requiredQty ?? 0`, `BomItem` 저장 필드 11개)과 `createBomRowFromNewItem` 본문을 줄 단위로 대조해 **동일**. 호출 순서(`findOrCreateMaterial` → 행 생성 → `items.push` → 카운트)와 인자(같은 `hasTotalQty`·`totalQty`)도 같다. 기존 `bom-reconcile` 테스트는 수정 없이 통과.

## 판정 순서와 사유 코드
`INVALID_INPUT`(스타일 번호 비어 있음·입력 행 0개/배열 아님·행의 자재명이 문자열 아님) → `NOT_REGISTERED` → `NO_BOM`(활성 BOM 없음 또는 행 0개) → `ALREADY_HAS_OUTER_FABRIC`(라이브 겉감 계열 행 있음) → `NO_OUTER_FABRIC_ROW` → `MULTIPLE_OUTER_FABRIC_ROWS` → `EMPTY_NAME` → `OTHER_CHANGES`. 겉감 판정은 PR-255 `isOuterFabricCategory`(단어 경계; 구분이 문자열이 아니면 겉감 아님). 이상 입력은 모두 `INVALID_INPUT` 으로 막히고 보충 가능으로 새지 않는다.
- **같은 파일 가드**(`outer-fabric-supplement.util.ts:116-120`): 엑셀 비교와 같은 `classifyBomDiff` 로 분류해 ① 새 행이 정확히 1개이고 그것이 그 겉감 행 ② 값 다름 0 ③ 기존에만 0 ④ **같음 수 × 2 ≥ 기존 행 수**(분모=라이브 활성 BOM 행 수, 분자=같음 행 수; 기존 행이 1개면 같음이 1개여야 통과, 같음 0이면 거부)를 모두 만족해야 한다. 엉뚱한 파일은 새 행·값 다름·기존에만 대량 발생으로 `OTHER_CHANGES`(테스트: `엉뚱한 엑셀 가드` 3건·`같음이 기존 행의 절반 미만이면 …`). 새 겉감 행이 유사 짝에 포함되면 제외(`outerInSimilar`) — 라이브에 겉감 행이 0개면 구분이 같은 기존 행이 없어 구조적으로 생기지 않지만 방어적으로 둔다. 겉감과 무관한 유사 짝은 `similarPairCount` 정보로만 반환(테스트 `겉감과 무관한 유사 짝은 …`).
- 활성 BOM 기준은 PR-256 과 같은 `pickActiveBom`(활성 중 id 최대, 모두 비활성이면 전체 중 id 최대). 활성 BOM 이 있으면 비활성 BOM 의 겉감은 보지 않는다(전용 테스트는 없음 — 알려진 공백).

## 쓰기 범위
실행 엔드포인트의 쓰기는 `Item` INSERT(필요 시 1건, 영문명 보충이 필요한 기존 Item 은 비어 있는 영문명만 UPDATE — PR-234 규칙) + `BomItem` INSERT 1건뿐이고 스타일·오더개요·선적일·계약·색상×사이즈·기존 BOM 행을 쓰는 코드는 없다(e2e: 전 테이블 행 수 전후 비교에서 `bom_item_details`·`items` 만 +1, 스타일/오더개요 JSON·다른 스타일·기존 BOM 행 JSON 전후 동일). 사전 판정은 트랜잭션을 열지 않고 SELECT 만 쓴다(단위 `사전 판정: SELECT 만 사용하고 트랜잭션을 열지 않으며 …`, 쓰기 메서드 호출 시 실패하는 mock). 부적격 실행은 롤백만 한다. 멱등: 두 번째 호출 `ALREADY_HAS_OUTER_FABRIC`·쓰기 0(`멱등: …`), 사전 판정 뒤 겉감이 생겨도 실행이 트랜잭션 안에서 다시 판정(`판정이 오래된 상태에서도 안전하다`).

## 엔드포인트
`POST /mapping/outer-fabric-supplement/check`(읽기 전용), `POST /mapping/outer-fabric-supplement`(실행). 둘 다 HTTP 200(판정 결과와 무관), 입력 형식 오류만 400, 인증 없으면 401(전역 JWT 가드 — `/mapping/commit`·`bom-diff` 와 같은 수준, 별도 역할 제한 없음). 요청 `{ styleNo, bomItems }`(기존 `BomDiffRequestDto`, 스타일 하나). 응답 `data`: `{ styleNo, eligible, applied, reason?, message, outerRowIndex?, info{ liveOuterFabricRows, existingRowCount, incomingRowCount, sameCount, similarPairCount, newRowCount, valueDiffCount, onlyExistingCount }, addedBomItemId?, createdMaterial? }`.

## PostgreSQL 잠금 코드 점검 (실제 DB 에서는 돌려 보지 못함)
- 코드: PostgreSQL 일 때만(`dataSource.options.type === 'postgres'`) 같은 트랜잭션의 `EntityManager` 로 `manager.createQueryBuilder(Bom, 'b').setLock('pessimistic_write').where('b.id = :id', ...).getOne()` 로 **활성 BOM 행 하나를 잠근 뒤** 행을 다시 읽어 판정한다.
- (a) 잠금 쿼리는 관계 조인·집계·DISTINCT·페이지 옵션 없이 `bom_master` 단일 테이블 행만 읽는다(`Bom` 엔티티에 `eager` 관계 없음 확인) → `FOR UPDATE` 제약 위반 구성이 아니다. (b) 잠금과 이후 INSERT 가 같은 트랜잭션 매니저 — 맞음. (c) 선례: 저장소에서 `lock: { mode: 'pessimistic_write' }` 를 PostgreSQL 운영 경로에서 쓰는 곳이 있다(`inventories.service.ts` 입고, `purchase-orders.service.ts` 입고 처리 — 둘 다 단일 엔티티 `findOne`). 같은 TypeORM 잠금 메커니즘이며, 쿼리 빌더 `setLock` 형태의 선례는 없음. (d) SQLite 에서는 분기로 건너뛰고, PostgreSQL 에서 잠금 쿼리가 오류를 내면 `catch` 에서 롤백 후 500(`InternalServerErrorException`) — **오류를 삼키고 잠금 없이 계속 쓰지 않는다**(fail-closed, 쓰기 0). 위험 구성 없음으로 판단해 머지.
- **첫 실제 사용(PR-259 배포 후 스타일 1개 시험)에서 확인할 것**: ① 실행이 500 없이 `applied:true` 로 끝나는지(잠금 쿼리가 PostgreSQL 에서 오류 없이 실행되는지) ② 같은 스타일을 한 번 더 실행하면 `ALREADY_HAS_OUTER_FABRIC` ③ 겉감 점검에서 `noRow` → `blank` 로 바뀌는지. 시험 중 500 이 나면 서버 로그의 오류 첫 줄을 기록해 PR-258 잠금 코드를 먼저 의심한다.

## 테스트
| | 직전 main(d235f00, 실측) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1535 | 1554 | 1554 통과 |
| 프런트 vitest | 1067 | 1067 | 1067 통과 |
| e2e `--maxWorkers=2` | 668 | 679 | 679 통과 |

백엔드 `npm run build`, 프런트 `tsc -b`·build 통과. 이후 main 에 추가된 것은 없음(브랜치가 최신 main 포함). e2e `=2` 실패 없음. 샘플 39시트가 "새 행은 겉감 1개·나머지 같음"으로 판정된다는 확인은 작업 중 일회성 비교였고 **PR 의 테스트로 들어 있지 않다**(테스트는 전부 합성 데이터, 새 엑셀 파일 추가 없음).

## 알려진 한계·후속
화면은 PR-259(순차 호출·실패 격리·승인 직전 재확인·같은 스타일번호 중복 제외는 호출 측 책임), 겉감 2줄 이상/비표준 구분(`FABRIC`)은 보충하지 않음, 겉감 Item 이름 갱신 없음, 실제 작지 인식 미확인, 비활성 BOM 에만 겉감이 있는 경우의 전용 테스트 없음, PostgreSQL 동시성은 첫 실제 사용에서 확인.
