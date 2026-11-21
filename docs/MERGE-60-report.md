# MERGE-60 — PR-255 머지 결과

- 대상: `feat/outer-fabric-emphasis` (head a8ba1c0) → `main` fast-forward (ad31735 → a8ba1c0). 마이그레이션·package/lock·서버 저장 규칙·파서 변경 없음 → Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 변경 (12개 파일, +311/−45, 줄바꿈만 바뀐 파일 없음 — `--ignore-all-space` 통계와 동일)
프런트: `utils/compositionReview.ts`(+test), `utils/salesOrderBomReview.ts`(+test), `components/CompositionSummary.tsx`(+test), `CompositionBulkPanel.tsx`, `MappingPreviewModal.tsx`, `SalesOrderUploadModal.tsx`, `ItemsManager.tsx`. 백엔드: `src/sales-orders/utils/vision-guardrails.util.ts`, `composition-fabric-alias.spec.ts`. `src/migrations/`·파서·안감 기본값·서버 저장 규칙·수입 선적·엑셀 파일 변경 없음.

## 별칭 인식 규칙
- 구분을 공백·줄바꿈·하이픈·밑줄·슬래시·쉼표·괄호·콜론 등으로 쪼갠 **단어 목록**(대문자)으로 만들고, 별칭이 **단어 경계에서 정확히** 나올 때만 인식한다(이웃 단어 최대 3개를 이어 붙여 `안 감`·`OUT SHELL` 같은 떨어진 표기도 비교). 부분 문자열 일치 없음 — `INTERLINING` 은 단어 하나라 `LINING` 이 아니다.
- 별칭: 겉감, OUT SHELL, SHELL, OUTER SHELL, 안감, LINING, 퀼팅안감, 폴리트윌안감, 배색, 배색감, COMBINATION. 겉감 계열: 겉감, OUT SHELL, SHELL, OUTER SHELL. 서버·프런트는 각자 같은 로직·목록을 두고 백엔드 테스트가 세 목록(원단류·겉감·비원단 단어)을 대조한다.
- **비원단 제외 단어(지시서 외 보완)**: THREAD, TAPE, ZIPPER, BUTTON, LABEL, TAG, PAD, HOOK, 단추, 테이프, 지퍼, 라벨, 실 — 단어로 들어 있으면 별칭이 같이 있어도 원단류로 보지 않는다. 경고 대상 판정에만 쓰이며 저장된 구분 원문·서버 저장 규칙에는 영향이 없다(서버에서는 vision 경로의 `COMPOSITION_ON_NON_FABRIC` 경고 판정에만 쓰임). 머지 전 샘플 39시트(1154행)에 적용: 원단류 140행, 별칭이 있으나 제외된 행 8(모두 `THREAD`, 배색사 같은 실) — 정당한 원단 구분이 제외된 사례 없음.

## 겉감 3상태 표시 (저장·승인 비차단)
- `noRow`: 빨간 박스 "겉감 행이 없습니다 — 완제품 재수입 세율 기준이 되는 겉감 혼용률을 담을 행이 없습니다(저장은 가능합니다)." / `blank`: 빨간 박스 "겉감 혼용률이 비어 있습니다 — 완제품 재수입 세율 기준이 되는 값입니다(저장은 가능합니다)" / `filled`: 요약 맨 앞 굵은 테두리 "겉감 혼용률: 값". 안감 등은 기존 노란 "혼용률 미기재 N행"(겉감 제외, 중복 없음).
- 표시 위치: 작지 저장 화면 오더개요 요약, 엑셀 매핑 미리보기, 자재·BOM 조회 제목 줄 아래. 표시 컴포넌트에 저장 버튼·`disabled` 없음. 알 수 없는 입력은 `noRow`, 겉감 여러 행 중 하나라도 비면 `blank`, 제외 체크 행은 뺌.
- 사용자에게 보이는 새 문구 원문: 위 3개 박스 문구, 버튼 "겉감 행 추가", 안내 "자재·BOM 조회에서 겉감 행을 추가해 주세요.", 버튼 "겉감만 선택".

## "겉감 행 추가" 범위와 빈 자재명 처리 (사용자 결정 반영)
- **작지 저장 화면에만** 버튼이 있다(기존 "＋ 자재 행 직접 추가"와 같은 `appendBomItem` 경로, 구분 `겉감` 고정, 요척은 비어 있음). 엑셀 미리보기·BOM 조회는 버튼 없이 안내 문구만.
- 자재명을 비운 채 저장하면 **자동 제외하지 않고** 기존 안내("자재명이 빈 행이 있어 저장할 수 없습니다 — …")가 그대로 뜬다. 추가한 행은 직접 추가 행으로 등록되어 기존 "삭제" 버튼(`deleteManualBomRow`)으로 지울 수 있다.

## 수정된 기존 테스트 4곳 (모두 "겉감 미기재는 `missingRows` 에 포함" 가정만 변경)
`summarizeCompositions` 같은 값 모으기(missingRows 1→0 + `outer` blank 단언 추가), 값이 하나도 없을 때(1→0 + `outer.kind` blank), 일괄 입력 후 미기재 수(`outer` blank 2행→filled), 영문 구분 집계(`outer.kind` blank). 삭제된 테스트 없음, `CompositionSummary` 테스트 3곳은 `outer` 필드만 추가. `salesOrderBomReview.test.ts` 는 삭제 줄 0(추가만 +20).

## 한글 깨짐 점검
작업 중 PowerShell 로 한글 파일이 깨진 사고가 있어 `git show` 로 되돌린 뒤 테스트 블록만 다시 붙였다. 머지 전 변경 12개 파일 전체(브랜치/`main` 양쪽)에서 대체 문자(U+FFFD)·한자 계열 문자(깨진 읽기의 흔적)를 검색: **0건**, 한글 인접 `?` 는 `main` 과 같은 기존 코드뿐(새로 생긴 것 없음).

## 테스트
| | 직전 main(ad31735, 실측) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1482 | 1491 | 1491 통과 |
| 프런트 vitest | 1020 | 1055 | 1055 통과 |
| e2e `--maxWorkers=2` | 655 | 655 | 655 통과 |

백엔드 `npm run build`, 프런트 `tsc -b`·build 통과. `origin/main` 은 이미 브랜치에 포함(충돌 없음). e2e `=2` 실패 없음(`=1` 불필요). 한계: jsdom 이 없어 버튼 클릭·일괄 입력 패널 펼침 후 "겉감만 선택" 동작은 순수 함수·정적 렌더로만 검증했다. BOM 조회는 저장된 구분이 `FABRIC` 같은 비표준 값(과거 테스트용 값)이면 겉감으로 인식하지 못해 `noRow` 로 보일 수 있다(운영 구분은 `겉감` 또는 엑셀 원문).

## 후속 후보
겉감 누락 스타일 조회(읽기 전용 목록), 스타일 단위 겉감 혼용률 칸, 수입 선적서류 미리 채우기, 엑셀 미리보기·BOM 조회의 행 추가.
