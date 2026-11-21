# MERGE-57 — PR-252 머지 결과

- 대상: `feat/excel-overview-guard` (head bbe50c9) → `main` fast-forward (3179c6c → bbe50c9). 커밋 체인: e615a53(PR-252) → bbe50c9(안내 문구 화면 이름 "스타일 관리").
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트
| | 병합 직전 main(3179c6c, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1438 | 1445 | 1445 통과 |
| 프런트 vitest | 996 | 999 | 999 통과 |
| e2e `--maxWorkers=2` | 648 | 654 | 654 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과. e2e `=2` 실패 없음(이력 없음).

## 변경 파일 (11개, 범위 내)
백엔드: `src/mapping/services/mapping-commit.service.ts`(+spec), `src/mapping/controllers/mapping-commit.controller.ts`, `test/excel-overview-guard-flow.e2e-spec.ts`(신규), `test/mapping-reapprove-merge-flow.e2e-spec.ts`(기대값 1건)
프런트: `utils/commitNotices.ts`, `components/CommitResultPanel.tsx`(+`CommitResults.test.tsx`), `components/ItemsManager.tsx`, `utils/mappingApproval.ts`(+test)
마이그레이션·package/lock·`.env`·작지 경로·bom-diff/reconcile·`prompt-reports/`·`CLAUDE.md` 없음.

## 총수량 규칙 유지 근거
`mergeOverview` 의 총수량 분기(들어온 값 양수면 항상 갱신 / 0 이면 기존 보존 / 기존이 비었을 때만 후보값)는 코드가 그대로이고, 가드 모드에서도 `legacyFields=totalQty` 로 가드 루프(`guardedMergeOrderFields`)에서 빠져 같은 분기를 탄다(`!guard || legacyFields.has('totalQty')`). 따라서 충돌 목록에도 총수량이 들어가지 않는다. PR-211/212 근거(주석·DTO 주석·기존 단위/e2e)는 변경 없이 통과.

## 가드 적용·비적용 필드
| 필드 | 이 경로(`/mapping/commit`, 기존 스타일) |
|---|---|
| 바이어·스타일명·브랜드·품목·임가공 구분·납기(targetRdd) | **PR-249 가드**: 비어 있으면 채움 / 같으면 불변 / 다르면 기존 유지 + `orderOverviewConflicts` / 들어온 값이 비면 보존 (엑셀 파서는 실제로 바이어만 보냄) |
| 총수량 | 변경 없음(PR-211/212, 엑셀이 기준) |
| 공장·CMT단가 | 변경 없음(기존 보류 규칙 + 알림) |
| 선적일(shipDate→firstShipDate) | **가드 대상 아님 — 값이 있으면 여전히 덮어쓴다(한계)** |
| 신규 스타일 | 가드 무관, 전부 저장 |

## PR-130 기대 변경 요약 (사용자 승인됨)
e2e `mapping-reapprove-merge-flow` (4): 재승인 시 바이어 "바이어B 로 갱신" → "바이어A 유지 + `orderOverviewConflicts` 응답" 한 가지만 변경(총수량 900 갱신·스타일명/선적일 기존 유지·공장 유지+경고 단언은 그대로, 자재 행 병합·요척 등 다른 테스트 수정 없음). 모달 안내문(`REAPPROVE_NOTICE_POINTS`) 첫 문장이 "총 생산수량·선적일은 값이 있는 항목만 갱신 / 바이어 등 나머지 오더개요는 비어 있을 때만 채우고 다르면 기존 유지하며 알림"으로 바뀌었다.

## 안내 문구
프런트: "오더개요 N개 항목이 기존과 달라 유지했습니다(스타일 관리에서 바꿀 수 있습니다)" — 개별 승인 결과 패널, 일괄 승인 토스트, "다시 승인" 토스트(승인은 막지 않음, 충돌 없으면 문구 없음).

## 남은 한계
- 서버 NEEDS_REVIEW 알림(`ORDER_OVERVIEW_DIFF_KEPT`)의 엑셀용 꼬리 문구는 "(오더개요 수정 화면(스타일 관리)에서 바꿀 수 있습니다)" 로 프런트 문구와 표현이 조금 다르다(화면 이름은 같음). `CommitOptions` 위 주석("HTTP /mapping/commit(엑셀)은 옵션 없이 기존 동작 그대로")은 이 PR 이후 사실과 다르다 — 둘 다 후속 정리 후보.
- 선적일은 가드 밖(위 표). 허용 필드에 넣으려면 비교 화면·작지 경로까지 확장 필요.
- jsdom 없음: 모달·토스트는 정적 렌더·순수 함수 테스트까지만.
