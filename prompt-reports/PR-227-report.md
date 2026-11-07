# PR-227 — 자재·BOM 조회 표: "소요수량 0" 원인 규명 + 단위 열/단위 수정 + 0 대신 이유 표시

브랜치: `fix/bom-lookup-qty-unit-edit` (origin/main `f925d27` 기준으로 fast-forward 후 작업)
병합: 하지 않음(지시대로 push만)

## 1. "소요수량 0" 원인 규명

### 1-1. "소요수량"은 어디서 오는가

| 항목 | 내용 |
|---|---|
| 화면에 보이는 값 | `ItemsManager.tsx`의 BOM 표 "소요수량" 칸 = `it.requiredQty` (API 필드명 그대로) |
| API | `GET /boms?styleNo=` → `boms.service.ts`의 `findActiveByStyleNo` → `BomItem.requiredQty` 컬럼을 그대로 직렬화(select 제한 없음) |
| 저장 시점 | BOM 저장(매핑 커밋) 시 `mapping-commit.service.ts`가 **1회성 스냅샷**으로 채움 — 이후 재계산되지 않음(요척 인라인 수정 시에만 예외적으로 재계산, 1-3절 참고) |
| 실시간 계산(진짜 소요량) | `work-orders` 쪽 `calculateMaterialRequirements`(`material-requirements.util.ts`)가 **매번** `consumption × targetQuantity`로 PR-220/226 우선순위(작지값→색상별 수량→계산값→unknown)를 적용해 다시 계산 — **`BomItem.requiredQty`를 읽지 않는다** |

**핵심 결론: "소요수량" 칸은 PR-220/226의 실시간 계산 규칙과 무관한, 저장 시점 스냅샷이다.** 이는 `boms.service.ts`의 `updateItem()` 메서드에 이미 있는 주석으로 확인됨:

```
// src/boms/boms.service.ts (updateItem, 기존 주석)
// 실제 소요량 계산(work-orders 쪽 calculateMaterialRequirements)은
// BomItem.requiredQty가 아니라 매번 consumption × targetQuantity로 다시 계산한다.
```

즉, PR-226이 고친 "계산값 우선/LOT 합산/총수량 오독 방어" 규칙은 **표(소요수량 칸)에는 적용되지 않는다** — 적용되는 곳은 작업지시서(work-orders)·부족분 계산 화면이다.

### 1-2. 0이 되는 조건 분류 (화면 증상 매핑)

| # | 조건 | 원인 | 화면 증상 매핑 |
|---|---|---|---|
| ① | 요척(consumption) 자체가 0 | 작지/엑셀에서 요척을 읽지 못했거나 실제로 0 | 해당 없음(사용자가 보고한 사례들은 요척 130/220/10 등 0이 아님) |
| ② | 스타일 총수량이 매핑 커밋 시점에 비어 있었음 | `mapping-commit.service.ts`의 excel-origin 분기: `hasTotalQty ? consumption×totalQty : (기존 requiredQty ?? 0)` — 커밋 당시 총수량이 없으면 0으로 저장 | **색상 N/A 일반자재 행, 실·테이프류 행이 0인 가장 흔한 원인** — 작지에는 출고량이 찍혀 있어도(단위소요량=요척 130/220/10) 그 값은 "요척" 칸으로 들어갔을 뿐, 총수량이 없어 소요수량(요척×총수량) 계산을 못 한 것 |
| ③ | AI 인식(작지) 경로에서 "출고량" 자체가 비어 있음 | `item.requiredQty ?? 0`을 그대로 저장(새 BomItem 생성 분기) — 작지에 출고량 숫자가 인쇄돼 있지 않거나 AI가 못 읽음 | 겉감(BE)처럼 "출고량"이 명시적으로 인쇄된 행은 318로 정상 표시, 부자재(실/테이프 등)처럼 출고량 칸이 비어 있던 행은 0 |
| ④ | 단위(EA) vs 포장단위 환산 기준(M) 불일치 | **이 조건은 "0"의 원인이 아니라 별개의 경고**다 — `formatBomItemQty`(PR-218, `materialRequirementDisplay.ts`)가 `itemUnit !== 'M'`일 때 `UNIT_MISMATCH` 경고를 내지만, 이때도 저장된 숫자 그대로 보여준다(환산을 안 할 뿐, 0으로 바꾸지 않음). 사용자가 본 "⚠ 단위 확인 필요"와 "0"이 **같은 행에 동시에** 나타난 건, 그 행이 ②/③으로 이미 0으로 저장돼 있었기 때문 — 단위 불일치 자체가 0을 만든 게 아니다 |
| ⑤ | PR-220/226 우선순위 규칙 미적용 | 해당 없음 — 1-1절에서 확인했듯 이 칸은 그 규칙을 아예 보지 않는다(별도 계산 경로) |

**정리**: 사용자가 겪은 증상(N/A 일반자재·실·테이프 행 0, 겉감 BE 318, 단위소요량 130/220/10인데 소요수량 0)은 모두 **②(총수량 없이 커밋됨)** 또는 **③(작지 출고량 미기재)** 로 설명되며, 단위소요량(요척)이 130/220/10처럼 큰 값인 것은 "요척"(제품 1개당 소요량)이 아니라 **작지에 인쇄된 총 사용량(출고량) 원본 숫자가 그대로 요척 칸에 들어간 것**으로 보인다 — 이는 `vision.service.ts`의 프롬프트("consumption은 요척 또는 소요량(숫자만, 단위 제외)")가 "요척"과 "총 소요량(출고량)"을 구분하지 않고 둘 다 받아들이게 돼 있어서다.

### 1-3. "수정" 모드가 저장하는 필드 / 단위는 어디 있는가

- 기존 "수정" 버튼은 `editBomItemForm`을 통해 카테고리/색상/규격/요척(consumption)/혼용율/HS코드/실종류만 `PATCH /boms/items/:id`(`updateBomItem`)로 저장 — **단위를 바꿀 방법이 없었다.**
- 단위는 `BomItem`이 아니라 **자재(Item) 마스터의 `Item.unit`** 컬럼에 있다 — `PATCH /items/:id`(`updateItem`)로만 바꿀 수 있다. `Item.unit`은 백엔드에 enum/검증이 없는 순수 문자열(`CreateItemDto`/`item.entity.ts` 확인) — 화면의 선택목록은 UX 편의일 뿐 백엔드 강제 규칙은 아니다.
- `boms.service.ts`의 `updateItem()`(BomItem 쪽, 이름이 같아 혼동 주의)은 `consumption`이 바뀌면 `Math.round(consumption × totalQty × 10000)/10000`으로 `requiredQty`를 재계산해 저장한다(**현재 스타일의 totalQty 기준 — PR-220/226의 색상별 수량 우선순위는 반영 안 됨**, 별도 미해결 이슈로 기록).
- "이 자재를 쓰는 다른 스타일이 몇 건인지" 조회하는 기존 API는 없음(코드 검색 확인) — 새 API를 만들지 않고, 확인창에 건수를 넣지 않았다(지시대로).

### 1-4. 결론 (3줄)

① **0의 압도적 원인**: 매핑 커밋 시점에 스타일 총수량이 없었거나(총수량 미입력 상태로 선커밋) 작지에 그 자재의 출고량이 인쇄돼 있지 않아 스냅샷이 0으로 저장된 것.
② **서버 계산 버그 아님**: `calculateMaterialRequirements`(실제 소요량 계산)는 이 0과 무관하게 매번 정상적으로 다시 계산한다 — "소요수량" 칸이 그 계산을 반영하지 않는 **별개의 스냅샷 필드**라는 화면-데이터 구조 문제다. (→ 지시에 따라 백엔드는 고치지 않음, 고칠 필요도 없음)
③ **프론트에서 안전하게 고칠 수 있는 것**: ⓐ 0일 때 이유를 보여주기(스냅샷 특성 설명), ⓑ 참고용으로 PR-226 규칙으로 지금 다시 계산하면 얼마가 나오는지 "계산 근거" 보조 표시, ⓒ 단위 열/단위 수정 추가 — 모두 이번 PR에 구현함.

## 2. 구현 내용

| 항목 | 내용 |
|---|---|
| 단위 열 | BOM 표에 "단위"(품목 마스터 `Item.unit`) 열 추가. 값이 비어 있으면 `-`. |
| 단위 수정 | "수정" 모드에 단위 입력칸 추가(`<input list>` + `<datalist>`로 EA/M/Y/YD/KG/ROLL/CONE 제안, 직접 입력도 가능 — 백엔드가 이미 받는 값 이외의 새 검증은 추가하지 않음). 저장은 기존 `PATCH /items/:id`(`updateItem`) 그대로 사용 — 새 API 없음. |
| 저장 전 확인 | 단위가 실제로 바뀌었을 때만(`isUnitChanged`) `window.confirm`으로 "단위는 자재(품목) 마스터 값입니다. 이 자재를 쓰는 모든 스타일에 적용됩니다. 계속할까요?" 표시. 건수는 넣지 않음(조회 API 없음, 지시대로). |
| 저장 후 재계산 | 단위 저장 성공 후 기존 `getBomByStyleNo` 재조회(이미 저장 흐름에 있던 호출)가 `material.unit`을 다시 읽어와 포장단위 환산 경고("단위 확인 필요")·N롤/N콘 표시가 자동 갱신됨 — PR-219의 캐시 갱신과 같은 패턴. |
| 소요수량은 그대로 비수정 | 계산값이므로 입력칸을 만들지 않음. 대신 칸 아래 작은 글씨로 "계산 근거(참고): …" 표시 — PR-226과 같은 규칙(`resolveAppliedQuantity`, 기존 함수 재사용, 새로 만들지 않음)으로 지금 다시 계산하면 어떤 공식/값이 나오는지 참고만 보여주며, 저장된 값/계산 로직은 바꾸지 않는다고 명확히 구분. |
| 0 → 이유 표시 | "소요수량" 0일 때 `resolveZeroQtyReason`/`describeZeroQtyReason`(새 파일 `bomQtyReason.ts`)로 ① 진짜 0(요척 자체 0, 문구 없음) ② `missing-total-qty`(스타일 총수량 미입력 — "스타일 관리에서 총수량 입력" 안내) ③ `stale-snapshot`(총수량은 있는데 0 — "요척을 다시 저장해 갱신" 안내)으로 구분해 `title` 속성에 상세 안내. |

### 변경 파일

- `frontend-app/src/utils/bomQtyReason.ts` (신규) — 0-이유 분류·안내문구, 단위변경 확인문구/판정 순수함수.
- `frontend-app/src/utils/bomQtyReason.test.ts` (신규) — 위 로직 단위테스트.
- `frontend-app/src/api/boms.service.ts` — `BomItemRow`에 `sheetQty`/`sheetQtyUnit` 타입 추가(서버는 이미 내려주고 있었음, 백엔드 변경 없음).
- `frontend-app/src/components/ItemsManager.tsx` — 단위 열/입력, 선택 스타일의 총수량·색상별 수량표 조회(기존 API 재사용), 소요수량 칸 이유·계산근거 표시, 단위 변경 확인 후 `PATCH /items/:id` 호출.
- `prompt-reports/PR-227-report.md` (본 문서, 신규)

## 3. "수동으로 소요수량 덮어쓰기" 기능 — 설계 제안만(미구현)

이번 PR에서는 구현하지 않음(PR-226이 계산 우선순위를 바꾸는 중이라 충돌 위험). 제안:

1. `BomItem`에 `requiredQtyOverride?: number | null` 컬럼 추가(별도 PR, 백엔드 변경 필요).
2. 값이 있으면 화면·`calculateMaterialRequirements` 양쪽 모두 이 값을 최우선으로 사용하고, 그 사실을 "수동 지정값"으로 명시 표시.
3. 지정/해제 모두 변경 전/후 확인창(PR-197 패턴과 동일) + 누가 언제 지정했는지 로그.
4. PR-226의 계산 우선순위(작지→색상별→계산값) 작업이 main에 완전히 안정된 뒤 별도 PR로 진행 권장.

## 4. 테스트

| 구분 | 내용 |
|---|---|
| 신규 단위테스트 | `bomQtyReason.test.ts`: 0-이유 3분류(genuine-zero/missing-total-qty/stale-snapshot) 및 진짜 0 구분, 안내문구 title 포함 여부, 단위변경 감지(`isUnitChanged`, 공백 트림 포함)와 확인문구 내용(`UNIT_CHANGE_CONFIRM_TEXT`) — 총 9개 |
| 기존 테스트 | `ItemsManagerLabels.test.tsx` 등 기존 테스트 무수정, 그대로 통과 |
| 테스트 하네스 한계 | 이 저장소의 React 화면 테스트는 jsdom/testing-library 없이 `renderToStaticMarkup` 정적 렌더만 가능하고(PR-221~226과 동일 사유), BOM 표는 `bom` state가 실제 API 응답으로 채워져야 렌더되므로 단위 열/소요수량 칸의 상호작용(수정 모드 진입, 저장, 확인창)은 이 하네스로 직접 검증할 수 없음 — 그래서 핵심 판단 로직(이유 분류, 변경 감지, 문구)을 순수함수로 분리해 단위테스트로 검증했음(이 레포의 기존 패턴, 예: `appliedQuantity.ts`, `warningChips.ts`) |

### 테스트 수 (전/후)

| | Before (MERGE-30 기준) | After (이번 PR) |
|---|---|---|
| 프론트엔드(vitest) | 601 이상(하한) | **628 통과** (72 파일) |
| 백엔드(jest) | 1185 (MERGE-30 반영 후 실제 하한) | **1185 통과** (76 스위트) — 백엔드 변경 없음, 1회 실행 확인 |
| e2e | 569 이상(하한) | **생략** — 백엔드/DB 변경이 전혀 없어(순수 프론트 변경) 스킵. 생략 이유: 이번 PR은 `frontend-app/`만 수정하고 API 계약·엔티티·마이그레이션을 건드리지 않았으므로 e2e 회귀 위험이 없음. |

`tsc -b`, `npm run build` 모두 에러 없이 통과.

## 5. git diff 범위 확인

```
frontend-app/src/api/boms.service.ts         |   5 ++
frontend-app/src/components/ItemsManager.tsx | 105 +++++++++++++++++++++++++--
2 files changed, 104 insertions(+), 6 deletions(-)
```
(+ 신규 파일 `frontend-app/src/utils/bomQtyReason.ts`, `bomQtyReason.test.ts`, `prompt-reports/PR-227-report.md`)

`src/migrations/`, `package.json`, lockfile 변경 없음. 모든 변경이 `frontend-app/`과 `prompt-reports/`에 한정됨.

## 6. 사람이 화면에서 확인할 것

1. 자재·BOM 조회 화면에서 스타일 조회 후 BOM 표에 "단위" 열이 보이는지(품목에 단위가 없으면 `-`).
2. "수정" 클릭 → 단위 입력칸이 보이고 값을 바꿔 "저장" 클릭 시 확인창("단위는 자재(품목) 마스터 값입니다…")이 뜨는지, 확인 후 저장되면 해당 자재가 쓰인 다른 행의 단위도 바뀌고 "⚠ 단위 확인 필요" 경고가 새 단위 기준으로 다시 계산되는지(예: EA→M으로 바꾸면 경고가 사라지는지).
3. 소요수량이 0인 행에 숫자 0 대신 이유 문구("스타일 총수량 미입력" 또는 "저장된 값 0(다시 저장 필요)")가 보이고, 마우스를 올리면(title) 구체적인 해결 방법이 나오는지.
4. 소요수량 칸 아래 "계산 근거(참고): …" 작은 글씨가 보이는지(저장된 값과 다를 수 있음을 이해하고 참고용으로만 보는지).
5. (원인 규명 결과 확인용) 소요수량이 0이던 스타일에 총수량을 입력한 뒤 해당 행을 "수정 → 저장"(요척 재입력)하면 ②(missing-total-qty)로 분류됐던 일반자재 행의 소요수량이 채워지는지 — 이것이 1절에서 규명한 가장 흔한 원인(②)이 맞는지 실제 데이터로 재확인.
