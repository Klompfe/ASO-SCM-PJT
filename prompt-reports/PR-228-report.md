# PR-228 — 수기 추가 자재(개수 품목)의 수량이 요척으로 중복 저장되는 문제 + "총수량과 같음" 오경고 + 비정상 요척 방어

브랜치: `fix/handwritten-row-qty-mapping` (origin/main `305242e` 기준)
병합: 하지 않음(지시대로 push만)

## 1. 원인 규명

### 1-1. 수량 499가 요척과 작지수량 양쪽에 들어간 경로 추적

| # | 경로 | 사용자가 넣는 칸 | 요척(consumption) | 작지수량(sheetQty/requiredQty) |
|---|---|---|---|---|
| ① | PR-223 "수기 메모 후보 → 자재 행으로 추가"(`appendBomItemFromCandidate`) | 후보 입력 UI에는 **"수량" 칸 하나만 있다**(`candidate.requiredQty`에 바인딩, `SalesOrderUploadModal.tsx` 1032행). **요척 입력칸 자체가 없다.** | `handwrittenCandidateToBomItem`은 `candidate.consumption`을 그대로 옮기는데, UI가 그 필드를 채울 방법이 없어 **항상 `null`** | `candidate.requiredQty`가 그대로 들어감(예: 499) |
| ② | PR-225 "＋ 자재 행 직접 추가"(`createEmptyBomItem`) | 두 칸 다 빈 채로 생성되고, 이후 **일반 BOM 행과 똑같은 표 입력칸**(기존 AI 인식 행과 동일 UI)을 사람이 직접 채운다 | "소요량"이라는 모호한 헤더(개당인지 총량인지 안 알려줌)의 입력칸 — 사람이 직접 타이핑 | "작지수량(출고량)" 입력칸 — 사람이 직접 타이핑 |
| ③ | 저장 요청(`buildCommitResult`)·서버 저장(`mapping-commit.service.ts`) | — | `consumption` 그대로 저장(복사 없음, 코드 확인) | `requiredQty`(=sheetQty 원본) 그대로 저장 |
| ④ | 개수 단위(EA 등) 품목에서 "요척" 칸의 의미 | — | 라벨이 "소요량"일 뿐 "개당"이라는 말이 없음 — 총 필요수량으로 오인하기 쉬움 | — |

**결론**: ①(수기 후보) 경로는 요척 입력칸 자체가 없어 코드가 수량을 요척에 복사할 수가 없다(`handwrittenCandidateToBomItem`/`appendBomItem`/`buildCommitResult`/서버 저장 어디에도 `consumption = requiredQty` 같은 복사 코드가 없음 — 코드 검색으로 확인). ②(직접 추가) 경로는 **두 입력칸이 완전히 독립적인 일반 텍스트 입력**이라, 사용자가 "소요량"(요척, 개당) 칸의 의미를 "작지수량(출고량)"과 같은 "필요한 총 수량"으로 오인하고 **같은 숫자(499)를 양쪽에 직접 타이핑**했을 가능성이 가장 크다.

### 1-2. 결론 (3줄)

① **버그 아님, 입력 칸 혼동**: 코드가 수량을 요척에 자동 복사하는 경로는 없다(검색으로 확인) — "소요량" 라벨이 "개당"이라는 말이 없어 모호했던 것이 원인으로 보인다.
② 다만 100% 확신할 수 없으므로(과거 입력 당시 화면을 재현할 수 없음) 지시대로 **버그 경로·입력 혼동 경로 모두 막는 방식**으로 진행했다: 라벨을 명확히 하고(②), 수량이 있는데 요척이 비면 자동으로 아무 숫자도 넣지 않고 **제안 칩**만 보여준다(③).
③ 499 × 499 = 249,001처럼 부풀려진 값이 나온 근본 원인(요척이 1이어야 하는데 499가 들어감)과, PR-226의 "작지 값=총수량" 경고가 **개수 품목(1개당 1이 정상)에는 안 맞는 규칙**이라는 두 가지 문제가 겹쳐서 사용자에게 혼란스러운 이중 경고로 보였다 — 이번 PR은 둘 다 고쳤다(④ 비정상 요척은 별도의 강한 경고로, ③ 개수 품목은 그 경고 자체를 끔).

## 2. 수량 → 요척 중복 방지

- `handwrittenCandidateToBomItem`은 원래부터 수량을 요척에 복사하지 않는다(1-1절 확인) — 변경 없음, 테스트로 명시적 고정(아래 4절).
- **신규**: `suggestConsumptionFromSheetQty(item, totalQty)`(`salesOrderBomReview.ts`) — 요척이 비어 있고 작지수량·총수량이 모두 있으면 `작지수량 ÷ 총수량`(소수 둘째 자리)을 **제안**한다. 자동 적용 금지 — "소요량" 입력칸 아래 제안 칩 버튼을 눌러야만 `updateBomItemField`로 값이 들어간다. 총수량이 0/없으면 칩이 뜨지 않는다.
- 표 헤더/입력칸 라벨 명확화: "소요량" → **"개당 소요량(요척)"**(title: "제품 1개당 들어가는 양입니다. 총수량이 아닙니다."), "작지수량(출고량)" → **"작지 출고량(총 필요 수량)"**. 두 입력칸 모두 같은 문구를 `title` 속성으로 추가.

## 3. "총수량과 같음" 오경고 정리

- 백엔드 `sheetQtyLooksLikeTotalQtyMisread`에 4번째 인자 `unitKind`(`classifyQuantityUnit`로 분류: `count`/`length`/`unknown`)를 추가 — **개수 단위(EA/PC/PCS/개/SET/장/PAIR/족)면 무조건 false**(1개당 1이 정상 케이스이므로 오경고 아님). **길이 단위(M/YD/Y/MM/CM/KM/MT)면 기존 그대로**. **판별 불가(빈 값·그 외 단위)면 기존처럼 경고하되**, 화면이 `quantityUnitKind==='unknown'`일 때만 "— 단위를 확인해 주세요"를 덧붙인다.
- 프런트 `appliedQuantity.ts`의 같은 이름 함수에도 동일하게 추가(순수 로직 복제, 기존 패턴) — `resolveAppliedQuantity`가 `itemUnit`으로 `quantityUnitKind`를 계산해 넘긴다.
- `StyleShortagePanel.tsx`([A] 부족자재 표)와 `SalesOrderUploadModal.tsx`(저장 전 "발주수량(적용)" 열) 양쪽에 "단위 확인" 문구를 같은 조건으로 추가.
- 서버·프런트 교차 fixture: 같은 합성 값(요척 499 오류 케이스, EA/YD/ROLL 단위)으로 `material-requirements.util.spec.ts`와 `appliedQuantity.test.ts` 양쪪에 동일한 테스트를 작성해 결과가 같은지 확인함.

## 4. 비정상 요척 방어

- **신규** `isExtremeConsumptionMismatch(computedQty, sheetQty)`(백엔드·프런트 양쪽 동일 로직) — 비율이 10배 초과 또는 1/10 미만이면 `true`. 기존 ±5% `mismatch`와 **별도 필드**(`extremeConsumptionMismatch`)로 노출(적용값 자체는 그대로 계산값 — PR-226 규칙 변경 없음).
- `StyleShortagePanel.tsx`/`SalesOrderUploadModal.tsx`에 강한 경고 추가: "⚠ 요척이 비정상적으로 보입니다(계산값 N / 작지 값 M) — 요척을 확인해 주세요"(`title`: "자재·BOM 조회 > 해당 행 수정 > 단위소요량에서 고치세요.").
- `purchaseOrderForm.ts`의 `suggestStyleLinkedQuantity`/`suggestUnlinkedQuantity`가 `row.extremeConsumptionMismatch`를 **packaging/conversionWarning보다 먼저** 확인해 `quantity: null`을 돌려준다 — "이 자재로 발주하기"를 눌러도 [B] 수량 칸은 비어 있다(기존 PR-220 "수량 기본 비움" 원칙과 동일 패턴).

## 5. 테스트

| 구분 | 내용 | 수 |
|---|---|---|
| 백엔드 `material-requirements.util.spec.ts` | `classifyQuantityUnit` 3, `sheetQtyLooksLikeTotalQtyMisread` unitKind 3, `isExtremeConsumptionMismatch` 4, `calculateMaterialRequirements` 통합(개수 품목 정상/오류 재현, 길이 단위 유지, 단위 불명) 4 | +14 |
| 프런트 `appliedQuantity.test.ts` | `classifyQuantityUnit` 1, `isExtremeConsumptionMismatch` 1, `resolveAppliedQuantity` 통합 4(서버와 같은 합성 값 교차 검증) | +6 |
| 프런트 `salesOrderBomReview.test.ts` | 후보→행 매핑 2(수량만 있으면 요척 비움/요척 명시되면 그대로), `suggestConsumptionFromSheetQty` 5 | +7 |
| 프런트 `purchaseOrderForm.test.ts` | `extremeConsumptionMismatch` 일 때 [B] 수량 비움(스타일 연결/미연결 경로 각각) | +3 |
| 프런트 `ShortageTable.test.tsx` | "단위 확인" 문구(unknown만 붙음, length는 안 붙음) 2, `extremeConsumptionMismatch` 표시 2 | +4 |
| 기존 테스트 | **무수정**, 전부 그대로 통과 |

### 테스트 수 (전/후)

| | Before(MERGE-31 기준) | After(이번 PR) |
|---|---|---|
| 백엔드(jest) | 1185 | **1199 통과**(76 스위트) |
| 프런트(vitest) | 628 | **648 통과**(72 파일) |
| e2e | 569 | **569 통과**(1차 `--maxWorkers=2`에서 바로 통과, 재시도 불필요) |

`tsc -b`, `npm run build`(백엔드·프런트) 모두 에러 없이 통과.

## 6. git diff 범위 확인

```
frontend-app/src/components/SalesOrderUploadModal.tsx       |  39 +
frontend-app/src/components/ShortageTable.test.tsx          |  43 +
frontend-app/src/components/StyleShortagePanel.tsx          |  15 +
frontend-app/src/utils/appliedQuantity.test.ts               |  69 +
frontend-app/src/utils/appliedQuantity.ts                    |  48 +
frontend-app/src/utils/bomRequirementReport.ts                |   7 +
frontend-app/src/utils/purchaseOrderForm.test.ts              |  22 +
frontend-app/src/utils/purchaseOrderForm.ts                   |  10 +
frontend-app/src/utils/salesOrderBomReview.test.ts            |  44 +
frontend-app/src/utils/salesOrderBomReview.ts                 |  15 +
src/work-orders/utils/material-requirements.util.spec.ts      | 103 +
src/work-orders/utils/material-requirements.util.ts           |  51 +
```
`src/migrations/`, `package.json`, 락 파일 변경 0. 모든 변경이 `frontend-app/`과 백엔드 `src/work-orders/utils/`(소요량 계산 유틸)에 한정됨.

## 7. 알려진 한계 / 기존 저장 데이터 안내

- **이미 저장된 행은 코드가 고치지 않는다.** 과거에 요척 칸에 수량이 잘못 들어간 행(예: 요척 499)은 이번 PR을 배포해도 그대로다 — 사용자가 **자재·BOM 조회 화면에서 해당 행 "수정"으로 단위소요량(요척)을 직접 고쳐야** [A] 부족자재 표에 올바른 필요수량(예: 499)이 반영된다.
- `classifyQuantityUnit`의 개수/길이 단위 목록은 고정 목록(EA/PC/PCS/개/SET/세트/장/PAIR/족, M/YD/Y/MM/CM/KM/MT)이다 — 목록에 없는 단위(예: ROLL, CONE, KG)는 `unknown`으로 분류되어 기존처럼 경고가 뜨고 "단위 확인" 문구가 붙는다. 더 많은 개수 단위 표기(예: "매", "본")가 실제로 쓰인다면 이후 PR에서 목록을 넓혀야 한다.
- `isExtremeConsumptionMismatch`의 10배 기준은 고정값이다 — 실제로 요척이 8~9배 틀린 경계 사례는 기존 ±5% `mismatch`로만 표시되고 강한 경고는 뜨지 않는다(의도된 동작, 기준을 바꾸려면 별도 결정 필요).
- 수기 추가 행의 "소요량" 라벨은 이번 PR에서 바뀌었지만(헤더 텍스트 변경), 기존에 이미 열린 화면(새로고침 전)에는 적용되지 않는다 — 배포 후 새로고침해야 보인다.

## 8. 사람이 화면에서 확인할 것 (병합·배포 후)

1. 수기 추가한 개수 품목(단위 EA)에서 **수량만 넣으면** "소요량"(요척) 칸은 비어 있고 그 아래 제안 칩("요척(개당 수량)이 비어 있습니다 — 작지 수량 ÷ 총수량 = 1.00을 요척으로 사용할까요? [적용]")이 보인다.
2. 칩을 **눌러야** 요척이 채워진다(자동으로 들어가지 않는다).
3. 발주관리 [A] 부족자재 표에서 **개수 품목**에는 "작지 값이 총수량과 같습니다 — 출고량 칸이 아닌 수량을 읽었을 수 있습니다" 경고가 **더 이상 뜨지 않는다**(길이 단위 품목은 그대로 유지됨을 함께 확인).
4. 요척이 비정상적으로 큰 행(계산값이 작지 값의 10배 넘게 차이)에는 "⚠ 요척이 비정상적으로 보입니다" 강한 경고가 보이고, "이 자재로 발주하기"를 누른 뒤 [B] 발주 폼의 수량 칸이 **비어 있다**(계산값이 자동으로 채워지지 않는다).
5. **이미 저장된 잘못된 행**(과거에 요척에 수량이 잘못 들어간 행)은 자재·BOM 조회에서 해당 행 "수정"으로 요척을 올바른 값(예: 1)으로 고친 뒤, [A] 표에서 필요수량이 올바른 값(예: 499)으로 바뀌는지 확인한다.
