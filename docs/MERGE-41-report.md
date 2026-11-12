# MERGE-41 — PR-238 (자재명세 선택 일괄 발주 + 발주 화면 새 탭) 안전 머지 결과

## Gate A — 머지 전 점검
- 대상 브랜치 `feat/bom-bulk-order-newtab` head SHA: `f5bfc34` (기대값과 일치)
- 변경 파일 8개, 전부 `frontend-app/` 아래(백엔드·마이그레이션·package.json·lock·`.env*`·데이터 파일 없음):
  - `frontend-app/src/App.tsx` (수정)
  - `frontend-app/src/components/ItemsManager.tsx` (수정)
  - `frontend-app/src/components/BomBulkOrderPanel.tsx` (신규)
  - `frontend-app/src/components/BomBulkOrderPanel.test.tsx` (신규)
  - `frontend-app/src/utils/bomBulkOrderNav.ts` / `.test.ts` (신규)
  - `frontend-app/src/utils/bomBulkOrderGrouping.ts` / `.test.ts` (신규)
- diff 확인 결과(①~⑩ 모두 확인됨):
  1. `App.tsx`의 `openOrderTab()`이 `window.open(url, '_blank', 'noopener')`로 새 탭을 열고, 팝업 차단 시 `toast.error`로 안내한다.
  2. `bomBulkOrderNav.ts`의 URL은 `view`/`prefillItemId`/`prefillStyleNo`/`bulkStyleNo`/`bulkBomItemIds`만 담는다 — 자재명·수량·단가·공급사명 등 업무 데이터는 없음.
  3. 선택·필터 상태는 `ItemsManager.tsx`의 React state(`selectedBomItemIds` 등)에 그대로 남고, 새 탭 열기는 그 상태를 건드리지 않는다(같은 탭을 바꾸지 않음).
  4. `BomBulkOrderPanel.tsx`가 `groupDraftsBySupplier`로 공급사별로 묶고, 공급사 미지정 자재는 `unassigned`로 분리돼 직접 고르기 전까지 `canCreate`가 false.
  5. `bomBulkOrderGrouping.ts`의 `isDraftReadyForCreate`가 `quantity == null`이면 차단 — `needsColorQty`/극단 불일치 행은 애초에 `suggestedQuantity: null`로 시작해 입력 전 생성 불가.
  6. 이미 발주된 자재는 `alreadyOrderedCount > 0 && !alreadyOrderedConfirmed`면 차단, 체크 UI가 함께 있음.
  7. `createOrdersBySupplier`가 기존 `createPurchaseOrdersBulk`를 업체 그룹마다 따로 호출(새 백엔드 없음) — 한 호출의 실패가 다른 호출에 영향 없음(독립 try/catch).
  8. 쿼리 없이 열면 `initialOrderPrefill`이 null이라 기존 흐름 그대로(`PurchaseOrdersManager` 렌더 분기 유지); `MultiStyleBulkOrder.tsx`는 diff에 없음(불변).
  9. 이 PR의 코드에서 `localStorage`/`sessionStorage` 호출 없음.
  10. Gemini 호출·마이그레이션·package.json 변경 없음.

## Gate B — 최신 main과 합친 상태에서 전체 테스트
- `origin/main`이 분기 시점(`0f2ff54`)에서 전혀 움직이지 않아 `git merge origin/main`은 "Already up to date"(충돌 없음).
- 병합 직전 `origin/main` 기준 테스트 수(이 브랜치로 측정): 백엔드 1272, 프런트 722(692+30), e2e 597 — 지시서의 하한과 정확히 일치.
- 백엔드(jest): **1272 / 1272** 통과.
- 프런트(vitest): **722 / 722** 통과.
- e2e(`--maxWorkers=2`, 1회): **597 / 597** 통과(137.6초). 재실행 불필요.

## Gate C — 승인
파일 맨 아래 `승인: PR-238` 확인 — 진행.

## Gate D — 머지
- `main`에서 `git merge --ff-only feat/bom-bulk-order-newtab` 성공(충돌 없음, fast-forward).
- `git push origin main` 완료.
- 머지 후 `main` SHA: **f5bfc34**
- 변경 파일: 위 8개와 동일(머지 자체는 fast-forward라 추가 변경 없음).

## 참고
- 저장소 원격 URL이 `https://github.com/klompfe/aso-scm-pjt.git` → `https://github.com/Klompfe/ASO-SCM-PJT.git`로 이동되었다는 안내가 push 시 함께 떴다(push는 정상 완료됨, 리다이렉트).
- 백엔드 변경이 없어 `Render` 자동 마이그레이션 관련 보고는 해당 없음(마이그레이션 없음).

여기서 멈춥니다.
