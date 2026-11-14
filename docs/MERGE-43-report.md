# MERGE-43 — PR-240 ("발주하기" 공급업체·수량·단가 미리 채우기) 안전 머지 결과

## Gate A — 머지 전 점검
- 대상 브랜치 `fix/order-prefill-existing` head SHA: `cc6d948` (기대값과 일치)
- 변경 파일 7개, 전부 `frontend-app/` 아래(백엔드·마이그레이션·package.json·lock·`.env*`·데이터 파일 없음):
  - `frontend-app/src/utils/orderPrefill.ts` / `.test.ts` (신규)
  - `frontend-app/src/components/PurchaseOrdersManager.tsx` (수정)
  - `frontend-app/src/components/BomBulkOrderPanel.tsx` (수정)
  - `frontend-app/src/utils/bomBulkOrderGrouping.ts` / `.test.ts` (수정)
  - `frontend-app/src/api/items.service.ts` (수정, `vendor` 필드 추가)
- diff 확인 결과(①~⑩):
  1. 공급업체 우선순위 BOM 행 → 품목 마스터(vendor) → 최근 발주(`pickSupplierPrefill`), 미정/빈 값/"N/A"는 `normalizeSupplierNameForMatch`에서 제외, 필드 옆 출처 표시(`SUPPLIER_SOURCE_LABEL`) — 확인됨.
  2. BOM/마스터 공급사 텍스트는 `findExactSupplierMatch`로 **정확히 일치할 때만** 매칭(추측·부분일치 없음), 일치 안 하면 자동 생성 없이 다음 우선순위로 넘어감 — **다만 "일치하는 마스터가 없습니다" 같은 별도 안내 문구는 이 PR에 포함되지 않았다**(매칭 실패 시 조용히 다음 우선순위로 넘어가고, 전부 실패하면 공통 안내 "이 품목으로 채울 수 있는 공급업체/단가 정보가 없어 직접 선택해 주세요."만 보인다). PR-240 보고서에도 명시돼 있고, 지시서 규칙대로 **이 PR 머지를 막는 사유로 보지 않고 후속 과제로 기록**한다.
  3. 수량은 기존 `suggestStyleLinkedQuantity`/`resolveAppliedQuantity`를 그대로 재사용(새 계산 없음) — 포장 규칙 행은 N콘/N롤, `needsColorQty`·극단 불일치·근거 없음 행은 그대로 비움(로직 미변경으로 자동 보장) — 확인됨.
  4. 단가 우선순위 BOM 확정 단가(0은 없음) → 같은 자재+공급사 최근 발주 단가(`pickPricePrefill`), 포장 환산이 적용되는 행은 BOM 확정 단가(길이 기준)를 쓰지 않고 최근 발주 단가만 사용(`packagingApplies` 플래그) — 단위 불일치 시 채우지 않는 안전장치 확인됨. **통화 불일치 감지는 별도 필드가 없어(PurchaseOrder/BomItem에 통화 컬럼 없음) 명시적으로 구현되지 않았다** — 기존 시스템 자체가 단일 통화(KRW) 전제인 것으로 보이며 이 PR이 새로 만든 문제는 아니다.
  5. `supplier`/`unitPrice` onChange 핸들러에서 `setSupplierSource(null)`/`setPriceSource(null)` 호출 확인 — 수정 시 출처가 "직접 입력"으로 바뀜.
  6. `PurchaseOrdersManager.tsx`와 `BomBulkOrderPanel.tsx` 둘 다 `orderPrefill.ts`의 `pickSupplierPrefill`/`pickPricePrefill`/`findExactSupplierMatch`를 동일하게 import해 사용 — 확인됨.
  7. `PriceReferenceBlock`/`priceRef` 관련 코드는 diff에서 import 줄 외 변경 없음(참고용 그대로, 자동 채움에 쓰이지 않음) — 확인됨.
  8. Gate B 테스트 결과(아래)로 단가 필수 판단·수량 검증·PR-238 흐름 회귀 테스트 포함 전체 통과 확인.
  9. diff 전체에 `localStorage`/`sessionStorage`/`Gemini`/`migrations`/`package.json`/lock 참조 없음(grep 확인) — 확인됨.
  10. PR-240 보고서의 "같은 유형이지만 범위 밖" 3곳을 그대로 옮긴다:
     - `[A]` 부족자재 표의 "이 자재로 발주하기"(`handlePickMaterial`, `PurchaseOrdersManager.tsx` 전 405행 부근)는 수량은 고쳐지지만 BOM/마스터 우선순위는 적용되지 않음(최근 발주 이력 단계만 적용).
     - `MultiStyleBulkOrder.tsx`(다품번 일괄 발주, 139~142행 부근)는 단가를 전혀 채우지 않고 공급업체도 최근 발주 이력만 봄.
     - `PurchaseOrderEditModal.tsx`(발주 수정)는 이미 있는 발주를 편집하는 화면이라 이 문제와 무관(해당 없음).

## Gate B — 최신 main과 합친 상태에서 전체 테스트
- `origin/main`이 분기 시점(`3d22ebc`)에서 전혀 움직이지 않아 `git merge origin/main`은 "Already up to date"(충돌 없음).
- 병합 직전 `origin/main` 기준 테스트 수: 백엔드 1279, 프런트 751(739+12), e2e 600 — 지시서 하한과 정확히 일치.
- 백엔드(jest): **1279 / 1279** 통과.
- 프런트(vitest): **751 / 751** 통과, `tsc -b` 빌드 클린.
- e2e(`--maxWorkers=2`, 1회): **600 / 600** 통과(114.9초) — `import-shipments-dpkl-flow` 타임아웃 재현 없음, 재실행 불필요.

## Gate C — 승인
파일 맨 아래 `승인: PR-240` 확인 — 진행.

## Gate D — 머지
- `main`에서 `git merge --ff-only fix/order-prefill-existing` 성공(충돌 없음, fast-forward).
- `git push origin main` 완료.
- 머지 후 `main` SHA: **cc6d948**
- 변경 파일: 위 7개와 동일(머지 자체는 fast-forward라 추가 변경 없음).
- Gate A ②의 "마스터 미일치 안내 문구" 포함 여부: **미포함**(후속 과제로 기록, 이번 머지를 막지 않음).

## 참고
- 저장소 원격 URL이 `https://github.com/klompfe/aso-scm-pjt.git` → `https://github.com/Klompfe/ASO-SCM-PJT.git`로 이동되었다는 안내가 push 시 함께 떴다(push는 정상 완료됨, 리다이렉트).
- 마이그레이션 없음(프런트 전용 PR, 백엔드 코드 변경 없음).

여기서 멈춥니다.
