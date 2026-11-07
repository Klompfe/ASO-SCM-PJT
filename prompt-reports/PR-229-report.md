# PR-229 — 자재·BOM 조회 표 "소요수량"을 실시간 계산값으로 표시

브랜치: `feat/bom-lookup-live-required-qty` (origin/main에서 분기, 병합하지 않음). 마이그레이션 0, 백엔드 변경 0.

## 1. 현황 파악

### 1-1. 자재·BOM 조회 표(`ItemsManager.tsx`)의 소요수량 칸 — 수정 전

| 구성 | 수정 전 |
|---|---|
| 주 값(굵은 글씨) | `BomItem.requiredQty`(저장 스냅샷) — `bomItemQtyDisplay`가 `formatBomItemQty(it.requiredQty, ...)`로 포장단위만 적용 |
| 입력 데이터 출처 | 스냅샷은 `boms.service.ts updateItem()`이 "요척 변경 저장" 시점에 `consumption × totalQty`로 한 번 계산해 DB에 저장(이후 totalQty가 바뀌거나 수량표가 생겨도 갱신 안 됨) |
| PR-227의 실시간 계산 | `bomItemAppliedQtyFormula`가 `resolveAppliedQuantity`(PR-226 규칙)로 계산한 수식 문자열만 "계산 근거(참고)"로 작은 글씨로 보여줌 — 값 자체는 쓰지 않음 |
| 0일 때 | `resolveZeroQtyReason`/`describeZeroQtyReason`가 "저장된 값 0(다시 저장 필요)" 등 스냅샷 기준 이유를 보여줌 |
| 필요한 입력 | 총수량(`getMasterStyles` 응답의 `overview.totalQty`), 색상×사이즈 수량표(`getStyleColorSizeQuantities` → `buildColorQtyMap`) — PR-227에서 이미 선택한 스타일 1건 기준으로 불러오고 있음(기존 API, 새 API 없음) |

### 1-2. `BomItem.requiredQty` 스냅샷을 읽어 보여주는 화면 — grep 결과

`getBomByStyleNo`/`BomItemRow`(이 스냅샷이 담긴 응답 타입)를 쓰는 곳은 프런트 전체에서 **`ItemsManager.tsx` 하나뿐**(그 외는 테스트 파일). 다른 "필요량/소요량"을 보여주는 화면은 전부 스냅샷이 아니라 서버의 실시간 계산(`GET /work-orders/style-requirements`, `calculateMaterialRequirements`)을 쓴다.

| 화면 | 현재 값 출처 | 포장단위 적용 | 이번 PR 적용 |
|---|---|---|---|
| 자재·BOM 조회 표(`ItemsManager.tsx`) | **스냅샷**(`BomItem.requiredQty`) | 적용(`formatBomItemQty`) | **예** — 이번 PR에서 실시간 계산으로 교체 |
| BOM 소요명세서(`BomRequirementReport.tsx`, PR-120/218) | `fetchStyleRequirementView`/`fetchWorkOrderRequirementView` → 서버 `work-orders` 실시간 계산 | 적용(`formatRequirementQty`) | 아니오(이미 실시간) — 범위 밖 |
| [A] 부족자재 표(`StyleShortagePanel.tsx`) | 위와 동일한 서버 실시간 계산(`getStyleRequirements`) | 적용 | 아니오(이미 실시간) |
| 수주등록 저장 화면(`SalesOrderUploadModal.tsx`) | 업로드 직후 미저장 후보(`AiBomItem`) — `BomItem`이 아직 없음 | `resolveAppliedQuantity`로 미리보기만 | 아니오(스냅샷 자체가 없는 화면) |
| 발주 폼의 "발주수량(적용)" | `MaterialRequirementRow`(서버 실시간 계산 결과) | 적용 | 아니오(이미 실시간) |

**BOM 소요명세서 엑셀 내보내기**는 별도 내보내기 함수가 없고, `BomRequirementReport.tsx`가 `PrintableReport`로 같은 화면 데이터를 인쇄/캡처하는 구조 — 어차피 서버 실시간 계산을 그대로 쓰므로 "다른 화면과 어긋남" 문제 자체가 없다(요구사항 3번: 이미 서버 계산을 쓰는 화면은 그대로 둔다).

**결론: 스냅샷을 주 값으로 보여주는 화면은 `ItemsManager.tsx` 하나뿐이었고, 이번 PR로 그 하나를 고치면 "같은 값을 쓰는 다른 곳과 어긋나는 문제" 자체가 없다.** (요구사항 3번 — 범위 확장 없음)

여러 스타일이 한 화면에 있을 때: `ItemsManager.tsx`는 검색 결과에서 스타일 1건을 선택해야 자재 목록이 나오는 구조(기존대로)라 총수량·수량표도 그 1건 기준으로만 불러오면 된다 — 다건 동시 계산은 필요 없다.

## 2. 구현 — 소요수량 칸을 실시간 계산값으로

- 주 값을 `resolveAppliedQuantity`(PR-226, 변경 없음)가 계산한 `applied.qty`로 바꾸고, 포장단위·정수 올림은 기존 `formatBomItemQty`를 그대로 재사용(계산/올림 로직 변경 없음).
- 근거 배지(`작지`/`색상수량표`/`계산` — `APPLIED_BASIS_LABEL`)를 주 값 아래 항상 보여주고, `title`에 계산식(`applied.formula`)을 둔다.
- 불일치(`mismatch`)·"작지 값이 총수량과 같음"(`sheetQtyLooksLikeTotalQtyMisread`, 길이 단위에서만 + 단위 불명 시 "단위를 확인해 주세요")·비정상 요척(`extremeConsumptionMismatch`) 경고는 `StyleShortagePanel.tsx`와 **같은 조건·같은 문구**로 그대로 보여준다(PR-226/228 경고 분류·문구 변경 없음).
- 계산 자체가 안 되는 두 경우만 숫자 대신 이유를 보여준다(새 함수 `resolveLiveQtyReason`/`describeLiveQtyReason`, `bomQtyReason.ts`):
  - `basis==='unknown'`(색상은 있는데 수량표에도 없고 단위 맞는 작지 값도 없음) → "색상별 수량 확인 필요"
  - `basis==='computed'`(공통색)인데 스타일 총수량이 없음(null 또는 0 이하) → "스타일 총수량 미입력"(PR-227과 같은 문구·안내, 스타일 관리에서 입력)
  - 그 외(요척 자체가 0 등 "진짜 0")는 그냥 0을 보여준다.
- **"저장된 값 0(다시 저장 필요)" 문구는 더 이상 쓰지 않는다**(사용자에게 다시 저장을 요구하지 않음) — `ItemsManager.tsx`에서 `resolveZeroQtyReason`/`describeZeroQtyReason` 호출을 제거했다. 두 함수 자체와 그 문구·테스트(`bomQtyReason.test.ts`의 PR-227 블록)는 그대로 남겨 뒀다(다른 코드에서 쓰지 않지만, 지우면 PR-227 테스트가 깨지고 이번 PR의 범위를 넘으므로 — "알려진 한계" 참고).
- 저장된 스냅샷은 주 값과 **다를 때만** 작은 회색 글씨로 "저장 당시 값 N"을 보조 표시한다(같으면 표시하지 않음 — 새 함수 `describeSnapshotNote`). 조회 화면에서 DB에 다시 쓰지는 않는다(쓰기 없음, 요구사항대로).
- 수정 모드/보기 모드가 똑같은 칸을 그려야 해서 `renderBomItemQtyCell(it)` 한 함수로 합쳤다(기존엔 두 곳에 똑같은 JSX가 중복돼 있었음).

## 3. 변경 파일

| 파일 | 내용 |
|---|---|
| `frontend-app/src/utils/bomQtyReason.ts` | `resolveLiveQtyReason`/`describeLiveQtyReason`/`describeSnapshotNote` 추가(PR-227의 `resolveZeroQtyReason` 등은 그대로 유지, 변경 없음) |
| `frontend-app/src/components/ItemsManager.tsx` | 소요수량 칸을 실시간 계산값으로 교체(`renderBomItemQtyCell`), 기존 `bomItemQtyDisplay`/`bomItemZeroReason`/`bomItemAppliedQtyFormula` 제거 |
| `frontend-app/src/utils/bomQtyReason.test.ts` | 신규 함수 테스트 + 통합 시나리오(아래 4절) |
| `prompt-reports/PR-229-report.md` | 본 보고서 |

## 4. 테스트 (합성 값, `bomQtyReason.test.ts`에 추가)

실제 컴포넌트 렌더링은 이 저장소의 React 테스트 환경에 jsdom/testing-library가 없어 할 수 없다(PR-226~228과 같은 제약) — `ItemsManager.tsx`의 `renderBomItemQtyCell`과 **같은 순서로 순수 함수를 조합**(`resolveAppliedQuantity` → `resolveLiveQtyReason` → `formatBomItemQty` → `describeSnapshotNote`)해 "화면에 뭐가 보일지"를 검증했다.

| 시나리오 | 결과 |
|---|---|
| 사용자 보고 재현: 스냅샷 0 + 총수량 499 + 요척 1 + 단위 EA | 주 값 `499`, "다시 저장 필요" 문구 없음, 보조로 "저장 당시 값 0" |
| 스냅샷과 계산값이 같음 | 보조 표시 없음 |
| 색상 있음 + 수량표에 그 색상 합계 있음 | 색상 합계 × 요척(`basis=color-qty`) |
| 색상 있음 + 수량표 없음 + 단위 맞는 작지 값 있음 | 작지 값 적용(`basis=sheet`) |
| 색상 있음 + 수량표에도 작지에도 근거 없음 | "색상별 수량 확인 필요"(0이 아님) |
| 공통색 + 총수량 없음 | "스타일 총수량 미입력"(0이 아님) |
| 요척 자체가 0(총수량은 있음) | 그냥 `0`(이유 문구 없음, 진짜 0) |
| 실/테이프(종류 지정됨) | 포장단위 환산 적용(N콘/N롤) |
| 실/테이프(종류 미지정) | "종류 확인 필요" 경고, 포장 계산 안 함 |
| `resolveLiveQtyReason`/`describeLiveQtyReason`/`describeSnapshotNote` 개별 단위테스트 | 각 분기 확인 |

기존 `ItemsManager`/`bomQtyReason` 테스트 중 "스냅샷이 주 값"을 전제한 것은 없었다 — 전체 테스트 재실행 결과 수정 전/후 모두 그대로 통과했다(회귀 없음).

| 구분 | 수정 전 | 수정 후 |
|---|---|---|
| 프런트 `vitest run` | 648/648 | **666/666**(+18, 신규) |
| 프런트 `tsc -b` | 성공 | 성공 |
| 프런트 `npm run build` | — | 성공 |
| 백엔드 `jest`(변경 없음, 1회 확인) | — | **1199/1199** |
| e2e | — | **생략**(백엔드 변경 0 — material-requirements.util.ts 등 계산 로직 미변경) |

## 5. 알려진 한계

- `bomQtyReason.ts`의 `resolveZeroQtyReason`/`describeZeroQtyReason`/`MESSAGES['stale-snapshot']`(PR-227)은 이제 `ItemsManager.tsx`에서 더 이상 호출하지 않는다 — 코드와 테스트는 남겨 뒀지만(그 자체 테스트가 있고, 지우는 건 이번 PR 범위 밖), 실제 화면에는 더 이상 나타나지 않는 죽은 코드다. 다음 정리 PR 후보.
- 근거 배지(작지/색상수량표/계산)·불일치·비정상 요척 경고는 StyleShortagePanel과 문구를 맞췄지만, 두 화면이 같은 문자열을 각자 복제해 들고 있다(PR-226/228부터 있던 기존 구조 — 프런트/백엔드가 분리돼 있어 이미 자재 요구량 로직 자체도 복제돼 있다. 공통 컴포넌트로 뽑는 건 이번 PR 범위 밖).
- 단위가 다르면(Y 등) 포장단위 환산을 하지 않고 "단위 확인 필요"만 보여주는 기존 제약은 그대로다(Y↔M 환산 코드 없음 — 기존에 알려진 미결 사항, MEMORY 참고).
- 여러 스타일을 한 화면에서 동시에 볼 수 있게 되면(현재는 1건 선택 구조) 스타일별 총수량·수량표를 매번 불러와야 해 성능을 다시 봐야 한다 — 지금 구조에서는 해당 없음.

## 6. 사람이 화면에서 확인할 것 (병합·배포 후, 자재·BOM 조회 화면)

1. 라벨류(단위 EA, 요척 1) 행이 "저장된 값 0(다시 저장 필요)" 대신 **499**(또는 해당 스타일 총수량)로 보인다.
2. 스냅샷이 다른 값으로 저장된 행에는 주 값 아래 작은 회색 "저장 당시 값 N"이 보인다(같으면 안 보임).
3. 실·테이프 행이 N롤/N콘으로 보인다(종류 미지정이면 "종류 확인 필요").
4. 색상 있는 자재(겉감 등)가 색상 수량 기반 값으로 보이고 "색상수량표 기준" 배지가 있다.
5. 스타일 총수량이 없으면 "스타일 총수량 미입력"이 보인다(숫자 0이 아님).
6. 색상이 있는데 수량표에도 작지에도 근거가 없으면 "색상별 수량 확인 필요"가 보인다.
7. 발주관리 [A] 부족자재 표의 필요량과 같은 값이다(둘 다 같은 `resolveAppliedQuantity`/서버 계산 규칙).
