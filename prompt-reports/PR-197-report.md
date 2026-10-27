# PR-197 완료 보고: 작지 분석 자재명세 "저장 전 수정/제외" + 저장된 BOM 행 "삭제·자재 교체·요척 수정"

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 사항을 보려는 사람).

- 브랜치: `feat/bom-row-review-and-delete` (`origin/main` `00138e0`에서 분기 — PR-188/190/191/192/196과 독립)
- **마이그레이션 없음.** 행 출처(AI/엑셀) 저장은 이번 범위에서 제외(아래 "후속 제안" 참고).
- **운영 DB에 전혀 접속하지 않았습니다.**
- "스판사/스팽사가 어느 스타일에 몇 건 있는지"는 추정하지 않았습니다 — 사용자가 화면에서 직접 확인해야 합니다.

## 1. 배경

부족분 표에 "스판사/스팽사" 같은 자재가 있는데 작업지시서 원본에는 없다는 문제 — 같은 행이 다른 이름으로 중복 인식됐거나 AI가 손글씨를 잘못 읽었을 가능성이 있다(원인 확정은 못 함). 코드로 확인된 사실: ① 작지 분석/엑셀 업로드 둘 다 자재를 이름으로 찾고 없으면 새로 만든다 ② 작지 분석 검토 화면은 읽기 전용이라 저장 전에 고칠 수 없었다 ③ 저장된 BOM 행을 지우는 기능 자체가 없었다 ④ 자재명세 엑셀의 요척(2.9)과 BOM 저장값(2.7)이 달라도(`BOM_ITEM_VALUE_DIFF` 경고만 남고) 고칠 화면이 없었다.

## 2. 변경 요약

### A. 작지 분석 검토 화면 — 저장 전 행별 수정·제외 (`SalesOrderUploadModal.tsx`)
- 행마다 **제외 체크**(`data-testid="bom-exclude-{index}-{i}"`) — 체크된 행은 저장 요청에서 빠지고(흐리게 표시), 해제하면 복원된다. 요약 문구를 "N건 중 M건 포함"으로 바꿨다.
- **자재명**(`bom-item-name-{index}-{i}`)·**규격**·**구분**·**소요량**(`bom-consumption-{index}-{i}`)을 인라인 input으로 수정 가능. 수정한 행에는 "수정됨" 표시. 자재명을 비우면 저장 시 안내하고 막는다.
- 표 높이 `max-h-48` → `max-h-96`(스크롤 유지, 헤더 sticky).
- 의심 배지(값은 바꾸지 않고 표시만):
  - **"자재 마스터에 없는 새 이름"** — 모달이 열리면 전체 자재명을 한 번 불러와(`getAllItems`) 공백/대소문자 무시 정규화 후 비교(새 엔드포인트 없이 기존 `GET /items` 재사용).
  - **"요척×수량이 작지의 출고량과 다름"** — AI가 `requiredQty`를 읽었을 때만, `consumption × totalQty`와 1% 넘게 다르면 표시.
  - **"이름만 다르고 소요량이 같은 행입니다"** — 같은 구분 안에서 소요량이 완전히 같은 행이 3개 이상이거나(스쿠이사·스판사·스팽사 19,600 사례), 이름만 다르고 규격·소요량이 모두 같은 행(2개 이상)이 있을 때.
  - "AI가 읽은 값이므로 작업지시서 원본과 대조해 주세요" 안내 한 줄 추가.
- 기존 실/테이프 종류 선택·"AI 후보 적용" 버튼의 `data-testid`/동작은 그대로.
- 판단 로직은 전부 `frontend-app/src/utils/salesOrderBomReview.ts`(신규, 순수 함수)로 뽑았다: `updateBomItemField`, `buildCommitBomItems`/`buildCommitResult`(제외 필터링), `hasBlankMaterialName`, `isNewMaterialName`, `hasRequiredQtyMismatch`, `computeDuplicateLookingRows`, `computeBomRowBadges`.

### B. 저장된 BOM 행 삭제·자재 교체 (`boms.controller.ts`/`boms.service.ts` + `ItemsManager.tsx`)
- `DELETE /boms/items/:id` — 그 BOM 행만 삭제(**Item 자재 마스터는 유지**). 같은 스타일·같은 자재로 연결된 취소 아닌 발주 건수를 세어 응답에 포함(삭제 자체는 막지 않음 — 발주/재고/입고는 건드리지 않음). 존재하지 않는 id는 404.
- `PATCH /boms/items/:id/material` `{ materialId }` 또는 `{ materialName }` — 이미 등록된 다른 자재로 교체(**없는 이름/id는 새로 만들지 않고 400**). 스타일 연결 발주의 `itemId`는 바꾸지 않는다(BOM 행과 발주는 별개 레코드).
- 프런트: BOM 행마다 [자재 교체](자재 검색 드롭다운, `SearchSelectField` 재사용) / [삭제](확인창: "이 스타일 BOM에서만 빠집니다. 자재 마스터와 기존 발주는 그대로입니다") 버튼. 둘 다 성공 시 `getBomByStyleNo` 재조회로 목록 새로고침(기존 "수정" 버튼의 새로고침 패턴과 동일).

### C. 저장된 BOM 행의 요척·규격·색상·구분 수정 (실제 사례 대응)
- `UpdateBomItemDto`에 `consumption`(0 이상 숫자)/`spec`/`colorCode`/`category` 선택 필드 추가(기존 `composition`/`hsCode`/`threadType`/`tapeType`은 그대로).
- `consumption`이 바뀌면 `requiredQty`도 **"요척 × 스타일 총수량(StyleOverview.totalQty)"**으로 같이 재계산(총수량이 없으면 건드리지 않음). 실제 회귀 케이스: 980장 × 요척 2.7(틀림) = 2,646 → 요척을 2.9로 고치면 2,842로 재계산(57롤).
- 응답에 `before`(변경 전 전체 스냅샷)를 포함하고, 바뀐 필드마다 서버 로그(`BomItem #id field: before → after`)를 남긴다(감사 테이블은 만들지 않음).
- 프런트 `ItemsManager`의 BOM 행 편집에 요척/규격/색상/구분 입력칸 추가. 요척이 실제로 바뀌면 저장 전 `confirm("요척 2.7 → 2.9 (필요량이 바뀝니다). 저장하시겠습니까?")`로 한 번 더 확인.
- **중요**: 실제 소요량 계산(work-orders의 `calculateMaterialRequirements`)은 `BomItem.requiredQty` 컬럼이 아니라 매번 `consumption × targetQuantity`로 다시 계산하므로, 이번 `requiredQty` 재계산은 그 계산 자체에는 영향이 없다(다른 화면이 그대로 보여주는 스냅샷 값만 맞춘다) — 확인 완료.

## 3. 테스트 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` / `npm run build` | 통과 |
| 백엔드 `jest` 전체 | **62 suites / 806 tests** 통과 — 신규: `boms.service.spec.ts`에 `updateItem`(요척 재계산 회귀 2.9×980=2,842 포함)/`deleteItem`/`swapMaterial` 11건 |
| 백엔드 e2e 전체(`--maxWorkers=2`) | **66 suites / 520 tests** 통과 — 신규 `test/bom-item-delete-and-swap-flow.e2e-spec.ts` 13건: 삭제(정상/연결 발주 건수/Item 마스터 유지/404/삭제 후 소요량 조회에서 자재 사라짐), 자재 교체(id·이름으로 교체/발주 itemId 불변/없는 이름 400/404), 요척 수정(재계산+before/음수 거부/숫자아님 거부) |
| 프론트 `tsc -b` / `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **52 files / 348 tests** 통과(회귀 없음) — 신규: `salesOrderBomReview.test.ts` 21건(제외/복원/수정/자재명 공백 거부/새 이름·요척 불일치·중복 배지, 19,600 사례 포함) |
| `npm run lint` | 실행 불가 — 저장소 전체에 ESLint 설정 파일이 없음(이전 PR들에서도 확인한 기존 상태, 이 PR과 무관) |

### 프론트 렌더 테스트에 대해
실제 체크박스 클릭/입력 변경 같은 상호작용은 이 환경(`renderToStaticMarkup`만 지원)에서 테스트할 수 없다(이번 세션의 다른 PR들과 동일한 제약). 대신 그 상호작용이 호출하는 모든 판단 로직(제외 필터링, 필드 수정, 배지 계산, 자재명 공백 검사)은 `salesOrderBomReview.ts`로 뽑아 순수 함수로 전부 테스트했다.

## 4. 화면에서 확인할 것 체크리스트
① 작지 분석 후 "2) 자재명세" 표에서 행 제외 체크 → 저장 요청에서 빠지는지, 체크 해제 → 복원되는지, 자재명/규격/소요량을 직접 고칠 수 있는지, 자재명을 비우면 저장이 막히는지.
② 새 이름 배지(자재 마스터에 없는 이름)·요척 불일치 배지·중복 배지가 뜨는지(스쿠이사/스판사/스팽사처럼 소요량이 완전히 같은 행).
③ 품목 탭 → "BOM 보기" → BOM 행의 [자재 교체]/[삭제] 버튼으로 교체·삭제한 뒤 목록과 부족분 표(`getStyleRequirements`)에 반영되는지(삭제된 자재는 사라짐).
④ BOM 행 요척을 고치면 "요척 X → Y (필요량이 바뀝니다)" 확인창이 뜨고, 저장 후 소요량(requiredQty)이 재계산되는지.

## 5. 하지 않은 것(명시적 지시 준수)
- 스판사/스팽사 같은 이름을 코드에서 자동 삭제·자동 치환하는 로직 없음(전부 사람이 버튼을 눌러야만 동작).
- 운영 DB 데이터 직접 수정·정리 스크립트 없음.
- `Item`(자재 마스터) 삭제 없음 — BOM 행 삭제·교체 모두 Item 레코드 자체는 건드리지 않는다.
- AI 프롬프트 변경 없음(원인 확인 뒤 별도 PR 대상).
- 컬럼 추가/마이그레이션 없음.

## 6. 후속 제안(이번 범위 제외, 지시대로 코드 변경 없이 제안만)
BOM 행의 출처(AI 분석으로 읽음 / 엑셀 업로드 / 라벨 세트)를 저장하면 나중에 의심 행을 더 쉽게 구분할 수 있다 — `bom_item_details.source` 컬럼 추가(마이그레이션 필요) + `vision.service.ts`/`mapping-commit.service.ts`/`BomsService.addLabelSet`이 각각 `'AI_VISION'`/`'EXCEL_UPLOAD'`/`'LABEL_SET'`을 저장. 이번 PR에서는 하지 않았다.

## 7. 브랜치 SHA
커밋 완료 후 `feat/bom-row-review-and-delete` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
