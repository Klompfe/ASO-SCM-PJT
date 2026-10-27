# PR-191 완료 보고: 스타일 부족자재 표 — 헤더 열 어긋남 수정 + "수정하기"는 이 스타일에 연결된 미입고 발주일 때만

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 사항을 보려는 사람).

- 브랜치: `fix/shortage-table-header-and-edit-button` (`origin/main` 최신 `8ee5125`에서 분기 — PR-196/PR-194 모두 반영된 상태)
- **마이그레이션 없음, 서버(백엔드) 변경 없음** — `git diff --stat origin/main -- src/ test/`가 비어 있음을 확인(아래 "0단계" 참고).
- **운영 DB에 전혀 접속하지 않았습니다.**

## 0단계: main에서 증상이 아직 있는지 확인(읽기 전용)

| 증상 | 확인 결과 |
|---|---|
| (1) `ShortageTable` 머리글 열 수·순서가 데이터 행과 일치하는가 | **아직 어긋나 있음.** `frontend-app/src/components/StyleShortagePanel.tsx`에서 체크박스 `<td>`는 각 행 맨 앞(`{onToggle && <td>...</td>}`가 자재 `<td>`보다 먼저)인데, 머리글의 "일괄" `<th>`는 맨 뒤(`{onToggle && <th>일괄</th>}`)에 있었다 — `onToggle`이 있을 때 모든 머리글이 한 칸씩 밀림. |
| (2) "수정하기" 판정이 현재 스타일에 연결된 미입고 발주만 보는가 | **아직 스타일을 보지 않음.** `PurchaseOrdersManager.tsx`가 `editable={buildEditableOrderByItem(pendingOrders)}`로 **전체** 미입고 발주를 자재 기준으로만 걸러 넘김 — 다른 스타일/미연결 발주가 있어도 "수정하기"로 뜸. |

둘 다 아직 해결되지 않아 이번 PR에서 고쳤다(빈 PR 아님).

## 1. 원인 확인 결과(코드 위치)
- 헤더 어긋남: `frontend-app/src/components/StyleShortagePanel.tsx`의 `ShortageTable` — thead(옛 47번째 줄 근처)와 tbody 행(옛 54번째 줄 근처) 렌더 순서 불일치.
- "수정하기" 판정: `frontend-app/src/components/PurchaseOrdersManager.tsx`(`editable={buildEditableOrderByItem(pendingOrders)}`, 옛 424번째 줄)와 `frontend-app/src/utils/purchaseOrderForm.ts`의 `buildEditableOrderByItem`(자재(itemId) 기준으로만 "가장 최근 미입고"를 고르고 스타일은 전혀 보지 않음 — 함수 자체는 PR-177 설계 그대로 두고, 호출하는 쪽에서 스타일로 미리 필터링하도록 바꿈).

## 2. 변경 요약

| 파일 | 내용 |
|---|---|
| `frontend-app/src/components/StyleShortagePanel.tsx` | **A.** `ShortageTable`의 thead를 데이터 행과 같은 순서로 맞춤: `onToggle`이 있으면 "선택" 머리글을 **맨 앞**에 두고, 기존 맨 뒤 "일괄" 머리글은 삭제. 버튼 열의 빈 `<th>`는 "발주" 문구로 채움. **B.** `StyleShortagePanel`이 `editable` prop 대신 `pendingOrders: PurchaseOrder[]`를 받아, 내부에서 `filterOrdersByStyleNo(pendingOrders, style.styleNo)`로 걸러 `buildEditableOrderByItem`에 넘긴다 — 이 스타일에 연결된 미입고 발주만 "수정하기"/일괄발주 기본 제외 판정에 쓰인다. 다른 스타일의 미입고 발주 건수(`countOtherStylePendingByItem`)는 `ShortageTable`의 새 `otherStylePendingCountByItem` prop으로 넘겨 자재명 아래 회색 참고 문구("참고: 다른 스타일 미입고 발주 N건 있음(발주 목록에서 확인)")로만 보여준다(버튼 아님). 스타일 미연결 발주는 세지 않음(기존 `unlinkedOrderedQty`/"미연결 발주 — 스타일을 연결하세요" 안내가 이미 그 역할을 하므로 중복 방지). |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | `StyleShortagePanel`에 `editable={buildEditableOrderByItem(pendingOrders)}` 대신 `pendingOrders={pendingOrders}`를 그대로 넘김(필터링은 패널 내부로 이동). 더 이상 쓰지 않는 `buildEditableOrderByItem` import 제거. |
| `frontend-app/src/utils/purchaseOrderForm.ts` | 신규 순수 함수 2개: `filterOrdersByStyleNo(orders, styleNo)`(스타일 일치하는 발주만), `countOtherStylePendingByItem(orders, currentStyleNo)`(다른 스타일 미입고 발주 건수 — 미연결은 제외). **`buildEditableOrderByItem` 자체는 바꾸지 않음**(ItemsManager.tsx의 자재 기준 "수정하기"가 그대로 쓰므로). |

`ItemsManager.tsx`는 변경하지 않았다(자재 기준 "수정하기"는 스타일 개념이 없는 기존 동작 그대로).

## 3. 바꾼 기존 테스트와 사유
**기존 테스트를 수정한 것은 없다.** `src/components/SearchSelectField.test.tsx`의 `ShortageTable` 관련 테스트(값 표시, 버튼 개수, 강조 행)와 `src/components/StyleShortagePanelLabels.test.tsx`(요약 안내 문구)를 재실행해 회귀 없음을 확인했다 — 둘 다 헤더 순서나 `editable` 소스를 검증하지 않아 이번 변경과 충돌하지 않았다. `src/utils/multiStyleBulkOrder.test.ts`(다른 화면에서 `hasEditablePending`을 쓰는 PR-194 테스트)도 영향 없음을 확인했다(그 화면은 처음부터 스타일+품목별로 직접 걸러진 발주 이력을 쓰고 있어 이번 버그와 무관).

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 프론트 `tsc -b` | 통과 |
| 프론트 `npm run build` | 통과 |
| 프론트 `vitest run` 전체 | **58 files / 421 tests** 통과 — 신규: `ShortageTable.test.tsx` 6건(헤더 정렬 3건, 참고 안내/수정하기 분기 3건), `purchaseOrderForm.test.ts`에 `filterOrdersByStyleNo`/`countOtherStylePendingByItem`/통합 확인 10건 추가. 기존 테스트 회귀 없음. |
| 백엔드 | **변경 없음** — `git diff --stat origin/main -- src/ test/` 결과 없음(빈 출력). 백엔드 `jest`/`e2e`는 이번 PR과 무관하므로 재실행하지 않았다. |

### 테스트 상세
- 헤더 정렬: `onToggle` 있음/없음 둘 다에서 `<th>` 개수 == 첫 데이터 행 `<td>` 개수, 머리글 순서가 `['선택'(있으면), 자재, 카테고리, 필요 총수량, 발주(스타일 연결), 발주(미연결, 참고), 부족 수량, 발주]`와 정확히 일치하는지 확인.
- "수정하기" 판정: (1) 다른 스타일의 미입고 발주만 있으면 "발주하기" + 참고 안내 건수, "수정하기" 없음 (2) 현재 스타일의 미입고 발주가 있으면 "수정하기" (3) 스타일 미연결 발주만 있으면 "발주하기" 유지(참고 안내는 세지 않음) (4) 입고완료/취소 발주는 스타일이 같아도 제외(기존 규칙 유지) — `buildEditableOrderByItem` 자체는 그대로이므로 기존 "미입고만, 최근 1건" 규칙도 함께 재확인됨.
- 일괄발주 기본 제외(`hasEditablePending`)는 `StyleShortagePanel`이 넘기는 스타일-필터링된 `editable`을 그대로 쓰므로(코드 공유), 별도 함수 테스트로 같은 보장이 이미 커버된다.

## 5. 화면에서 확인할 것
① 발주 화면 "스타일번호로 필요 자재 찾기"에서 표 머리글이 데이터와 한 칸도 어긋나지 않는다(특히 "필요 총수량" 아래 실제 필요 총수량이, "부족 수량" 아래 실제 부족 수량이 보임).
② 이 스타일로 발주한 적 없는 자재(오바사/다데 등 공용 자재가 다른 스타일로만 발주된 경우)는 "이 자재로 발주하기" 버튼이 뜨고, 자재명 아래 회색 "참고: 다른 스타일 미입고 발주 N건 있음(발주 목록에서 확인)" 문구가 보인다.
③ 이 스타일에 실제로 미입고 발주가 있는 자재만 주황 "수정하기" 버튼이 뜬다.
④ 스타일 미연결 발주가 있는 자재는 기존처럼 "발주(미연결, 참고)" 열에 수량과 "미연결 발주 — 스타일을 연결하세요" 안내가 뜨고, 새 참고 문구와 중복되지 않는다.

## 6. 하지 않은 것(명시적 지시 준수)
- 서버/DB 변경 없음, 마이그레이션 없음, 운영 DB 접속 없음.
- `ItemsManager.tsx` 변경 없음(자재 기준 "수정하기"는 그대로).
- 발주 데이터 소급 수정·삭제 없음 — 이번 변경은 화면 표시 판정만 바꿨다(서버 계산 값 `orderedQty`/`unlinkedOrderedQty`/`unlinkedPoCount`와 "미연결 발주" 안내는 그대로 유지).

## 7. 브랜치 SHA
커밋 완료 후 `fix/shortage-table-header-and-edit-button` 푸시 — SHA는 완료 메시지에서 확인. 병합하지 않음(`pause-after`).
