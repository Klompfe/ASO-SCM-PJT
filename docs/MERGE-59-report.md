# MERGE-59 — PR-254 머지 결과

- 대상: `fix/material-list-header-detect` (head 2f36df5) → `main` fast-forward (36a9340 → 2f36df5). 마이그레이션·package/lock 변경 없음 → Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 변경 (8개 파일, +370/−15, 줄바꿈만 바뀐 파일 없음 — `--ignore-all-space` 통계와 동일)
`src/mapping/utils/section-parser.util.ts`(+45/−4), 그 테스트 `section-parser.util.spec.ts`·`section-parser-header-detect.util.spec.ts`(신규), `src/sales-orders/utils/vision-guardrails.util.ts`, `composition-fabric-alias.spec.ts`(신규), `frontend-app/src/utils/compositionReview.ts`·`compositionReview.test.ts`, `test/material-list-header-reupload-flow.e2e-spec.ts`(신규). `src/migrations/`·package·lock·엑셀·상단 수량 블록 파서·작지 인식·수입 선적·안감 기본값 코드 변경 없음.

## 머리글 탐지 규칙과 시작 줄 계산식
- `findBomHeaderRow`: 앞쪽 30줄의 **0열**에서 앞뒤 공백 제거·대소문자 무시로 정확히 `ITEMS` 인 칸을 찾는다. 후보 1개 → 그 줄(기본과 다르면 `BOM_HEADER_SHIFTED` 안내), 0개 → **기존 고정 위치(0 기반 13)** + `BOM_HEADER_NOT_FOUND` 경고, 2개 이상 → 기본 위치에 가장 가까운 후보(같은 거리면 위쪽) + `BOM_HEADER_AMBIGUOUS` 경고.
- 데이터 시작 줄 = **머리글 줄 + 2**(기존 `dataStartIndex = bomStartIndex + 2` 그대로). 머리글 바로 아래 서브헤더 줄은 자재 행으로 읽히지 않는다.
- `CON'S`·`혼용률` 열: 머리글을 **찾은 경우** ITEMS 줄 → 바로 아래 줄 순으로 찾는다(실제 서식은 `혼용률` 이 ITEMS 줄, `CON'S` 가 서브헤더 줄). 못 찾아 기존 위치로 읽는 경로는 그 한 줄만 본다(기존과 동일). 한계: 머리글 줄에 `CON'S` 가 없고 아랫줄에만 있는 시트는 기존엔 요척이 0 이었으나 이제 읽힌다(의도된 개선).

## "첫 자재 행 복구" 효과 (로컬 샘플 39시트, 수정 전/후 파서 직접 비교, 개수만)
- 새 파서는 39/39 시트에서 **정확히 1행 더 많고**, 그 1행이 겉감(OUT-SHELL). 나머지 행은 **모든 필드(구분·자재명·요척·필요량·색상·규격 등)가 39/39 시트에서 수정 전과 동일**, 스타일 개요(styleNo·수량·공장·바이어)도 39/39 동일. 총 1115 → 1154행.
- 예전 코드의 "머리글 13" 은 실제로 서브헤더 줄이었고(샘플의 `ITEMS` 는 전부 0 기반 12, 기본 위치 13 인 시트는 0개) 매번 첫 자재 행을 건너뛰고 있었다.
- 혼용률 열은 39/39 시트에서 머리글을 찾았으나 **샘플의 해당 열 값이 전부 비어** 읽힌 값은 0(첫 업로드에 혼용률이 없는 것은 정상).

## 영문 별칭 판정
- 목록(서버 `COMPOSITION_FABRIC_ALIASES` = 프런트 동명 상수, 백엔드 테스트가 두 파일을 대조): 겉감, OUT SHELL, SHELL, OUTER SHELL, 안감, LINING, 퀼팅안감, 폴리트윌안감, 배색, 배색감, COMBINATION.
- 칸을 줄바꿈·연속 공백(2칸 이상) 조각으로 나눠 **어느 한 조각이 별칭과 정확히 같을 때만** 원단류. 비교 키는 공백·하이픈·밑줄 제거 + 대문자라 `OUT-SHELL` 은 `OUT SHELL` 과 같은 키로 직접 매칭된다(한글 조각 `겉감` 은 별도로 매칭). 부분 일치 없음 — `INTERLINING`, `EDGE TAPE`, `PAD`, `배색 스쿠이사 … THREAD` 는 원단류 아님(테스트 `isCompositionFabricCategory` 표).
- 한계: 한 칸이 **한 줄이고 한글·영문 사이가 공백 1칸**(예: `겉감 OUT-SHELL`)이면 한 조각이 되어 매칭되지 않는다(샘플은 줄바꿈 또는 연속 공백이라 해당 없음). 후속 후보.

## 변경하지 않은 것
안감 기본값(`LINING_COMPOSITION_DEFAULT`, 영문 `LINING` 에는 여전히 안 붙음), 상단 수량 블록 읽기(샘플에서 밀려 있지 않음), 저장된 구분 원문, 혼용률 값 변환 규칙(PR-248).

## 테스트
| | 직전 main(36a9340, 실측) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1445 | 1482 | 1482 통과 |
| 프런트 vitest | 999 | 1020 | 1020 통과 |
| e2e `--maxWorkers=2` | 654 | 655 | 655 통과 |

백엔드 `npm run build`, 프런트 `tsc -b`·build 통과. `origin/main` 은 이미 브랜치에 포함(병합 충돌 없음). **e2e `=2` 실패 없음**(`=1` 불필요). 골든 테스트("13번째 줄 시트: 결과가 기존과 같다")는 합성 시트에만 의존한다(샘플에는 기본 위치 시트가 없음). 후보 2개 "같은 거리" 테스트는 오류 없이 결정적으로 선택되는지만 약하게 확인한다.

## 후속 후보
겉감 없음 경고(PR-255), 스타일 단위 겉감 혼용률 칸, 수입 선적 미리 채우기, 겉감 누락 스타일 조회, 단일 공백 구분 표기 인식. **기존에 올라간 엑셀 스타일에는 겉감 행이 없을 수 있다 — 재업로드(비교 화면)에서 겉감이 신규 행으로 나오므로 그 경로로 보충해야 한다.**
