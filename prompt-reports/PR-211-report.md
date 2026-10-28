# PR-211 — MATERIAL LIST 재업로드가 기존 총수량(totalQty)을 0으로 덮어쓰지 않게 막기

브랜치: `fix/overview-totalqty-no-zero-overwrite` (분기점 `origin/main` `a55c497`). **main에 병합하지 않음.**

## 배경

PILOT-13에서 확인: `section-parser.util.ts`가 MATERIAL LIST의 QTY 칸을 읽는데, 실제 118/118 시트 전부 이 칸이 비어 있어 `totalQty`가 항상 0으로 파싱된다. `mergeOverview`(`mapping-commit.service.ts`)의 `if (overviewData.totalQty != null)`는 JS에서 `0 != null`이 참이라, **이미 총수량이 있는 스타일에 같은 파일을 다시 올리면 기존 값이 0으로 지워진다.**

## 변경 파일 (5개)

| 파일 | 내용 |
|---|---|
| `src/mapping/services/mapping-commit.service.ts` | `mergeOverview`의 totalQty 조건을 `Number.isFinite(...) && ... > 0`으로 변경 |
| `src/mapping/services/mapping-commit.service.spec.ts` | totalQty 보호 테스트 8건 추가 |
| `frontend-app/src/components/MappingPreviewModal.tsx` | 0이면 "미기재 (기존 값이 있으면 유지됩니다)" 표시 |
| `frontend-app/src/components/MappingApprovalScreens.test.tsx` | 위 표시 테스트 2건 추가 |
| `test/mapping-reapprove-merge-flow.e2e-spec.ts` | 실제 재업로드 플로우로 "totalQty=0 재승인해도 900 유지" e2e 테스트 1건 추가 |

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**.

## 감사 표 — `mergeOverview` + 신규 생성 경로의 다른 필드

| 필드 | 파서가 빈 칸일 때 만드는 값 | 현재 조건 | 기존 값을 덮어쓸 위험 | 조치 |
|---|---|---|---|---|
| `totalQty` | **0**(숫자) | `!= null` | **있음(확정)** | **고침** → `Number.isFinite && > 0` |
| `factory` | `undefined`(파서가 필드 자체를 안 보냄) | `if (truthy)` + 다르면 NEEDS_REVIEW만 | 없음(이미 안전, truthy 체크 + 충돌 시 자동반영 안 함) | 변경 없음 |
| `buyer` | `undefined` | `if (truthy)` | 없음(빈 문자열도 truthy 체크로 걸러짐) | 변경 없음 |
| `shipDate`→`firstShipDate` | `''`(빈 문자열, 실측 확인) | `if (truthy)` | 없음(`''`는 falsy) | 변경 없음 |
| `styleName`/`brand`/`itemType`/`productionType` | `undefined`(Excel 경로는 이 필드들을 안 보냄) | `!= null` | **이론상 있음**(빈 문자열 `''`이 들어오면 `'' != null`=true로 덮어씀) — 그러나 **실제 호출 경로(Excel 파서, AI 작지 경로 둘 다) 어디서도 이 필드에 빈 문자열을 보내지 않는다(확인됨 — 안 보내거나 `null`/실제값만 보냄)** | **고치지 않음** — 지금 발생하지 않는 이론적 위험까지 고치면 범위가 커짐, 애매하므로 보고만 |
| `targetRdd` | `undefined` | `if (truthy)` | 없음 | 변경 없음 |
| `cmtPrice` | 보내지 않음(사람이 확인한 값만 들어옴, 설계상) | `!= null` + 기존 값 있으면 NEEDS_REVIEW, 없으면 채움 | 없음(이미 PR-168에서 "자동 덮어쓰기 금지" 패턴으로 보호됨) | 변경 없음 |
| 신규 생성 경로(:124-139, `totalQty: overviewData.totalQty` 등) | 위와 동일 | 조건 없음(그대로 저장) | **해당 없음** — 지킬 기존 값이 없는 신규 스타일이라 덮어쓰기 위험 자체가 성립하지 않음 | 변경 없음 |

**결론: 확실한 위험은 `totalQty` 하나뿐이었다.** `styleName`/`brand`/`itemType`/`productionType`은 패턴은 같지만 실제로 빈 문자열이 발생하는 호출 경로가 없어 지금 당장 고칠 필요가 없다고 판단해 손대지 않았다(애매한 경우는 고치지 말라는 지시에 따름).

## 테스트 숫자 (전/후)

| 항목 | 하한 | 이번 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 1049 이상 | **1057**(+8) |
| e2e(`--maxWorkers=2`) | 557 이상 | **558**(+1) |
| 프런트 `vitest run` | 498 이상 | **500**(+2) |
| 백엔드/프런트 `tsc`·`build` | 통과 | **통과** |

전부 하한 충족, 실패 0건.

## 사람이 화면에서 확인할 것

1. **시험용 스타일**로 총수량이 있는 상태에서 같은 MATERIAL LIST를 다시 올려도(미리보기 → 저장) 스타일 관리의 총수량이 그대로다.
2. 미리보기 화면에 총 생산수량이 0이면 "미기재 (기존 값이 있으면 유지됩니다)"로 보이고, 양수면 숫자 그대로 보인다.

## 이번 PR에서 하지 않은 것

색상×사이즈 수량 테이블, `section-parser.util.ts`의 CLOOR/SIZE 블록 읽기, 작지 AI 경로 변경 — 전부 PR-212 이후로 미룸.

## 브랜치 상태

병합하지 않음 — `fix/overview-totalqty-no-zero-overwrite`만 push됨.
