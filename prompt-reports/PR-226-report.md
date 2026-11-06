# PR-226 — 자재 수량 우선순위 변경: "계산값 우선, 작지 값은 대조·대체 근거" + LOT 합산 + 총수량 오독 방어

대상 브랜치: `fix/applied-qty-computed-first-lot-sum` (origin/main `a1b76df`에서 분기, push만 — **병합 없음**)

이 보고서는 원래 지시서(우선순위 변경 + LOT 합산)와, 사용자가 작지 원본으로 직접 확인한 뒤 보낸 **추가 지시**(총수량 오독 방어, LOT 소수점/동그라미 번호 처리) 둘 다를 같은 브랜치에 반영한 결과를 함께 담는다.

## 사용자가 작지 원본으로 확인한 사실 3가지와 정정

| # | 처음 보고 | 원본 확인 후 정정 |
|---|---|---|
| 1 | "작지수량 499 vs 계산값 758" | 작지 겉감 행의 **요척은 1.52**, **출고량 칸은 2줄**(LOT 표시가 `LOT1/LOT2`가 아니라 **동그라미 번호 ①②**였음), 값은 **317.54 / 442.54**(소수 둘째 자리), **합계 760.08** |
| 2 | — | **스타일 총수량 = 499**. 계산값 = 499 × 1.52 = **758.48**. 작지 합계(760.08)와 차이 **약 0.2%** → 일치로 본다(mismatch 아님) |
| 3 | "499는 LOT 첫 줄" | **정정**: 499는 LOT 줄 값이 아니라 **스타일 총수량과 같은 숫자**였다 — 인식이 출고량 칸이 아니라 **총수량(또는 다른 칸)을 출고량으로 오독**했을 가능성이 크다. (PR-226 원 지시서의 "499=LOT1" 설명은 틀렸음 — **우선순위 규칙(계산값 우선·LOT 합산) 자체는 그대로 맞다**, 이번 추가 지시는 "총수량과 정확히 같은 작지 값"을 별도로 경고하는 방어 로직만 더한다.) |

## 1. 현황 파악 (수정 전 — 세 곳의 우선순위 규칙)

| 위치 | 수정 전 규칙 | mismatch 처리 | 표시 문구 |
|---|---|---|---|
| `src/work-orders/utils/material-requirements.util.ts`(서버 소요량 계산, [A] 부족자재 표의 데이터 출처) | **sheetQty(단위 일치) 1순위** → 2순위 색상×사이즈 수량표(색상 있는 행) → 3순위 총수량×요척(공통 행) → unknown | sheetQty를 적용한 행에서만, `computedQty`(총수량×요척, 자재 전체 집계)와 비교 ±5% | `StyleShortagePanel.tsx`: "작지 수량(N)과 계산값(요척×기획수량, M)이 달라 확인이 필요합니다" |
| `frontend-app/src/utils/appliedQuantity.ts`(PR-222, 저장 전 초안 미리보기) | 서버와 **같은 순서**(sheetQty 1순위) | 같은 방식(단일 행 기준) | `SalesOrderUploadModal.tsx`: "작지 값 적용 N / 계산값 M" |
| [A] 부족자재 표(`StyleShortagePanel.tsx`) | 별도 로직 없음 — 서버 응답(`basis`/`mismatch`/`computedQty`/`sheetQty`)을 그대로 표시만 함 | 서버와 동일 | 위와 같음 |

**세 곳 모두 "sheetQty 1순위"로 일치돼 있었다** — 서로 다른 곳이 없었다(그래서 이번 PR은 "일관되게 바꾸기"가 아니라 "세 곳 모두 같은 방향으로 바꾸기"였다).

### 기존 저장 데이터 영향

이 규칙은 **읽을 때 적용**된다(기존 저장 데이터는 변환하지 않음) — 이미 `BomItem.sheetQty`가 저장된 행은, 다음에 BOM 소요명세서/[A] 부족자재 표를 조회할 때부터 새 규칙(계산값 우선)이 적용된다. **작지 값과 계산값이 5% 이상 다르던 행은 이제 필요량이 계산값으로 바뀐다**(이전에는 작지 값이 그대로 적용됐었음). `BomItem.sheetQty` 컬럼 자체의 값은 바뀌지 않는다(DB UPDATE 없음) — 단지 그 값을 "적용"하는지 "대조만" 하는지가 바뀐다.

## 2. 구현 (세 곳을 한 공통 로직으로 합치지 않음 — 중복 보고)

서버(`material-requirements.util.ts`)와 프런트(`appliedQuantity.ts`)는 **여전히 각자 파일에 같은 식을 복제**한다(기존 PR-220/222부터의 패턴 — 두 TS 프로젝트가 분리돼 있어 직접 import 불가, "큰 리팩터링은 하지 말 것" 지시에 따라 공통 모듈화는 하지 않고 양쪽을 일치시키는 데 집중했다). [A] 부족자재 표는 서버 응답을 그대로 쓰므로 별도 구현이 없다.

### 새 우선순위 (세 곳 동일)

1. **계산값이 있으면 계산값을 적용**: 색상이 있고 그 색상이 색상×사이즈 수량표(PR-212)에 있으면 `색상 합계 × 요척`(`color-qty`), 색상 구분 없는 행(빈칸/FREE/N/A)은 `총수량 × 요척`(`computed`).
2. **작지 값(LOT 합산 후)은 대조·대체 근거**: 계산값이 있고 작지 값도 있으면 비교해 ±5% 넘으면 **불일치 경고**(적용은 계산값).
3. **계산값이 안 만들어지는 행**(색상이 수량표에 없음)에서만 작지 값을 적용(`sheet`, 단위 일관성 검사는 기존대로).
4. 색상 있고 계산값·작지 값 모두 없으면 기존대로 `needsColorQty`.

## 3. LOT 합산 (인식 단계)

### 스키마 추가 필드

`handwrittenCandidates`(PR-223)와 같은 방식으로 `bomItems[].requiredQtyLots`(숫자 배열, 선택)를 추가했다. `requiredQty`는 "그 합계"로 재정의했다 — 모델이 합계를 못 내도 **서버가 결정적으로 재계산**한다(`sumRequiredQtyLots`, `src/sales-orders/utils/required-qty-lots.util.ts`): 개수 상한 10개, 음수·NaN 제외, 소수 둘째 자리 반올림. `sheetQty`(저장 필드)에는 이 합계만 들어간다 — LOT 줄 내역(`requiredQtyLots`) 자체는 저장하지 않는다(`buildCommitResult`가 `bomItems`에서 제외, PR-223의 `handwrittenCandidates` 제외와 같은 패턴).

### 프롬프트 변경 전/후 (원문 인용)

**변경 전**(기존 1차 LOT 지시 — 이 PR 작업 중 1차로 추가했던 문구):
> "출고량 칸에 LOT1, LOT2처럼 여러 줄의 숫자가 적혀 있으면(한 행에 값이 둘 이상), 각 줄의 숫자를 모두 읽어 requiredQtyLots에 담고(예: [499, 259]), requiredQty는 그 합계로 하세요..."

**변경 후**(사용자 확인 사실 반영 — 동그라미 번호·소수 둘째 자리 추가):
> "출고량 칸에 값이 여러 줄로 적혀 있으면(**LOT1, LOT2 같은 글자 표기, 또는 ①·②·③처럼 동그라미 번호로 구분된 줄 — 둘 다 같은 뜻의 LOT 구분자입니다**), 각 줄의 숫자를 모두 읽어 requiredQtyLots에 담고(예: [317.54, 442.54]), requiredQty는 그 합계로 하세요(직접 더해서 넣어도 되고, 모르면 서버가 다시 합산합니다). **숫자에 소수점이 있으면 소수 둘째 자리까지 그대로 읽으세요 — 반올림해서 정수로 줄이지 마세요.** 한 줄만 있으면..."

**새로 추가한 "출고량 칸만" 지시**(총수량 오독 방어, requiredQty 문단 끝에 추가):
> "**requiredQty는 반드시 그 행의 "출고량(요구수량)" 칸에 있는 값만 읽으세요 — 스타일 총수량, 주문수량, 장수처럼 다른 칸(보통 문서 상단이나 다른 표)에 적힌 숫자를 출고량 대신 넣지 마세요.** 출고량 칸이 비어 있거나 안 보이면 다른 칸의 숫자로 대신 채우지 말고 null로 두세요."

기존 자재 표 인식 규칙(1~3번 항목)은 그대로이고, 2번 항목(bomItems)의 requiredQty 문단에만 추가했다 — 다른 항목(overview/sizeSpecs/workNotes/handwrittenCandidates)은 건드리지 않았다.

## 4. 총수량 오독 방어 (추가 지시)

작지 값이 **스타일 총수량과 정확히 같고**(소수 오차 허용 안 함 — 499.01≠499) 계산값과 **mismatch가 난 경우**(±5% 초과), "작지 값이 총수량과 같습니다 — 출고량 칸이 아닌 수량을 읽었을 수 있습니다" 안내를 **추가로** 보여준다. **적용값은 그대로 계산값(또는 계산값이 없어 sheet를 대체 근거로 쓰는 경우는 그 sheet 값) — 자동으로 버리지 않는다.**

- 서버: `sheetQtyLooksLikeTotalQtyMisread(sheetQty, totalQty, mismatch)` 순수 함수(`material-requirements.util.ts`), `MaterialRequirementRow.sheetQtyLooksLikeTotalQtyMisread` 필드로 노출.
- 프런트: 같은 이름·같은 로직의 함수를 `appliedQuantity.ts`에 복제, `AppliedQuantityResult.sheetQtyLooksLikeTotalQtyMisread` 필드.
- 표시: `StyleShortagePanel.tsx`(기존 "⚠ 작지 수량...확인이 필요합니다" 아래에 한 줄 추가), `SalesOrderUploadModal.tsx`(기존 "계산값 N 적용 · 작지 값 M와 차이 X% — 확인" 아래에 한 줄 추가).

### YOCHEOK_QTY_MISMATCH 발생 조건 (확인 결과 — 코드 변경 없음)

`YOCHEOK_QTY_MISMATCH`는 `src/sales-orders/utils/vision-guardrails.util.ts`의 `checkYocheokMismatch`/`checkYocheokMismatchBundle`이 만드는, **이번 PR-226의 "계산값 우선" 우선순위(±5%, material-requirements.util.ts)와는 별개의 기존 경고**다(작지 인식 검토 화면의 "요척×수량이 출고량과 다름" 배지, PR-200/201c). 임계값은 **±1%**(`pctDiff <= 0.01`이면 경고 없음)이고, `applyRequiredQtyLots`가 `applyGuardrails`보다 먼저 실행되므로 이 검사는 **이미 LOT 합산된 값**을 본다.

| 항목 | 전(PR-226 전) | 후(PR-226 추가 지시 이후) |
|---|---|---|
| 임계값 | ±1% | ±1%(**변경 없음**) |
| 정상 케이스(760.08 vs 758.48, 차이 0.2%) | 통과(경고 없음) | 통과(경고 없음) — **그대로 일치** |
| 오독 케이스(499 vs 758.48, 차이 34%) | 경고 발생 | 경고 발생 — **그대로 일치** |

지시서는 "발생 임계값은 ±5%"라고 가정했지만 실제로는 ±1%(더 엄격)다. 사용자가 확인한 두 예시(정상 0.2%, 오독 34%) 모두 **1% 임계값으로도 이미 원하는 결과**(정상엔 경고 없음, 오독엔 경고 있음)가 나오므로 **코드를 조정하지 않았다** — 1%든 5%든 이 두 예시의 결과가 달라지지 않기 때문이다(0.2%는 둘 다 통과, 34%는 둘 다 걸림). `vision-guardrails.util.spec.ts`의 기존 테스트도 수정 없이 그대로 통과한다.

## 5. 변경한 테스트 목록과 이유

기존 테스트 중 **수정한 것은 없다.** 아래 표는 왜 그런지 설명한다.

| 파일 | 기존 테스트가 영향 없는 이유 |
|---|---|
| `material-requirements.util.spec.ts`(PR-220/220b 블록) | 전부 `colorQuantities` 옵션을 넘기지 않는(또는 그 색상이 수량표에 없는) 상황이라, 새 우선순위에서도 "계산값 없음 → sheet 적용"(3순위)으로 떨어져 **기존과 같은 결과**를 낸다 — 애초에 "계산값과 sheetQty가 동시에 있는" 케이스(이번 버그의 핵심)를 테스트한 적이 없었다. |
| `test/sales-order-sheet-qty-flow.e2e-spec.ts` | 색상×사이즈 수량표를 전혀 올리지 않는 시나리오(순수 `commit-analysis`만 호출)라 colorQtyMap이 항상 비어 있고, 마찬가지로 "계산값 없음" 경로로 떨어진다. |
| `vision-guardrails.util.spec.ts` | `YOCHEOK_QTY_MISMATCH` 임계값(±1%)을 바꾸지 않았으므로 영향 없음. |
| `appliedQuantity.test.ts`(PR-222 기존 ①~⑦) | ①⑥⑦번은 colorCode가 있지만 수량표가 비어 있어("계산값 없음") 여전히 sheet 적용 — 다만 ⑥번의 mismatch 계산은 "sheet 적용 행의 계산값 대조"가 "계산값이 없을 때의 폴백 비교(총수량×요척)"로 경로만 바뀌었을 뿐 **같은 공식·같은 결과**를 내도록 구현했다(보고서 2절). |

### 새로 추가한 테스트

| 파일 | 추가 개수 | 내용 |
|---|---|---|
| `src/work-orders/utils/material-requirements.util.spec.ts` | +14 | 우선순위 변경 5개(①~④ + needsColorQty), `sheetQtyLooksLikeTotalQtyMisread` 순수 함수 5개, 통합 4개(정상/오독/총수량 다름/계산값 없는 행) |
| `src/sales-orders/utils/required-qty-lots.util.spec.ts`(신규) | 9 | LOT 합산·단일값·없음·음수제외·전부무효·0허용·상한·문자열숫자 |
| `src/sales-orders/vision.service.spec.ts` | +6 | LOT 합산 4개 + 프롬프트 문구 2개(기존 LOT 지시 1개 + 총수량 오독 방어 지시 1개) |
| `frontend-app/src/utils/appliedQuantity.test.ts` | +18 | 우선순위 변경 5개, `formatLotBreakdown` 3개, `sheetQtyLooksLikeTotalQtyMisread` 순수 함수 3개 + 통합 3개(최종 18 = 6+3+3+3, 상세는 파일 참고) |
| `frontend-app/src/components/ShortageTable.test.tsx` | +2 | "총수량과 같습니다" 표시/숨김 |
| `frontend-app/src/utils/salesOrderBomReview.test.ts` | +1 | `requiredQtyLots`가 저장 요청에서 제외됨 |

## 6. 검증

| 구분 | 하한(MERGE-29 기준) | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1156 이상 | ✅ **1185/1185**(+29) |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 601 이상 | ✅ **619/619**(+18) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 이상 | ✅ **569/569 — 깨끗한 상태로 재실행해 1차 통과**(※ 중간에 한 번, 리팩터링 도중 일시적으로 컴파일이 깨진 상태에서 돌린 시도는 "Test suite failed to run" 컴파일 에러였다 — 수정 완료 후 다시 전체 실행해 통과) |

`git diff origin/main --stat` 확인: 변경 파일 16개(백엔드 8개 — `vision.service.ts`/`.spec`, `ai-analysis.dto.ts`, `material-requirements.util.ts`/`.spec`, 신규 `required-qty-lots.util.ts`/`.spec`; 프런트 8개). `src/migrations/`/`package.json`/락 파일 변경 0. Gemini 호출 없음(전부 합성 fixture).

## 7. 알려진 한계

1. **LOT 줄별 단위가 다른 경우 서버는 탐지할 수 없다** — 스키마에 "줄마다 단위"가 없고(숫자 배열뿐) 프롬프트로만 모델에게 "단위가 다르면 합산하지 말라"고 지시한다. 모델이 그 지시를 어기고 다른 단위 숫자를 섞어 보내면 서버는 그대로 합산한다(탐지 불가능).
2. **"총수량과 정확히 같음" 판정은 우연의 일치를 걸러내지 못한다** — 실제로 작지 수량이 정확히 총수량과 같은 드문 경우(우연)에도 경고가 뜬다. 안내일 뿐 자동으로 값을 버리지 않으므로 피해는 적지만, 거짓 경고 가능성이 있다.
3. **LOT 손글씨 오독 가능성 자체는 여전하다** — 동그라미 번호·소수 둘째 자리 지시를 추가했지만, PR-199에서 이미 확인된 PDF 이중 레이어 구조의 손글씨 손실 가능성은 이 PR로 해결되지 않는다.
4. **세 곳(서버/프런트/[A])의 로직 중복은 그대로 유지** — 공통 모듈화는 "큰 리팩터링 금지" 지시에 따라 하지 않았다. 세 곳 중 하나만 바뀌는 사고를 막으려면 추후 공통 패키지화를 검토할 수 있다(2단계 후보).

## 사람이 화면에서 확인할 것 (병합·배포 후)

1. **수주등록에서 겉감 LOT 2줄이 있는 작지를 올렸을 때**(이 확인은 Gemini 1회 호출이 필요하므로 **사용자가 별도로 승인한 경우에만** 진행) 겉감 행의 작지수량 칸이 LOT 합계로 채워지고 "발주수량(적용)"이 계산값과 같다(근거 배지에 LOT 내역이 보인다).
2. 작지 값이 계산값과 5% 이상 다르면 계산값이 적용되고 빨간 안내가 "계산값 N 적용 · 작지 값 M와 차이 X% — 확인" 형태로 보인다. 작지 값이 스타일 총수량과 정확히 같으면 "작지 값이 총수량과 같습니다..." 안내가 추가로 보인다.
3. 저장 후 발주관리 [A] 부족자재 표의 필요량이 저장 화면의 적용 수량과 같다.
4. 작지 수량이 없는 다른 자재는 이전과 같다(회귀 없음).

## 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리했다(아래 `git log` 참고). **main에 병합하지 않았다.**
