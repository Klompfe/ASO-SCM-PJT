# PR-219 — 발주 입력 칸([B])·부족자재 표([A]) 개선 보고서

브랜치: `feat/po-form-reference` (origin/main `6b9dd36`에서 분기). **main에 병합하지 않았습니다.**

## 1. 요약

| 항목 | 상태 |
|---|---|
| [B] 오류 메시지를 버튼 근처로 이동 | 완료 |
| 단가 필수 판정 — 연결한 스타일 기준(폴백 포함) | 완료 |
| 실/테이프 종류 "전문가 추천"(키워드 표) | 완료 |
| [B] 안에서 종류 임시 선택 + 품목에 저장 | 완료 |
| [B] 수량 참고(콘/롤 환산) | 완료(스타일 연결 트랙만) |
| [B] 단가표 참고 — 1건도 표시, 임시 종류 반영 | 완료 |
| [A] 단위 불일치 버그(미터-콘 혼합 차감) 완화 | 완료 |
| 미도 단가표 실 항목 존재 여부 | 코드/시드로 "없음" 확인 — 아래 6절 |

## 2. [B] 오류 메시지 위치 (요구사항 1)

기존에는 `handleCreate`의 모든 검증/서버 오류가 `error` state 하나에 담겨 화면 **맨 위**(`PurchaseOrdersManager.tsx` 418번째 줄 부근)에만 표시됐습니다. [B] 입력 칸은 그보다 아래에 있어, 폼을 보며 "발주 생성"을 눌렀을 때 스크롤하지 않으면 오류가 전혀 보이지 않았습니다(PILOT-18에서 지적된 증상의 1순위 원인).

**조치**: `error`(목록 조회 실패 등 폼 밖의 상태)와 `formError`(검증/제출 오류)를 분리했습니다.
- `formError`는 "발주 생성" 버튼 바로 아래에 빨간 박스로 표시됩니다.
- 화면 맨 위 박스는 발주 **목록 조회** 실패에만 쓰도록 의미를 좁혔습니다(입고 처리/취소 버튼 오류도 기존처럼 그 박스를 씁니다 — 발주 생성 폼과는 별개 동작이라 범위를 좁혔습니다).
- **통일하지 않고 분리한 이유**: 같은 문구를 위/아래 두 곳에 동시에 띄우면 "같은 오류가 두 번 뜨나?" 혼란이 있고, 목록 조회 오류(폼과 무관)까지 버튼 근처로 옮기면 오히려 위치가 어색해집니다. 폼 오류만 옮기는 것이 증상(PILOT-18)과 가장 직접적으로 맞습니다.
- 검증 실패 시 해당 칸(품목/공급업체는 포커스 링, 수량/단가는 빨간 테두리)에 표시하고 `scrollIntoView`+`focus`로 첫 오류 칸까지 이동합니다.
- 단가 필수인데 비어 있으면 단가 칸 아래 "단가를 입력해 주세요" 인라인 문구가 뜹니다.
- 성공 토스트 위치는 그대로입니다.

## 3. 단가 필수 판정 — 스타일 기준 (요구사항 2)

`PurchaseOrdersService.getMaterialProductionContext(itemId, styleNo?)`([purchase-orders.service.ts:158](../src/purchase-orders/purchase-orders.service.ts))에 **선택적 `styleNo`**를 추가했습니다.

- `styleNo`가 있고 그 스타일이 (자재가 쓰이는) 활성 BOM 스타일 목록에 있으면 **그 스타일의 생산유형**을 바로 돌려줍니다 — 다른 스타일의 생산유형이 섞여 있어도 무시합니다.
- `styleNo`가 없거나, 있어도 그 스타일의 활성 BOM에 이 자재가 없으면 **기존 로직(전체 활성 BOM 기준)**으로 폴백합니다.
- `styleNo`를 생략한 기존 호출의 응답은 전혀 바뀌지 않습니다(하위호환) — 단위 테스트로 고정.

| 상황 | 결과 |
|---|---|
| 스타일 단일, CMT | CMT |
| 여러 스타일, 생산유형 혼합, **styleNo로 그중 CMT 하나를 지정** | CMT (기존엔 null→FOB 취급) |
| 여러 스타일, 생산유형 혼합, **styleNo로 그중 FOB 하나를 지정** | FOB |
| styleNo 생략 | 기존과 동일(혼합 시 null) |
| styleNo를 지정했는데 그 스타일 BOM에 이 자재가 없음 | 폴백(기존 로직) |

컨트롤러(`GET /purchase-orders/material-context`)에 `styleNo` 쿼리 파라미터를 추가했고, 프런트(`PurchaseOrdersManager.tsx`의 `selectItem`/`selectStyleMaterial`/`handlePickMaterial`)가 지금 연결한 스타일번호를 함께 보냅니다. React state 비동기 갱신으로 인한 오래된 값 전달을 막기 위해 `styleNo`를 콜백 인자로 명시적으로 전달하도록 고쳤습니다(클로저로 `styleSearch`를 참조하면 `setStyleSearch` 직후에는 아직 갱신 전일 수 있음).

## 4. 실/테이프 종류 "전문가 추천" 키워드 표 (요구사항 3)

`suggestThreadTapeByKeyword()`를 새로 추가했습니다(백엔드 `src/common/utils/packaging-subtype.util.ts`, 프런트 `materialRequirementDisplay.ts`에 미러 — 기존 `buildThreadTapeSuggestion`과 별개 함수로, displayName 토큰 직접 일치보다 넓은 동의어 표를 씁니다).

| 이름에 포함 | 추천 | 비고 |
|---|---|---|
| 오바, 오버로크, 배색사, 배색 실 | 오바사(4,000m/콘) | |
| 본봉, 스티치, QQ(대소문자 무시) | 코아사(2,500m/콘) | |
| 지누이도(폴리지누이도 포함) | 폴리지누이도(500m/콘) | |
| 다데/암홀 | 기존 규칙 displayName 그대로 | 테이프류, 충돌 거의 없음 |
| 코아사 계열 + 오바 계열, 또는 코아사 계열 + "배색" | 코아사 추천 + **확인 필요 배지** | 신뢰도 낮음 — 사람 확인 필요 |
| 키워드 없음(번수만 있음 등) | 추천 없음 | 번수로 추측하지 않음 |

자동 저장은 하지 않습니다 — [B]의 추천 영역은 참고 계산에만 쓰고, 사람이 "이 종류로 품목에 저장" 버튼을 눌러야 실제로 저장됩니다.

## 5. [B] 종류 임시 선택 + 수량/단가 참고 재계산 (요구사항 4~6)

- 품목을 고르고 종류가 미지정(BOM 행 종류 없음 + Item.materialSubType 없음 + 검토 안 됨 + 이름이 실/테이프로 보임)이면 들여다볼 영역이 뜹니다: 추천값(위 표) + 종류 드롭다운(기본값 = 추천) + "저장 전 참고값" 배지.
- 드롭다운에서 바꾼 값(`tempSubtype`, 저장 안 함)은 즉시 아래 **수량 참고**와 **단가표 참고**에 반영됩니다.
- **"이 종류로 품목에 저장"** 버튼은 기존 `classifyThreadTape` API(실/테이프 종류 지정 화면, `ThreadTapeClassificationManager.tsx`가 쓰는 것과 동일)를 그대로 재사용합니다 — 새 저장 로직을 만들지 않았습니다. 서버는 MANAGER/ADMIN만 허용하므로(기존 PR-186-FIX 정책), 그 권한이 없으면 버튼 대신 "관리자/매니저만 저장할 수 있습니다" 안내만 보이고, 저장 전 `window.confirm`으로 한 번 더 확인합니다.
- 이미 종류가 지정된 품목(BOM 행 또는 Item 지정)은 이 영역 자체가 보이지 않습니다(기존 PR-216/218 동작 그대로 — 자동 채움 경로도 변경 없음).
- **[B] 수량 참고**: 스타일 연결 트랙에서, 종류가 아직 확정 안 됐지만(참고용 임시 선택 또는 추천) 필요량(미터)이 있을 때만 "필요 Xm ÷ 단위길이 = N콘(참고)" + "이 값 사용" 버튼을 보여줍니다. 이미 종류가 확정된 자재는 기존 "이 자재로 발주하기"/선택 시 자동 채움 경로가 이미 수량을 채워주므로 중복으로 보이지 않습니다. **주의**: 이 참고값은 전체 필요량을 단위길이로 한 번에 나눈 근사치입니다(색상별로 먼저 올림해 합산하는 [A]의 정확한 계산과 다를 수 있음) — 확정 수치는 항상 [A] 표를 기준으로 하도록 "참고"로만 표시했습니다.
- **단가표 참고**: `PriceReferenceBlock`에 `materialSubType={effectiveSubtype}`을 새로 전달합니다 — 기존에 이미 있던 서버 파라미터(`GetPriceReferenceDto.materialSubType`)를 그대로 활용했고, 서버 변경은 필요 없었습니다. 임시 선택이 바뀌면 그 종류 기준으로 후보가 다시 조회됩니다.
- `PriceReferenceBlock.tsx`의 후보 목록 조건을 `candidates.length > 1` → `length > 0`으로 고쳤습니다 — 이전엔 후보가 정확히 1건일 때 조용히 숨겨져 있었습니다(코드 주석엔 "1건이면 suggested로 자동 표시"라 적혀 있었지만, `suggested`는 조건이 더 좁아서(범위값·환산 미확정이면 비워짐) 실제로는 1건 후보가 안 보이는 경우가 있었습니다).

## 6. 미도 단가표(mido_price_items)에 실 항목이 있는지

- `src/mido-price-table/` 안에 **정적 시드/CSV가 없습니다** — 테이블은 업로드로만 채워지는 구조이고, 현재 `mido-price-table.controller.ts`에는 `GET`(목록/후보 조회)만 있고 **등록(업로드) 엔드포인트가 main에 없습니다**.
- Sidebar.tsx에 "미도 단가표 관리" 같은 메뉴 항목이 없습니다 — 사용자가 언급한 **PR-188R(미도 단가표 관리 화면)은 아직 main에 병합되지 않았습니다.**
- 즉, 코드/시드만으로는 코아사/오바사/지누이도 항목이 실제로 등록돼 있는지 **확인할 수 없습니다**(운영 DB 조회는 금지돼 있어 하지 않았습니다). `PriceReferenceBlock`의 "단가표에서 이 자재와 맞는 항목을 찾지 못했습니다" 안내가 뜬다면, 그 자재명·단위(예: "오바사", 단위 콘, USD)로 미도 단가표에 항목을 등록해야 합니다 — 다만 **등록 화면이 아직 없으므로**, 등록은 DB에 직접 넣거나 PR-188R을 먼저 병합해야 가능합니다. 이 PR에서는 등록 화면/시드를 추가하지 않았습니다(요구사항에서 금지).

## 7. [A] 부족자재 표의 단위 불일치 수정 (요구사항 7)

**원인**(`material-requirements.util.ts`): 종류가 미지정이라 `packaging`이 비어 있으면, `shortageQty = max(0, requiredQty(미터) - orderedQty(콘/롤 수))`를 그대로 계산해 화면에 보여주고 있었습니다 — 미터에서 콘 수를 그대로 빼는 버그(사용자 보고 사례: 필요 301,270m, 발주 76, 부족 301,194로 표시).

**수정**: `conversionWarning`이 뜨는 두 경로(종류 미지정+이름이 실/테이프로 보임, 또는 단위가 콘/롤인데 종류 없음)에서, 자재명 키워드 추천(6절 함수)이 있고 그 종류에 포장 규칙이 있으면 **그 종류 기준 "참고" 환산값**(`suggestedPackaging` — `packaging`과 동일한 모양, 색상별 올림→합산)을 함께 계산해 둡니다. 화면(`StyleShortagePanel.tsx`)은:

| 상태 | 필요 총수량 칸 | 발주(스타일 연결) 칸 | 부족 수량 칸 |
|---|---|---|---|
| 종류 확정(`packaging`) | 기존과 동일(회귀 없음) | 기존과 동일 | 기존과 동일 |
| 추천 있음(`suggestedPackaging`) | `Xm (참고 N콘)` | `참고 N콘` | `참고 N콘`(인디고색, "참고" 명시) |
| 추천 없음(`conversionWarning`만) | `Xm`(미터만, 콘으로 섞어 보여주지 않음) | `종류 확인 필요` | `종류 확인 필요`(숫자 없음) |

사용자 사례(오바사 60S/3H THREAD, 필요 301,270m, 발주 76)를 테스트로 재현해, 수정 후 "참고 76콘 / 참고 0콘(부족)"으로 뜨는 것을 확인했습니다(`material-requirements.util.spec.ts`).

**바꾸지 않은 것**: 종류가 이미 지정된 행의 계산/표시(PR-216/218), 발주 수량의 저장·해석 방식.

| 항목 | 현재 방식(바꾸지 않음) |
|---|---|
| 발주 라인 수량(`PurchaseOrderLine.qty`, `PurchaseOrder.quantity`) | 저장 단위 그대로(정수) — 콘/롤 단위인지 미터 단위인지는 **자재별로 사람이 알고 입력**하는 값이고, 서버는 구분하지 않습니다. |
| 부족 계산에서의 해석 | 종류가 확정되면 `orderedQty`를 콘/롤 수로 "간주"해 `requiredPackages`와 직접 비교합니다(기존 PR-185 B-2 설계). |
| 입고 처리(`updateStatus RECEIVED`) | `Inventory.quantity += po.quantity` — 저장된 수량 그대로 더합니다(단위 환산 없음). |

## 8. 테스트 (전/후)

| 구분 | PR 전(최근 MERGE-22 기준) | PR 후 |
|---|---|---|
| 백엔드 `jest` | 1084 | **1100**(+16) |
| e2e(`--maxWorkers=2`) | 563 | **564**(+1, 1차 실행 통과) |
| 프런트 `vitest run` | 539 | **548**(+9) |

추가한 테스트: `suggestThreadTapeByKeyword`(백/프런트 각 7~8케이스, 충돌·키워드없음 포함), `material-requirements.util.ts`의 `suggestedPackaging`(5케이스, 사용자 사례 재현 포함), `getMaterialProductionContext(styleNo)`(4케이스), `ShortageTable`의 단위 불일치 완화 표시(2케이스), e2e 1건(FOB/CMT에 걸친 공용 자재가 styleNo로 올바르게 판정되는지).

`git diff origin/main --stat` 확인: `src/migrations/`, `package.json`, 락 파일 변경 **0건**.

## 9. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/common/utils/packaging-subtype.util.ts` | `suggestThreadTapeByKeyword` 추가 |
| `src/work-orders/utils/material-requirements.util.ts` | `suggestedPackaging` 필드/계산 추가, `buildPackagingConversion` 공용화 |
| `src/purchase-orders/purchase-orders.service.ts` | `getMaterialProductionContext(itemId, styleNo?)` |
| `src/purchase-orders/purchase-orders.controller.ts` | `material-context` 라우트에 `styleNo` 쿼리 추가 |
| `frontend-app/src/utils/materialRequirementDisplay.ts` | `suggestThreadTapeByKeyword` 미러 |
| `frontend-app/src/utils/bomRequirementReport.ts` | `MaterialRequirementRow.suggestedPackaging` 타입 추가 |
| `frontend-app/src/components/StyleShortagePanel.tsx` | [A] 단위 불일치 완화 표시 |
| `frontend-app/src/components/PriceReferenceBlock.tsx` | 후보 1건도 표시(`> 0`) |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | 폼 오류 위치, 종류 추천/임시선택/저장, 수량 참고, styleNo 전달 |
| `frontend-app/src/api/purchaseOrders.service.ts` | `getMaterialProductionContext`에 `styleNo` 파라미터 |
| 각 `*.spec.ts`/`*.test.ts`/e2e 1건 | 위 변경에 대한 테스트 |

## 10. 사람이 화면에서 확인할 것

메뉴: 자재·발주 > 발주관리 > 발주 탭.

1. [B]에서 단가를 0으로 두고 "발주 생성"을 누르면 — 버튼 바로 아래에 빨간 "품목 단가를 입력해 주세요" 박스와 단가 칸 아래 인라인 문구가 함께 뜨는지(스크롤 없이 보이는지).
2. 종류 미지정 실 품목(예: 이름에 "오바사"가 들어간 자재)을 고르면 — 인디고색 추천 영역과 근거 문구, 드롭다운 기본값(추천)이 보이는지.
3. 추천 종류로 "수량 참고" 박스(콘 수)와 "단가표 참고"의 후보가 뜨고, 각각 "이 값 사용"을 누르면 수량/단가 칸이 채워지는지(자동으로 채워지지 않는지도 함께 확인).
4. [A] 부족자재 표에서 종류 미지정 실 행의 "부족 수량" 칸이 더 이상 비정상적으로 큰 숫자(미터-콘 혼합)로 보이지 않고 "참고 N콘" 또는 "종류 확인 필요"로 보이는지.
5. (관리자/매니저 계정) "이 종류로 품목에 저장" 확인 팝업 후 저장하면, 추천 영역이 사라지고 이후 이 품목을 다시 고르면 종류가 이미 지정된 것으로 보이는지 — 그리고 "실/테이프 종류 지정" 화면에서도 같은 값으로 보이는지(같은 API 재사용 확인).

## 11. 하지 않은 것(요구사항 그대로)

종류 자동 저장(클릭 없이), 단가 자동 입력, 번수로 종류 추측, 필요량 계산 로직(올림 단위/색상 분배) 변경, Y↔M 환산, 단가표 값 DB 등록, 마이그레이션, main 병합.
