# PR-223 — 작지 표 밖 손글씨를 "수기 메모 후보"로 인식해 사람 확인 후 자재 행으로 추가

대상 브랜치: `feat/handwritten-memo-candidates` (origin/main `43430e9`에서 분기, push만 — **병합 없음**)

`prompt-reports/PILOT-21-report.md`(로컬, 조사 결과·설계안)를 먼저 읽고 그 5번 설계안을 기준으로 구현했다. 이 지시서(PR-223)가 PILOT-21보다 구체적으로 정한 부분(필드 이름, 상한, 저장 버튼 안내 등)은 이 지시서를 그대로 따랐다 — 아래 2절에 PILOT-21 설계안과 달라진 점을 적었다.

## 1. 변경 요약

| 구분 | 파일 | 내용 |
|---|---|---|
| 백엔드(스키마/프롬프트) | `src/sales-orders/vision.service.ts` | `RESPONSE_SCHEMA`에 `handwrittenCandidates` 배열 추가, `PROMPT`에 5번 항목 추가 + 기존 "새 항목은 표에서만" 금지 문구 보강 |
| 백엔드(DTO) | `src/sales-orders/dto/ai-analysis.dto.ts` | `AiHandwrittenCandidateDto` 신규, `AiSalesOrderResultDto.handwrittenCandidates?`(선택) 추가 |
| 백엔드(순수 함수, 신규) | `src/sales-orders/utils/handwritten-candidates.util.ts` | `sanitizeHandwrittenCandidates` — 개수/길이 상한, bomItems 이름 중복 제거, 형식 오류 시 빈 배열 |
| 백엔드(테스트) | `handwritten-candidates.util.spec.ts`(신규, 8개), `vision.service.spec.ts`(+5, 기존 1개 수정) | 합성 응답만 사용(Gemini 호출 없음) |
| 프런트(타입) | `frontend-app/src/api/salesOrders.service.ts` | `AiHandwrittenCandidate` 인터페이스, `AiSalesOrderResult.handwrittenCandidates?` |
| 프런트(순수 함수) | `frontend-app/src/utils/salesOrderBomReview.ts` | `handwrittenCandidateToBomItem`, `appendBomItemFromCandidate`, `updateHandwrittenCandidateField`, `buildCommitResult`가 `handwrittenCandidates`를 저장 요청에서 제외하도록 수정 |
| 프런트(테스트) | `salesOrderBomReview.test.ts`(+6) | 합성 값만 사용 |
| 프런트(화면) | `SalesOrderUploadModal.tsx` | "수기 메모 후보" 구역, 저장 버튼 근처 "처리하지 않은 후보 N건" 안내, 자재명세 표의 "수기 확인 필요" 배지 |
| 프런트(테스트) | `SalesOrderUploadModal.test.tsx`(+1) | 후보 0건이면 구역 없음(스모크) |

## 2. 스키마 필드 표 / 상한 / PILOT-21과 달라진 점

### `handwrittenCandidates` 항목 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `rawText` | string(필수) | 읽은 글자 원문 그대로 |
| `name` | string\|null | 자재명 해석, 확신 없으면 null |
| `spec` | string\|null | 규격(예: "내경 10φ") |
| `color` | string\|null | 색상 |
| `consumption` | number\|null | 함께 적힌 요척 |
| `requiredQty` | number\|null | 함께 적힌 수량 |
| `requiredQtyUnit` | string\|null | 수량 단위 |
| `locationHint` | string\|null | 대략적 위치(예: "하단 여백") |

**PILOT-21 설계안과 다른 점(이 지시서를 따름)**: PILOT-21은 `possibleQty`/`possibleUnit`을 제안했는데, 이 지시서는 `requiredQty`/`requiredQtyUnit`(+`consumption`)로 **PR-220의 기존 BOM 필드 이름과 똑같이** 맞추라고 지시했다 — 그대로 따랐다. 이유: "자재 행으로 추가" 시 `AiBomItemDto`의 같은 이름 필드로 **필드명 변환 없이 그대로 복사**할 수 있고, PR-220이 이미 `requiredQty`를 "작지에 인쇄된 수량을 계산 없이 그대로"라는 뜻으로 쓰고 있어 같은 의미를 재사용하는 게 "일관되다"고 판단했다. `consumption`(요척)은 지시서의 제안 필드 목록엔 없었지만, 사용자 답변("수량·요척도 적히는 경우가 있다")을 반영해 추가했다.

**상한**: 개수 최대 10개, 각 문자열 필드 최대 300자(`handwritten-candidates.util.ts`의 `MAX_CANDIDATES`/`MAX_FIELD_LEN`) — 넘으면 서버가 조용히 자르고(개수는 앞에서부터 10개, 문자열은 뒤를 자름) 업로드를 실패시키지 않는다.

## 3. 프롬프트 변경 전/후 (원문 인용)

**변경 전** (기존 2번 항목의 금지 문구):
> "새 항목은 표에서만 만드세요. 스케치·손글씨 메모의 글자로 새 자재 행을 만들지 마세요(메모는 workNotes로)."

**변경 후**:
> "새 항목(bomItems)은 표에서만 만드세요. 표 밖의 손글씨 글자로 새 자재 행을 만들지 마세요 — 자재·부자재·장식으로 보이면 5번 handwrittenCandidates에만 담고, 그 외 메모(봉제 방식·후가공 지시 등)는 workNotes로 옮기세요."

**추가된 5번 항목**(전체):
> "5. handwrittenCandidates(수기 메모 후보): 자재 표(상단 소재 표·하단 부자재 표) 밖, 페이지 어디든(라벨/장식 칸 위·옆 여백, 스케치 주변 포함) 손글씨로 적힌 글자 중 자재·부자재·장식으로 보이는 것이 있으면, 새 자재 행(bomItems)을 만들지 말고 이 배열에만 담으세요. 위치는 고정되어 있지 않습니다 — 표 밖이면 어디든 확인하세요.
> - rawText에는 읽은 글자를 보이는 그대로(추측으로 고치지 말고) 옮기세요.
> - name에는 자재명으로 보이는 해석을 넣고, 확신이 없으면 null로 두세요.
> - spec에는 규격(예: "내경 10φ"), color에는 색상을 적고, 없으면 null입니다.
> - consumption(요척)·requiredQty(수량)·requiredQtyUnit(단위)은 그 메모에 숫자가 함께 적혀 있을 때만 채우고, 없으면 반드시 null로 두세요(추측 금지).
> - locationHint에는 대략적 위치를 짧게 적으세요(예: "하단 여백", "라벨 칸 위").
> - 이미 자재 표 행(bomItems)으로 읽은 것과 같은 이름이면 중복으로 넣지 마세요.
> - 인쇄된 라벨 칸의 기본 인쇄 글자(MAIN, CARE 라벨, 가격 Tag 등 정식 표기)는 후보가 아닙니다 — 그 칸 주변에 별도로 손으로 적힌 글자만 후보입니다.
> - 확신이 없으면 후보에 넣지 마세요. 의미를 모르는 숫자·코드(예: "BE-WH" 같은 형태)는 rawText에만 적고 name은 null로 두세요.
> - 최대 10개까지만 담으세요."

기존 `workNotes`(4번 항목) 정의와 "4. workNotes..." 문구는 **전혀 바꾸지 않았다** — "스케치 주변 메모"는 여전히 workNotes로, "표 밖 자재로 보이는 것"만 새 경로로 분리했다.

## 4. 후보가 사라지지 않고 처리까지 가는 흐름

```
Gemini 응답(handwrittenCandidates)
  → sanitizeHandwrittenCandidates (개수/길이 상한, bomItems 이름 중복 제거, 형식 오류→빈 배열)
  → AiSalesOrderResult.handwrittenCandidates (업로드 응답, results 상태)
  → 화면 "수기 메모 후보" 구역에 카드로 표시(수정 가능한 입력칸)
       ├─ "자재 행으로 추가" → appendBomItemFromCandidate → results[].bomItems 끝에 추가
       │     → 이후 기존 행과 똑같이 computeBomRowBadges(새 이름 경고)·resolveAppliedQuantity
       │       (PR-222 발주수량 적용)를 받음 + "수기 확인 필요" 배지(handwrittenBomIndexes)
       └─ "무시" → ignoredCandidateIndexes에 기록(접힘, "되돌리기"로 복원 가능)
  → 저장(handleSave) 시 buildCommitResult가 handwrittenCandidates를 요청 바디에서 제외
       (처리 안 한 후보가 있어도 저장은 막지 않음 — 저장 버튼 근처에 안내만 표시)
```

처리(추가/무시) 전까지 후보는 `results` 상태(및 서버 응답)에 그대로 남아 있어 **조용히 사라지지 않는다** — 다만 모달을 닫거나 새로 업로드하면(상태 초기화) 당연히 없어진다(아래 "알려진 한계" 참고).

## 5. 테스트 숫자 (전/후)

| 구분 | 전(MERGE-26 기준) | 후 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1143 | ✅ **1156/1156**(+13: 유틸 8 + vision.service 5, 기존 1개는 새 필드 반영해 수정) |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 575 | ✅ **582/582**(+7: salesOrderBomReview 6 + SalesOrderUploadModal 1) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 | ✅ **569/569 — 1차 실행에서 전부 통과**(재시도 불필요) |

`git diff origin/main --stat` 확인: `src/migrations/`, `package.json`, 락 파일 변경 **0개**. 변경 파일은 백엔드 4개(`vision.service.ts`/`.spec`, `ai-analysis.dto.ts`, 신규 유틸 2개) + 프런트 5개(`SalesOrderUploadModal.tsx`/`.test`, `salesOrderBomReview.ts`/`.test`, `salesOrders.service.ts`) + 보고서.

## 6. 알려진 한계

1. **손글씨 오독 가능** — 모델이 글자를 잘못 읽으면 `rawText`/`name`에 오독 그대로 들어온다. 사람이 "자재 행으로 추가" 전에 입력칸에서 고칠 수 있게 했지만, 고치지 않고 추가하면 잘못된 값이 그대로 자재 행이 된다(기존 행 수정과 같은 수준의 주의가 필요).
2. **PDF 이중 레이어 구조(PR-199 지적 사항)** — 작지 PDF가 배경 JPEG+전경 마스크로 돼 있어 손글씨 일부가 아예 안 읽힐 수 있다는 점은 PR-199에서 이미 확인됐다. 이 PR은 "읽혔을 때 어디로 보낼지"만 고치는 것이라, 애초에 "안 읽히는" 문제는 해결하지 못한다(7번 "사람이 확인할 것"의 실제 재인식 테스트가 이 한계를 확인하는 자리다).
3. **후보는 영구 저장되지 않는다** — `handwrittenCandidates`는 업로드 응답에만 있고 DB에 저장하지 않는다(설계 원칙 3). 모달을 닫거나 새 파일을 올리면 처리하지 않은 후보도 함께 사라진다 — "처리하지 않은 후보 N건" 안내가 저장 전에는 보이지만, 저장을 막지는 않으므로 사람이 못 보고 넘기면 그 후보는 사라진다(사용자 확인 필요 — 다음 PR에서 "저장 전 확인창"으로 한 번 더 막을지 검토할 수 있음, 이번 PR은 지시서대로 "저장은 막지 않음"만 구현).
4. **중복 제거는 정확한 정규화 일치만** — bomItems 이름과 공백·대소문자·괄호만 무시하고 비교한다(약어·오탈자 매칭은 하지 않음, PR-220b의 색상 정규화와 같은 "추측 금지" 원칙). 이름이 조금만 달라도(예: 오탈자) 중복으로 판정되지 않아 같은 자재가 후보로도 남을 수 있다.

## 7. 사람이 화면에서 확인할 것 (병합·배포 후, 스타일 X 작지를 수주등록으로 다시 올려 — Gemini 1회, 사용자 승인됨)

1. "수기 메모 후보" 구역에 `금속장식 (내경 10φ)`가 읽힌 글자 그대로 보이는가.
2. "자재 행으로 추가" 후 자재명세 표에 행이 생기고, 수량·요척이 적혀 있었다면 그 값이 들어가는가(없으면 비어 있어야 함 — 자동으로 숫자를 만들어 넣지 않음).
3. 같은 작지의 기존 자재 행(소재 표·부자재 표에서 읽힌 행)이 변하지 않았는가(회귀 없음).
4. 후보가 없는 다른 작지에서는 "수기 메모 후보" 구역이 안 보이는가.

## 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리했다(아래 `git log` 참고). **main에 병합하지 않았다.** `prompt-reports/PILOT-21-report.md`는 그 지시서대로 로컬 파일로만 남겨 두고(커밋하지 않음) 이번 커밋에 포함하지 않았다.
