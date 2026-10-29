# PR-208 — 봉제·섬유 용어 자동 교정 (품목군 부분만, 자모 편집거리 ≤1)

브랜치: `feat/term-autocorrect-category` (분기점 `origin/main` `e9c5774`). **main에 병합하지 않음.**

## 변경 파일 (11개: 신규 3 + 수정 8)

| 파일 | 내용 |
|---|---|
| `src/sales-orders/utils/category-vocab.constants.ts`(신규) | 정적 어휘 상수 `CATEGORY_VOCAB`(115개) |
| `src/sales-orders/utils/term-autocorrect.util.ts`(신규) | `decomposeJamo`/`jamoDistance`/`extractCategory`/`suggestCategoryCorrection`/`applyCategoryCorrection` 순수 함수 |
| `src/sales-orders/utils/term-autocorrect.util.spec.ts`(신규) | 위 함수 단위 테스트 23건 |
| `src/sales-orders/vision.service.ts` | `applyGuardrails`의 bomItems 루프에 자동 교정 연결, `NAME_AUTOCORRECTED` 경고, `UNKNOWN_NAME` 경고에 후보 병합 |
| `src/sales-orders/vision.service.spec.ts` | 연결부 테스트 2건 추가 |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `AiBomItemDto.nameCorrection?: {from,to}` 필드 추가 |
| `frontend-app/src/api/salesOrders.service.ts` | 동일 타입 추가 |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | "교정됨(보봉사→본봉사)" 배지 표시 |
| `scripts/vision-eval/types.ts` | `AiBomItemLike.nameCorrection` 필드 추가(채점 보호용) |
| `scripts/vision-eval/scoring/bom-match.ts` | 하네스 영향 처리(아래 참고) |
| `scripts/vision-eval/scoring/bom-match.spec.ts` | 하네스 영향 처리 테스트 1건 추가 |

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**, `PROMPT`/`RESPONSE_SCHEMA`(vision.service.ts) 변경 **0건**. **`category-vocab.csv`를 저장소에 복사하지 않았다** — 1회 읽어서 상수 배열만 만들었다(`git status` 확인, CSV/xlsx/pdf/이미지 추가 0건).

## 사전 상수 — 115개

| 구분 | 건수 |
|---|---|
| 정답 시트 118개의 `정규화품목군` 중 한글로만 이루어진 항목 | 113 |
| 영문·기호 섞여 제외(예: `MAIN+SIZE`, `TAG PIN`, `(면)다데테이프`) | 47 |
| 사용자 결정으로 추가(`폴리단추`, `곤돌라스넵`) | +2 |
| **합계** | **115**(중복 없음, 전부 한글) |

## 규칙 표 (입력 → 결과, 실제 함수 실행 결과)

| 입력 | 거리/후보 | 결과 |
|---|---|---|
| `보봉사(코아사)` | `본봉사`와 거리 1, 후보 1개 | **corrected** → `본봉사(코아사)` |
| `다우다` | `다후다`와 거리 1, 후보 1개 | **corrected** → `다후다` |
| `본봉사`/`다후다`/`쉬폰` | 사전에 정확히 있음 | **unchanged** |
| `본 봉사`(공백 낌) | 공백 제거 후 `본봉사`와 정확히 일치 | **unchanged** |
| `가나다라마` | 거리 2 이하 후보 없음 | **unknown** |
| `옥단추` | `속단추`·`목단추` 둘 다 거리 1(후보 2개) | **ambiguous**(교정 안 함) |
| `실`(1글자, 사전에 없음) | 2글자 미만이라 후보 자체를 안 찾음 | **unknown** |
| `단추`(2글자, 사전에 정확히 있음) | 정확히 일치 | **unchanged** |
| `MAIN+SIZE LABEL`, `TAG PIN` | 한글 전용이 아님 | **unknown**(교정 대상 아님) |
| `폴리단추`, `곤돌라스넵` | 사전에 정확히 있음(사용자 추가) | **unchanged** |
| `곤돌라스냅`(모음 ㅐ↔ㅔ만 다름) | `곤돌라스넵`과 거리 **1**, 후보 1개 | **corrected** → `곤돌라스넵` |
| `곤돌라넵`("스" 음절 전체 누락) | `곤돌라스넵`과 거리 **2**(음절 삽입은 자모 2칸) | **unknown**, 교정 안 됨(참고 후보만 제시) |

`jamoDistance('보','본')===1`, `jamoDistance('다우다','다후다')===1`, `jamoDistance('곤돌라넵','곤돌라스넵')===2` 전부 테스트로 고정.

## 교정이 안 되는 경우 (의도된 설계)

- 품목군이 **2글자 이하**이고 사전에 정확히 없을 때(`실` 등) — 오탐 위험이 커서 후보 자체를 찾지 않음
- 자모 편집거리 **2 이상**(`곤돌라넵`처럼 음절 하나가 통째로 빠진 경우)
- 거리 ≤1 후보가 **2개 이상**(`옥단추` → 속단추/목단추, PILOT-12에서 미리 확인된 위험 쌍)
- **영문·한영 혼합 이름**(`MAIN+SIZE LABEL`, `TAG PIN` 등) — 한글 전용 품목군만 다룸
- **뜻이 바뀐 읽기**(예: PILOT-12에서 실측된 `플라스틱`처럼 AI가 아예 다른 단어로 읽은 경우) — 사전과 거리 자체가 멀어 애초에 후보가 안 잡힘, 이 PR의 자모 교정으로는 손댈 수 없는 영역(단추·장식 행의 이름 불안정성은 1단계 진단의 별개 문제)

## 하네스 영향 처리

`scripts/vision-eval/`의 `model-runner.ts`가 운영과 **동일한** `VisionService.analyzeSalesOrder()`를 호출하므로(별도 경로 없음), 이번 자동 교정도 하네스를 그대로 통과한다. **채점 로직(`bom-match.ts`)이 AI측 `itemName`을 읽는 4곳**(`classifyBomItems`의 그룹 분류 2곳·이름 비교 1곳, `checkLabelZonePresence`)을 전부 `rawName(item) = item.nameCorrection?.from ?? item.itemName`으로 바꿔, **nameCorrection이 있으면 교정 전 원문으로 채점**하도록 했다 — "운영이 고쳐준 값" 때문에 모델의 원래 읽기 정확도가 실제보다 좋게 측정되는 왜곡을 막는다. 테스트 1건(`보봉사`로 읽혔는데 교정되어 `본봉사`가 됐어도, 골든 `본봉사`와 대조 시 원문(`보봉사`) 기준으로 `NAME_DIFF`가 나와야 함)을 추가해 고정했다. 사람이 보는 리포트의 예시 출력(`scoring-pipeline.ts:203`의 `valuePairedExamples`)은 손대지 않았다 — 거기는 집계 지표가 아니라 사례 나열용이라 교정된 값을 보여줘도 무방하다고 판단했다.

## 프런트 — "되돌리기"는 기존 동작 재사용

교정된 항목의 자재명 입력칸은 원래부터 직접 수정 가능하므로(`updateBomItemField`), 별도 "되돌리기" 버튼을 만들지 않고 **기존 동작을 그대로 재사용**했다(지시서가 허용한 선택지). 대신 입력칸 옆에 "교정됨(보봉사→본봉사)" 배지(`data-testid="bom-name-autocorrected-{index}-{i}"`)를 추가했다. 이 컴포넌트는 내부 `useState`로 결과를 들고 있어 이 저장소의 기존 관례(`HsCodeManager.test.tsx` 등)상 렌더링 테스트로 이 배지의 동작을 검증할 수 없다 — 기존 패턴과 동일한 한계로, 실제 화면에서 확인이 필요하다(아래 "사람이 확인할 것" 참고).

## 테스트 숫자 (전/후)

| 항목 | 하한 | 이번 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 1024 이상 | **1049**(+25) |
| e2e(`--maxWorkers=2`) | 557 이상 | **557**(변경 없음) |
| 프런트 `vitest run` | 498 이상 | **498**(변경 없음, 이 컴포넌트는 렌더 테스트로 배지 검증 불가 — 위 설명) |
| 백엔드/프런트 `tsc`·`build` | 통과 | **통과** |

전부 하한 충족, 실패 0건. (`scripts/vision-eval/` 자체 테스트 136건도 전부 통과, 하한 요구사항에는 포함 안 됨이나 참고로 확인함.)

## 사람이 화면에서 확인할 것

1. 이름에 `보봉사`가 들어간 작지(예: `보봉사(코아사)`)를 올리면 자재명이 `본봉사(코아사)`로 바뀌고 입력칸 옆에 "교정됨(보봉사→본봉사)"가 보인다.
2. 정상 이름(`본봉사`, `다후다` 등)은 변화가 없다. 사전에 없는 이름이나 후보가 2개 이상인 경우는 이름이 안 바뀌고 기존 "마스터에 없는 이름입니다" 경고만 뜬다(후보 칩에 사전 후보가 추가로 보일 수 있음).

## 이번 PR에서 하지 않은 것

마스터 이름으로의 자동 교정, 이미 저장된 BOM의 소급 교정, 자재명 중복 방지(PR-206 범위), 라벨·단추 행 추가 — 전부 손대지 않음.

## 브랜치 상태

병합하지 않음 — `feat/term-autocorrect-category`만 push됨.
