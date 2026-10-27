# PR-198 완료 보고: 자재명세 엑셀 업로드 — 기존 BOM과 비교해서 사람이 고르는 덮어쓰기·교체 + 작지 스타일번호 유사 경고

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 사항을 보려는 사람).

- 브랜치: `feat/bom-excel-reconcile` (`origin/main` 최신 — PR-190/192/193/194/196/197 모두 반영된 상태에서 분기)
- **마이그레이션 없음.** 새 테이블/컬럼 없음.
- **운영 DB에 전혀 접속하지 않았습니다.** 실제 업무 데이터(자재명세 엑셀·작지)를 저장소에 넣지 않았습니다 — 테스트는 전부 익명 데이터(사례 수치만 재현: 2.7→2.9, MB73SKM109↔Z 등).

## 1. 사용자가 겪은 문제 → 이번 PR의 대응

| 사례 | 원인 | 대응 |
|---|---|---|
| 요척이 작지 AI 분석값(2.7)으로 남아 있고 엑셀의 정확한 값(2.9)이 반영 안 됨 | `mapping-commit.service.ts`의 커밋은 이미 등록된 (자재명,색상,규격) 행을 절대 덮어쓰지 않고 `BOM_ITEM_VALUE_DIFF` 알림만 남김(의도된 동작 — 값이 다르면 함부로 바꾸지 않음) | A-1/A-2: 비교 화면에서 사람이 "덮어쓰기"를 직접 고르면 적용(OVERWRITE) |
| 이름만 다른 중복 자재가 "전부 부족"으로 쌓임 | 자재 매칭이 이름 exact이라 AI가 읽은 이름과 엑셀 이름이 한 글자라도 다르면 둘 다 별도 행으로 남음 | A-1: `isSimilarMaterialName`(느슨한 정규화)로 SIMILAR 짝 제안 → A-2: REPLACE로 한 행으로 합침(제안일 뿐, 자동 확정 없음) |
| 작지 스타일번호 끝 글자(Z) 누락 | AI가 이미지를 그대로 Gemini에 보내는데 숫자/글자 교차검증 없음(원인 확인만, 모델/해상도 변경은 범위 아님) | B: `GET /master-styles/similar`로 끝 영문 1~2자 차이 스타일을 찾아 경고, 버튼을 눌러야만 값이 바뀜 |

## 2. 변경 요약

### A. 백엔드

| 영역 | 내용 |
|---|---|
| A-1. `POST /mapping/bom-diff`(읽기 전용) | `{styleNo, bomItems[]}` — 저장 안 함. 그 스타일에 활성 BOM이 없으면 `{hasExistingBom:false}`만 반환(화면은 비교 없이 기존 저장 경로로 진행). 있으면 자재명(trim) exact로 먼저 "같은 행"을 찾아 SAME/VALUE_DIFF로 분류하고, 매칭 안 된 나머지는 ONLY_NEW/ONLY_EXISTING, 그중 느슨한 이름 비교(`isSimilarMaterialName`)+구분(category) 일치로 1:1 후보만 SIMILAR 짝으로 제안(1:3처럼 애매하면 묶지 않음). 각 기존 행에 그 자재·스타일로 연결된(취소 아닌) 발주 건수(`linkedPoCount`)를 함께 내려준다. |
| A-2. `POST /mapping/bom-reconcile`(all-or-nothing) | `{styleNo, actions[]}` — `OVERWRITE`(기존 행 값을 엑셀 값으로 갱신, 요척이 바뀌면 `requiredQty = consumption × totalQty`로 재계산), `ADD`(새 행 추가, 자재는 이름으로 찾고 없으면 생성 — commit()과 같은 규칙), `REMOVE`(행만 제거, 자재 마스터·발주는 유지, 연결 발주 있으면 warnings에 건수), `REPLACE`(기존 행의 자재를 엑셀 이름의 **이미 있는** 자재로 교체 + 값 갱신 — 새 자재 생성 안 함, `BomsService.swapMaterial`과 같은 원칙). 모든 `bomItemId`가 그 스타일의 활성 BOM 소속인지 먼저 검증하고 하나라도 아니면 400 + 전체 롤백. 결과로 `applied`(건수별), `remainingBomItemCount`, `warnings`를 반환. 서버 로그에 변경 전/후를 남긴다(감사 테이블 없음). 기존 `POST /mapping/commit`의 동작·응답은 변경 없음. |
| 순수 로직 | `src/boms/utils/bom-name-normalize.util.ts`(신규): `normalizeForFuzzyMatch`(대소문자·공백·괄호·특수문자 제거), `isSimilarMaterialName`(정규화 후 같거나 한쪽이 포함). `src/mapping/utils/bom-diff.util.ts`(신규): `classifyBomDiff` — DB 접근 없는 순수 분류 함수. |
| B. `GET /master-styles/similar?styleNo=`(읽기 전용) | `src/styles/utils/style-no-similarity.util.ts`(신규): `isSimilarStyleNoBySuffix`(끝 영문 1~2자만 차이) + `findSimilarStyleNos`. 기존 `GET /master-styles`(:styleNo 동적 라우트 없음)와 순서 충돌 없음. `StylesService.findSimilar`는 스타일번호만 가볍게 조회해 순수 함수로 비교. |

### B. 프론트엔드

| 파일 | 내용 |
|---|---|
| `frontend-app/src/api/mapping.service.ts` | `getBomDiff`, `reconcileBom` 추가(응답 타입은 백엔드 분류 결과와 필드 일치). |
| `frontend-app/src/api/styles.service.ts` | `getSimilarMasterStyles` 추가. |
| `frontend-app/src/utils/bomDiffReview.ts`(신규, 순수 로직만) | `buildBomDiffDraftRows`(rows+similarPairs를 표 1개로), `defaultDecisionFor`/`buildDefaultDecisions`(행 유형별 기본 동작 — VALUE_DIFF는 건너뜀, ONLY_NEW는 추가, ONLY_EXISTING은 그대로 두기, SIMILAR은 기본 선택 없음), `applyExcelBasedDefaults`("엑셀 기준으로 모두 맞추기" — 체크만 채움), `summarizeBomDiff`, `buildReconcileActions`(사람이 고른 것만 변환, SKIP/KEEP은 제외). |
| `frontend-app/src/utils/styleNoSimilarity.ts`(신규, 순수 로직만) | 백엔드 `style-no-similarity.util.ts`와 같은 규칙을 프론트에 미러링(별도 TS 프로젝트라 직접 import 불가). |
| `frontend-app/src/components/MappingPreviewModal.tsx` | "승인/재승인" 버튼을 누르면 먼저 `bom-diff`를 호출 → 기존 BOM 없으면 바로 저장(기존 동작 그대로), 있으면 비교 화면(`BomDiffReviewView`, 새 표시 전용 컴포넌트)을 보여준다. 표: 상태·자재명(기존→새)·요척(기존→새)·색상·규격·연결 발주·동작(드롭다운). "엑셀 기준으로 모두 맞추기" 버튼은 체크만 채우고, [적용]을 눌러야 `bom-reconcile`을 호출한다. 적용 후 결과(건수·경고)를 닫기 전까지 유지. 기존 `MappingPreviewModalView`(단순 커밋 화면)는 변경 없음. |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 분석 결과마다 Style No. 입력 아래에 유사 스타일 경고(노란 배너 + "OOO로 바꾸기" 버튼, 자동 변경 없음)를 추가. 업로드 직후와 Style No.를 직접 고칠 때 재조회. 저장 직전(`handleSave`)에도 한 번 더 확인해 후보가 있으면 `window.confirm`으로 한 번 더 묻는다. |

## 3. 비교 화면 구조(열·동작 표, 실제 데이터 없이)

```
기존 자재명세와 비교
같음 1 · 값 다름 1 · 새 행 0 · 기존에만 0 · 유사 짝(제안) 1
[엑셀 기준으로 모두 맞추기]

상태        자재명(기존→새)                      요척(기존→새)   색상   규격   연결 발주   동작
값 다름     다데<실크>                            2.7 → 2.9       N/A    N/A    ⚠ 1건      [엑셀 값으로 덮어쓰기 ▾]
유사 짝(제안) DARK GREY DG (원단A) → 원단A         1.73 → 1.72     DG     S      -          [교체(기존 행을 엑셀 이름으로) ▾]

[닫기]  [적용]
```
적용 후:
```
적용 완료 — 덮어쓰기 1건, 추가 0건, 제거 0건, 교체 1건. 현재 자재명세 2건.
- BomItem #501(다데<실크>) 제거 — 연결된 발주(취소 제외) 1건이 있습니다.  (REMOVE를 고른 경우에만 표시)
부족분 표에서 중복·틀린 요척이 사라졌는지 확인해 주세요.
```

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **69 suites / 917 tests** 통과 (신규: `bom-name-normalize.util.spec.ts` 6건, `style-no-similarity.util.spec.ts` 11건, `bom-diff.util.spec.ts` 9건, `mapping-commit.service.spec.ts`에 diff/reconcile 10건 추가 — 회귀 없음) |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **69 suites / 555 tests** 통과 (신규 `test/bom-excel-reconcile-flow.e2e-spec.ts` 11건: bom-diff BOM없음/VALUE_DIFF+SIMILAR 분류/저장안함 확인, bom-reconcile OVERWRITE+REPLACE 적용 후 `GET /work-orders/style-requirements`로 중복없음·요척2.9·필요량2,842 확인, 재조회시 SAME, 다른스타일 bomItemId 섞이면 400+전체롤백, BOM없는스타일 404, REMOVE해도 자재/발주 유지, `GET /master-styles/similar` 4건) |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **59 files / 425 tests** 통과 (신규: `bomDiffReview.test.ts` 15건, `styleNoSimilarity.test.ts` 5건 — 기존 `MappingApprovalScreens.test.ts` 등 회귀 없음) |

### 프론트 렌더 테스트에 대해
`MappingPreviewModal`의 비교 화면(`BomDiffReviewView`)과 `SalesOrderUploadModal`의 유사 스타일 경고는 비동기 API 호출 → 상태 갱신에 의존하는 화면이라, 이 환경(`renderToStaticMarkup`만 지원, `useEffect`/사용자 상호작용 미실행)에서는 실제 렌더·클릭 테스트가 불가능하다(이전 PR들에서 반복된 동일한 제약). 화면을 구동하는 모든 판단 로직(비교 분류, 기본 동작, 일괄 채우기, 적용 액션 변환, 스타일번호 유사 판정)은 `bomDiffReview.ts`/`styleNoSimilarity.ts`로 뽑아 순수 함수 단위로 전부 테스트했고, 서버 쪽 분류·반영 로직은 e2e로 실제 HTTP 호출까지 검증했다.

## 5. 화면에서 확인할 것
① 작지 AI로 만든 BOM이 있는 스타일에 엑셀을 올리면(저장 버튼을 누르면) 비교 화면이 뜬다 — BOM이 없는 스타일은 비교 없이 바로 저장된다.
② 비교 화면에서 요척 2.7→2.9인 행에 "엑셀 값으로 덮어쓰기"를 고르고 [적용]을 누르면 반영되고, 품목 탭/부족분 표에서 요척이 2.9로 바뀐다.
③ 이름만 다르고 소요량이 같은 중복 행이 "유사 짝(제안)"으로 한 줄에 묶여 나온다 — "교체"를 사람이 직접 골라야 합쳐진다.
④ 작지 분석 화면에서 AI가 읽은 스타일번호(예: MB73SKM109)가 기존 스타일(MB73SKM109Z)과 끝 글자만 다르면 노란 안내와 "MB73SKM109Z로 바꾸기" 버튼이 뜨고, 버튼을 눌러야 입력칸 값이 바뀐다. 저장 버튼을 눌러도 후보가 남아 있으면 한 번 더 확인창이 뜬다.

## 6. 하지 않은 것(명시적 지시 준수)
- 자동 병합·자동 삭제·자동 이름 치환 없음(전부 사람이 화면에서 직접 고르고 [적용]을 눌러야 함).
- 운영 DB 직접 수정·정리 스크립트 없음, 실제 업무 데이터(엑셀/작지) 저장소에 없음(테스트는 익명 데이터).
- `Item`(자재 마스터) 삭제 없음 — REMOVE/REPLACE 모두 BOM 행만 바꾸고 자재 마스터는 그대로.
- AI 프롬프트·모델·해상도 변경 없음(원인만 확인, 별도 PR 범위).
- 새 컬럼/마이그레이션 없음.
- 작지 AI의 BOM 저장을 막는 정책 변경 없음(사용자 결정 사항).
- 기존 `POST /mapping/commit` 동작·응답, `MappingPreviewModalView`(단순 커밋 화면) 변경 없음.

## 7. 브랜치 SHA
커밋 완료 후 `feat/bom-excel-reconcile` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
