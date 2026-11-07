# PR-230 — 발주 입력 칸의 "스타일 연결"을 기본 "연결"로 (프런트 중심, 병합은 하지 않음)

브랜치: `feat/po-style-link-default` (origin/main에서 분기). **병합하지 않음 — push만.**

## 1. 현황 파악

### 1-1. 코드 읽기 결과

| 대상 | 현재 상태 |
|---|---|
| `PurchaseOrdersManager.tsx`의 "스타일 연결" | 상태 변수는 `styleSearch`(스타일 자체가 "연결"의 실체 — 별도의 on/off 플래그가 아니다). `null`이면 미연결, 값이 있으면 그 스타일의 BOM 자재만 고를 수 있는 "연결 트랙". 필드에 `allowClear`가 이미 있어 X 아이콘으로 지울 수 있었다(발견 — 사실상 "연결 해제"가 이미 존재했지만 눈에 띄지 않았다). placeholder는 "스타일 미연결(기본)". |
| `StyleShortagePanel.tsx`(=[A]) "이 자재로 발주하기" | `onPick={(row) => onPickMaterial(row, style!.styleNo)}` → `PurchaseOrdersManager.handlePickMaterial(row, styleNo)`가 **이미 `setStyleSearch({ styleNo })`를 호출해 자동 연결하고 있었다**(PR-185부터). 스타일명은 넘기지 않아 번호만 쓸 수 있었다. |
| 발주 생성 요청 | `createPurchaseOrder`의 `styleNo: styleSearch?.styleNo \|\| undefined` — `styleSearch`만 보고 있어 연결/미연결이 그대로 요청에 실린다. |
| 단가 필수 판단(`getMaterialProductionContext`) | `selectItem(picked, opts?.styleNo)`가 이미 `opts.styleNo`를 받아 서버에 넘기는 구조. `selectStyleMaterial`/`handlePickMaterial`은 styleNo를 넘기지만, **품목만 넘어오는 진입(`prefillItemId`)은 styleNo를 넘기지 않았다**. |
| `ItemsManager.tsx`(자재·BOM 조회)의 "발주하기" | `onOrderItem?.(itemId)` — **styleNo를 전혀 넘기지 않음**. 이 화면은 항상 `selectedStyleNo`로 BOM을 보는 중인데도 발주 화면에 스타일 컨텍스트가 전달되지 않아, 넘어가면 "스타일 미연결"로 시작했다. **이번 PR의 실제 공백(gap)은 여기였다.** |

### 1-2. 진입 경로별 현재(수정 전) 동작 → 수정 후

| 진입 경로 | 수정 전 | 수정 후 |
|---|---|---|
| ① [A]에서 스타일 선택 → "이 자재로 발주하기" | **이미 자동 연결됨**(PR-185) — 다만 번호만 보이고 "연결됨" 표시·해제 버튼은 없었음 | 자동 연결 유지 + "연결됨: 번호 (스타일명)" 라벨 + "연결 해제" 버튼 추가 |
| ② [A] 스타일 미선택 상태(직접 [B] 품목 입력) | 미연결(기본) | 동일(미연결) — placeholder만 "연결 가능함"을 알리는 문구로 변경 |
| ③ [B]에서 직접 입력 | 미연결, "스타일 미연결(기본)" | 동일(미연결) — placeholder "스타일 미연결 (스타일을 선택하면 연결됩니다)" |
| ④ 발주 목록 "수정하기" | 별도 모달(`PurchaseOrderEditModal`) — 범위 밖, 변경 없음 | 변경 없음 |
| ⑤ 자재·BOM 조회(`ItemsManager.tsx`)의 "발주하기" | **스타일 미전달 → 미연결로 시작**(공백) | `onOrderItem(itemId, selectedStyleNo)` → [B]가 그 스타일로 자동 연결 |

## 2. 구현

- `frontend-app/src/utils/purchaseOrderForm.ts`: 순수 함수 `resolveStyleLinkDisplay({ styleNo, styleName, explicitlyCleared })` 추가 — 연결됨 라벨/placeholder/해제 안내 문구를 한 곳에서 계산(테스트됨). "저장된 값 0(다시 저장 필요)" 같은 되돌아가는 요구(다시 저장/재입력)를 요구하지 않는다 — 그냥 다시 연결하거나 미연결로 둘 수 있다고만 안내.
- `frontend-app/src/components/PurchaseOrdersManager.tsx`:
  - `styleLinkExplicitlyCleared` state 추가 — 사용자가 "연결 해제"(또는 필드 X)를 눌렀을 때만 true. 스타일을 다시 고르면(자동/수동 모두) false로 리셋.
  - 필드 옆에 연결 상태일 때 "연결됨: 번호 (스타일명)" + "연결 해제" 버튼, 해제 상태(명시적)일 때 "스타일 미연결 — 스타일별 집계에 포함되지 않습니다" 안내를 렌더.
  - `handlePickMaterial(row, styleNo, styleName?)` — styleName도 받아 `setStyleSearch({ styleNo, overview: { styleName } })`로 라벨에 쓴다. 매번 누르는 명시적 클릭이므로 이전 해제 상태를 덮어쓰고 재연결한다(요구사항: "[A] 선택 변경"이 아니라 "이 자재로 발주하기" 클릭 자체는 항상 새로 연결하는 사용자 행동).
  - 새 prop `prefillItemStyleNo` 추가, `prefillItemId` 소비 useEffect에서 함께 읽어 `setStyleSearch`+`selectItem(picked, { styleNo })`로 넘긴다 — 기존 `prefillStyleNo`(발주 목록까지 그 스타일로 필터링하는 별도 진입, `ProcurementStatusReport`용)와는 분리해 목록 필터는 건드리지 않는다.
- `frontend-app/src/components/StyleShortagePanel.tsx`: `onPickMaterial` 시그니처에 `styleName?: string | null` 추가, `style!.overview?.styleName`을 넘긴다.
- `frontend-app/src/components/ItemsManager.tsx`: `onOrderItem?: (itemId: number, styleNo?: string) => void`로 확장, 호출부에서 `selectedStyleNo`(이 화면이 보는 중인 스타일)를 같이 넘긴다.
- `frontend-app/src/App.tsx`: `poPrefillItemStyleNo` state 추가, `handleOrderItem(itemId, styleNo)`가 같이 저장하고 `PurchaseOrdersManager`에 `prefillItemStyleNo`로 전달, `onPrefillConsumed`에서 함께 초기화.
- **스타일 연결/해제 후 단가 필수 판단·종류 추천·단가표 참고 재계산**: 코드 확인 결과 **이미 올바르게 동작**(변경 없음) — 스타일 필드의 `onChange`/해제 버튼이 `setItem(null)`도 함께 호출해 품목 선택을 초기화하므로, 사용자가 품목을 다시 고르는 순간 `selectItem`이 현재 `styleSearch` 기준으로 다시 `getMaterialProductionContext`를 호출한다. 계산 로직(`isUnitPriceRequired`, `getMaterialProductionContext`, 종류 추천) 자체는 **변경하지 않았다**.
- 수량 칸 기본 비움(PR-220) 규칙: 변경 없음 — `selectItem`/`selectStyleMaterial` 호출 방식을 그대로 재사용.
- 발주 수정 창(`PurchaseOrderEditModal`)·발주 목록 기존 연결 표시: 변경 없음(파일 건드리지 않음).

## 3. 테스트 (synthetic, `purchaseOrderForm.test.ts`)

`resolveStyleLinkDisplay` 6개 테스트 추가:
1. styleNo + styleName → "연결됨: 번호 (스타일명)", 안내 없음
2. styleName 없음 → 번호만
3. styleNo 없음 + 해제한 적 없음 → 안내 없음, placeholder만("연결 가능" 문구)
4. styleNo 없음 + 명시적 해제 → "스타일 미연결 — 스타일별 집계에 포함되지 않습니다"
5. 해제 후 다시 연결 → 연결됨 라벨로 복귀(안내 사라짐)
6. 두 미연결 상태 모두 placeholder에 "기본"이라는 말이 없음(회귀 확인)

기존 `PurchaseOrdersManagerLabels.test.tsx`(PR-185, 정적 렌더)의 placeholder 문자열 단언을 새 문구로 수정(1개 파일, 테스트 개수 변화 없음) — 바뀐 이유: PR-230이 의도적으로 바꾼 placeholder 문구이기 때문.

**실제 상호작용(클릭/상태 전환) 테스트는 이 프로젝트의 테스트 환경(jsdom/testing-library 없음, 기존 패턴과 동일)에서 작성할 수 없다** — `resolveStyleLinkDisplay`로 표시 로직을, `tsc`/정적 렌더로 JSX 연결을 검증했다. 지시된 ①~⑦ 시나리오 중 "해제 후 [A]에서 다른 스타일을 선택해도 덮어쓰지 않음"(④)은 코드 읽기로 확인: `styleSearch`와 [A]의 자체 `style` state는 서로 다른 변수이고, [A]의 스타일 선택 자체는 `onPickMaterial`을 호출하지 않으므로(버튼 클릭 시에만 호출) 구조적으로 자동 덮어쓰기가 불가능함을 확인했다(별도 가드 코드 불필요).

### 테스트 숫자(전/후)
| | 전(MERGE-33 기준) | 후 |
|---|---|---|
| 프런트 vitest | 666 | **672**(+6, 신규) |
| 백엔드 jest | 1199 | **1199**(변경 없음, 1회 실행 확인) |
| e2e | 569 | **생략** — 백엔드 변경 0, 마이그레이션 0이라 e2e 영향 없음(지시된 생략 조건 충족) |

## 4. 알려진 한계
- `StyleOption.overview`가 `{ styleName }`만 담는 자리에 `totalQty` 등 다른 필드는 없음(기존 타입 그대로 재사용) — 문제 없음(연결 라벨은 styleName만 쓴다).
- `prefillItemId`+`prefillItemStyleNo`가 동시에 소비되는 동안 `getItem`(비동기)이 끝나기 전에도 `setStyleSearch`는 동기로 먼저 실행된다 — 화면에는 연결 라벨이 품목보다 한 틱 먼저 보일 수 있으나(기존 `prefillStyleNo` 경로도 같은 패턴) 기능상 문제 없음.
- [A]에서 "이 자재로 발주하기"를 누른 뒤 [B]에서 "연결 해제"를 누르면 품목 선택도 함께 지워진다(기존 스타일 변경 시 동작과 동일 — 요구사항에서 금지하지 않음, 오히려 안전: 연결 해제 후 남은 품목이 "그 스타일 BOM 전용 검색" 결과로 남지 않게 함).

## 5. 사람이 화면에서 확인할 것 (병합·배포 후, 발주관리 > 발주 탭)

1. [A] 부족자재 표에서 스타일을 고르고 "이 자재로 발주하기"를 누르면 [B] 스타일 연결에 "연결됨: 그 스타일번호 (스타일명)"이 보인다.
2. "연결 해제"를 누르면 "스타일 미연결 — 스타일별 집계에 포함되지 않습니다" 안내가 나오고, 스타일 필드를 다시 검색해 고르면 재연결된다.
3. [A]를 거치지 않고 [B]에 직접 품목을 입력하면 미연결이며, 스타일 필드 placeholder가 "스타일 미연결 (스타일을 선택하면 연결됩니다)"로 보인다.
4. 연결된 상태로 발주를 만들면 발주 목록의 스타일 칸에 그 스타일이 보인다.
5. 자재·BOM 조회(자재명세) 화면에서 특정 스타일의 BOM을 보는 중에 "발주하기"를 누르면, 넘어간 발주 화면의 [B]가 그 스타일로 자동 연결돼 있다(이번 PR의 핵심 수정).

변경 파일: `App.tsx`, `ItemsManager.tsx`, `PurchaseOrdersManager.tsx`, `StyleShortagePanel.tsx`, `purchaseOrderForm.ts`(+`.test.ts`), `PurchaseOrdersManagerLabels.test.tsx` — 모두 `frontend-app/` 내부. 서버·DB·마이그레이션·`package.json`/락 파일 변경 없음.
