# PR-201 완료 보고: 작지 검토 화면 보완(다색 겉감 출고량 오경고·잘못된 요척 제안 제거 · 납기 연도 보정 기준 · 저장 비활성 안내) + 조사 3건

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 항목을 보려는 사람).

- 브랜치: `feat/pr-201-review-screen-fixes` (`origin/main` 최신 `7f1d906`에서 분기). **main에 병합하지 않음.**
- 시작 전 `git fetch` 확인: `origin/main` head = `7f1d906` = 로컬 HEAD(일치). 작업 트리는 untracked 파일(관련 없음, 건드리지 않음) 외 깨끗했음.
- 마이그레이션·`package.json`·락 파일 변경 없음(아래 6번 확인).
- Gemini API 호출 없음(`vision:eval` 미실행), 운영 DB 접속 없음, 실제 업무 데이터는 저장소에 넣지 않음(테스트는 전부 합성 숫자/임의 코드).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/sales-orders/utils/vision-guardrails.util.ts` | `groupBomItemsForYocheok`, `checkYocheokMismatchBundle` 추가(기존 `checkYocheokMismatch`는 그대로 — 단일 행 전용) |
| `src/sales-orders/vision.service.ts` | `applyGuardrails`가 자재명 분리 후 색상 묶음을 만들어 묶음이면 번들 검사, 단일이면 기존 검사를 쓰도록 재구성. `applyTargetRddValidation`에 `targetRddAdjustBasis` 전달 추가 |
| `src/sales-orders/utils/target-rdd-year-rollover.util.ts` | 기준을 "항상 오늘"에서 "작성일(신뢰 가능하면)·아니면 오늘"로 변경, `basis` 필드 추가 |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `targetRddAdjustBasis` DTO 필드 추가 |
| `src/sales-orders/utils/vision-guardrails.util.spec.ts`, `target-rdd-year-rollover.util.spec.ts`, `vision.service.spec.ts` | 새 함수 테스트 + 기존 테스트 중 동작이 바뀐 것 갱신(아래 "단순화하거나 못 한 것" 참고) |
| `frontend-app/src/utils/salesOrderBomReview.ts`(+test) | `groupBomItemsForYocheok`, `hasRequiredQtyBundleMismatch` 추가, `computeBomRowBadges`가 묶음 인식 |
| `frontend-app/src/utils/visionGuardrails.ts`(+test) | `getSaveGateInfo` 추가(저장 비활성 이유 계산) |
| `frontend-app/src/api/salesOrders.service.ts` | `targetRddAdjustBasis` 타입 추가 |
| `frontend-app/src/utils/salesOrderOverviewEdit.ts` | 납기 직접 수정 시 `targetRddAdjustBasis`도 함께 지움 |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 납기 보정 문구를 기준별로 변경, 스타일번호 대조 체크박스/안내문을 저장 버튼 옆으로 이동 |

## 테스트 숫자(전/후)

| | 전(PR-200c 완료 시점) | 후 |
|---|---|---|
| 백엔드 단위(jest) | 977 | **994**(+17) |
| e2e | 555 | **555**(동일) |
| 프런트(vitest) | 473 | **485**(+12) |

전부 실패 0. `npm run build`(백엔드), `tsc -b && vite build`(프런트) 전부 성공.

`git diff origin/main --stat -- src/migrations package.json package-lock.json frontend-app/package.json frontend-app/package-lock.json` — **출력 없음(변경 0건)**.

---

## 1~3. "현재 동작" 5줄 요약

1. **요척 경고/제안**: `checkYocheokMismatch`(백엔드)는 **행 하나**의 요척×총수량을 그 행의 출고량과만 비교해 틀리면 `impliedConsumption = requiredQty÷총수량`을 제안으로 준다 — 색상별로 나뉜 행은 서로의 존재를 몰라 각자 틀린 것으로 보이고, 제안값도 "그 색상의 출고량만으로 역산한" 틀린 요척이 된다. 프런트 `hasRequiredQtyMismatch`(뱃지, 버튼 없음)도 같은 방식으로 행 하나씩 본다. "요척 N로" 버튼은 `yocheokMismatch.suggestions`(서버 값)를 그대로 매핑해 그려진다(`SalesOrderUploadModal.tsx` 907-914행 부근).
2. **납기 연도 보정**: `rolloverTargetRddYear`가 "오늘(한국시간)보다 이른가"만 보고 +1년을 시도했다 — 작성일이 과거인 정상 문서도 오늘 기준으로는 항상 "이르다"고 판정돼 틀리게 보정됐다.
3. **저장 비활성**: `disabled` 계산과 안내 문구가 전부 버튼의 `title`(툴팁)에만 있어 마우스를 올려야 보였고, 체크박스는 "Style No." 입력칸 아래(화면 다른 위치)에 있어 무엇을 눌러야 하는지 바로 보이지 않았다.

## 1. 출고량 검산을 "색상 행 묶음 합" 기준으로

**묶음 정의(구현)**: 구분+자재명(공백 제거·대문자 통일)+요척이 같은 행(규격은 키에 안 넣음) — `groupBomItemsForYocheok`(백엔드 `vision-guardrails.util.ts`, 프런트 `salesOrderBomReview.ts`에 동일 로직).

**판정(`checkYocheokMismatchBundle`)**: 묶음 안에 `requiredQty`가 하나라도 null이면 비교 안 함(경고 없음). 합 vs 요척×총수량의 허용 차이는 **±1×묶음 행 수**(또는 상대오차 1%). 벗어나면: 합÷총수량이 1±1%면 "출고량이 미터가 아니라 수량(벌)으로 읽혔을 수 있습니다" 문구, 아니면 "같은 자재 N개 색상 행의 출고량 합 {합} 이(가) 요척×수량={기대값}와 다릅니다 — 색상별 출고량 또는 요척·수량을 확인해 주세요" 문구. **묶음(2행 이상)에는 `suggestions`를 절대 만들지 않음** — "요척 N로" 버튼은 다색 묶음에서 안 뜬다(백엔드가 애초에 안 만들므로 프런트가 추가로 막을 필요도 없음). 단일 행(묶음 크기 1)은 기존 `checkYocheokMismatch`를 그대로 호출 — 동작 변경 없음.

테스트 9건(①~⑨, 익명 합성 숫자) 전부 백엔드(`vision-guardrails.util.spec.ts`)·프런트(`salesOrderBomReview.test.ts`) 양쪽에 같은 표로 추가(⑤는 `computeBomRowBadges` 쪽 단일 행 불변 테스트로 대체 — 백엔드 ⑤는 기존 `checkYocheokMismatch` 테스트가 이미 커버).

## 2. 납기 연도 보정 기준을 작성일로

**새 규칙**: 작성일이 있고 `checkDocumentDateSuspicious`(미래/18개월초과과거)에 걸리지 않으면 **작성일**을 기준으로, 아니면(없거나 의심스러우면) **오늘**을 기준으로 쓴다. 기준보다 같거나 미래면 보정하지 않는다. 납기==작성일 예외(PR-158 패턴)는 그대로 유지. 월·일 오독은 다루지 않음(지시대로).

**중요 — 기존 회귀 테스트 하나의 기대값을 바꿨다**: PR-190의 실사례 테스트(MB74BLM107, 작성일 2026-01-01/납기 2026-02-17)는 "오늘 기준으로 지난 날짜라 2027로 보정돼야 한다"고 기대했는데, 이 케이스는 **정확히 PR-201 배경(작성일이 과거인 문서의 납기는 오늘보다 과거일 수 있음)에 해당** — 작성일(2026-01-01)이 의심스럽지 않고 납기(02-17)가 작성일보다 뒤라 더 이상 보정하지 않는 것이 맞다. `vision.service.spec.ts`/`target-rdd-year-rollover.util.spec.ts` 둘 다 새 기대값으로 고치고, 왜 바뀌었는지 주석으로 남겼다.

테스트: 작성일 과거+납기 작성일 이후·오늘 이전(보정없음) / 작성일 있고 납기가 작성일보다 이름(+1년, basis=DOCUMENT_DATE) / 작성일 의심스러움(basis=TODAY) / 작성일 없음(기존, basis=TODAY) / 경계(납기=작성일) — 전부 추가.

## 3. 저장 비활성 이유를 눈에 보이게

`getSaveGateInfo(overview, verified)`(프런트 `visionGuardrails.ts`, 순수 함수) — 끝 글자 숫자 차단이 우선, 아니면 미대조면 비활성+안내문, 둘 다 아니면 활성+안내문 없음. `SalesOrderUploadModal.tsx`에서:
- 체크박스(또는 대조 완료 시 "✓ 스타일번호 대조 완료" 작은 표시)를 저장 버튼과 같은 줄(버튼 바로 왼쪽)로 옮김.
- 비활성 이유 문장을 버튼 아래 한 줄로 항상 노출(`save-disabled-reason-{index}`), 저장됐으면 숨김.
- 기존 "Style No." 입력칸 아래의 체크박스는 제거(같은 상태를 두 군데서 따로 체크하면 혼란스러워 하나로 합침) — PR-200c의 대조 규칙 자체(직접 수정 시 자동 체크, 일괄 저장 시 미대조 제외)는 손대지 않았다.

**사람이 화면에서 확인할 것**(jsdom/testing-library 없음, 클릭 동작 재현 불가):
1. 다색 겉감 업로드에서 두 색상 행의 출고량 경고가 사라지고, "요척 N로" 버튼이 다색 묶음에는 나타나지 않는다.
2. 단일 행에서 출고량이 틀린 경우의 경고와 제안은 그대로 나온다.
3. 작성일이 과거인 작지에서 납기가 작성일 이후이면 연도가 올라가지 않는다.
4. 저장 버튼 옆에 비활성 이유와 체크 위치가 항상 보인다(체크 후 별도 "확인" 단계 없이 즉시 활성화됨).

---

## 4. 조사 결과

### (a) 테이프 포장단위 드롭다운("다데 (50M/롤)" 등)

`SalesOrderUploadModal.tsx` 880-884행의 `<option>` 목록은 **하드코딩된 JSX 문자열**이다(`다데 (50M/롤)`, `암홀 (50M/롤)` 등 — DB를 호출하지 않음). 실제 단위 값은 DB 테이블 `material_packaging_unit_rules`에 있고(`src/migrations/1791100000000-AddMaterialPackagingUnitRulesAndTapeType.ts`), 시드값이 `DADE: unitLengthM=50, packagingUnitLabel='롤'` / `AMHOL: unitLengthM=50, packagingUnitLabel='롤'` — **main의 DB 값과 프런트 하드코딩 값이 현재는 일치**하지만, 이 테이블을 관리하는 API(`frontend-app/src/api/materialPackagingUnitRules.service.ts`의 `getMaterialPackagingUnitRules`)가 따로 있어 **DB 값이 바뀌어도 이 드롭다운은 갱신되지 않는 구조**다(두 소스가 분리돼 있음 — 수정은 이번 범위 밖, 사실만 보고).

`feat/mido-price-table-admin`(PR-188) 커밋(`a0fee26`)을 `git show`로 확인한 결과 `material_packaging_unit_rules`의 값이나 다데/암홀 단위를 바꾸는 변경은 **없음**(미도 단가표 관리 화면·빈폴/에잇세컨즈 겉감 단위(M) 관련 다른 테이블 추가일 뿐). **PR-189("테이프 단위", 마이그레이션 `1792000000000`)와 PR-195는 `git log --all`(전체 브랜치) 어디에도 존재하지 않는다** — 커밋도, 그 번호의 마이그레이션 파일도 이 저장소 역사 전체에서 찾지 못했다(모든 브랜치의 `src/migrations/` 파일명을 대조해도 `1792000000000`은 없음, 가장 가까운 건 main의 `1791900000000`과 다음 PR의 `1792xxxxxxxxx`대 번호가 비어 있음). 추측하지 않고 "존재하지 않음"으로 보고한다.

### (b) CMT단가 "수기 초안 — 계약 승인 시 확정 필요"

값(예: 4600)의 출처는 **AI 응답의 `overview.handwrittenCmtPriceCandidate` 필드**다. `vision.service.ts`의 `PROMPT`가 "미도 바이어로 명확히 인식된 문서에서만, 문서 상단에 **손으로 적힌** 비교적 큰 글씨 숫자"만 추출하도록 지시하고(146행), `applyMidoCmtPriceGuard`(408-416행)가 바이어가 미도가 아니면 이 필드를 서버에서 강제로 null로 덮어쓴다. 화면에서는 `prefillHandwrittenCmtDraft`(`salesOrderOverviewEdit.ts` 79-92행)가 `cmtPrice`가 아직 비어 있을 때만 이 candidate 값을 `cmtPrice` 입력칸에 그대로 복사해 넣고, `cmtPriceNote`에는 손글씨 원문(`handwrittenCmtPriceMemo`)을 넣는다. 배지는 `SalesOrderUploadModal.tsx` 731-734행에서 `handwrittenCmtPriceCandidate != null`일 때만 뜬다. **AI가 작지에 안 적힌 단가를 마스터·거래처 기본값·이전 발주에서 가져와 채우는 경로는 없음**(코드 확인 — 전부 이 한 필드, 이 한 경로뿐).

### (c) 포장내역 표준양식 검증

`src/purchase-orders/utils/packing-receipt-template.util.ts`의 `readFirstSheetRows`(157-168행)가 판정한다: 업로드된 xlsx의 각 시트를 순회해 **A1 셀 값이 정확히 `"ASO-SCM 포장내역 표준양식 v1"`(시그니처 문자열, `PACKING_RECEIPT_TEMPLATE_SIGNATURE`)과 일치하는 시트가 하나도 없으면** 그 에러를 던진다(느슨한 정규화 없음, 정확 일치만). 표준양식 구조: 시트명 "원단포장내역"/"부자재포장내역", 1행=시그니처, 2행="자재구분: ...", 그 다음 PO No./스타일번호 등 컨텍스트 행들(이 중 PO No.·스타일번호는 실제 발주와도 대조해 다르면 저장 거부, `parsePackingReceiptTemplate` 220-233행), 헤더행(원단: No./Roll No./Color/Width(cm)/Width(inch)/Gross Weight(kg)/Net Weight(kg)/Thickness/Length(YD)/Remark — 부자재는 Carton No./Lot No./Qty/Item Name/Weight(kg) 등), 예시행("예시 행 — 실제 값으로 교체" 마커), 빈 데이터 행 30개, 요약행("CBM"/포장수/포장형태). 기존 느슨한 매칭 파서(BEANPOLE_TTL형 등)는 **별도 파일 `src/purchase-orders/utils/packing-receipt-excel-parser.util.ts`**에 있다(이 표준양식 파서와는 독립).

---

## 5. 오프라인 재생(API 호출 0, `vision-eval-out/2026-10-21T14-31-54-319Z/details.jsonl`만 사용)

구분 `겉감`·`requiredQty` 있는 **63행**(분모)에 새 `checkYocheokMismatchBundle`을 그대로 적용:

1. 기존 규칙(행 단위, `checkYocheokMismatch`) 경고: **34/63행**
2. 새 규칙 — 다색 묶음(2행 이상) **9개**, 단일 행(묶음 크기 1) **36개**(합 45건 — 나머지 18행은 같은 묶음의 다른 행이 묶음 전체로 계산됨; 분모 63=9개 묶음의 행 수 합+36)
3. 새 규칙에서 경고가 붙는 행 수(합계): **27행**

**새 규칙에서도 "일반 불일치" 문구로 남는 묶음 전부**(쪽/회차/자재명/요척/총수량/합/기대값/합÷총수량):
1. 6Y.pdf p4 run1 ["24SIA-001","24SIA-001"] 요척0.8 총수량611 합1024.2 기대488.8 합÷총수량=1.676
2. 6Y.pdf p4 run3 ["24SIA-001","24SIA-001"] 요척0.8 총수량611 합884.2 기대488.8 합÷총수량=1.447
3. 72-2(3).pdf p3 run1 ["컬리어 텐셀","컬리어 텐셀"] 요척1.35 총수량1838 합1680 기대2481.3 합÷총수량=0.914
4. 72-2(3).pdf p3 run2 ["퀄리아 텐셀","퀄리아 텐셀"] 요척1.35 총수량1838 합1680 기대2481.3 합÷총수량=0.914
5. 72-2(3).pdf p3 run3 ["캘리아 텐셀","캘리아 텐셀"] 요척1.35 총수량1838 합1244 기대2481.3 합÷총수량=0.677

**"벌 수 의심" 문구가 붙는 묶음 전부**:
1. 72-2(3).pdf p2 run3 ["2504","2504","2504"] 총수량1797 합1797

(이 결과로 "묶음 규칙이 맞다/틀리다"는 판단은 하지 않습니다 — 목록과 개수만 보고합니다.)

---

## 단순화하거나 못 한 것

- PR-190의 역사적 회귀 테스트 하나(MB74BLM107)의 기대값을 바꿨다 — 의도적 변경이며(위 2번 설명 참고) 되돌리는 게 아니라 PR-201의 새 규칙이 정확히 그 케이스를 겨냥한 수정이기 때문. 되돌릴 필요가 있으면 알려달라.
- `checkYocheokMismatchBundle`의 "벌 수 의심" 문구는 단일 행(묶음 크기 1)에는 적용하지 않았다 — 지시서가 "단일 행 동작은 바꾸지 않는다"를 명시해 기존 `checkYocheokMismatch`를 그대로 뒀다(이 경우 단일 행에 같은 검사를 추가하면 기존 동작이 바뀜).
- (a) 조사에서 발견한 "DB 테이블과 프런트 하드코딩 드롭다운이 분리돼 있다"는 구조적 문제는 이번 PR에서 고치지 않았다(조사만 지시됨).
- `--max-pages` 인자가 파싱만 되고 쓰이지 않는 것(PILOT-7d/7e에서 이미 확인됨)은 이번 PR과 무관해 손대지 않았다.
