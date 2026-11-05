# PR-225 — 수주등록 저장 화면에 "자재 행 직접 추가" + 손글씨 후보 0건 안내

대상 브랜치: `feat/mapping-preview-manual-row` (origin/main에서 분기, push만 — **병합 없음**, 백엔드 변경 없음)

## 1. 현황 파악 (수정 전)

| 항목 | 수정 전 |
|---|---|
| 기존 "행 직접 추가" 기능 | **없음.** `SalesOrderUploadModal.tsx`에는 AI가 읽은 행을 고치거나(입력칸)/빼는(제외 체크) 기능만 있고, 빈 행을 새로 만드는 버튼은 PR-223의 "후보 → 자재 행으로 추가"(`addHandwrittenCandidateAsBomItem`)가 유일했다. |
| PR-223의 "후보 → 자재 행으로 추가" 경로 | `appendBomItemFromCandidate(results, index, candidate)` → `handwrittenCandidateToBomItem`으로 `AiBomItem` 변환 → `results[index].bomItems` 끝에 추가 → 새 인덱스를 `handwrittenBomIndexes`에 기록(배지용). 이후 그 행은 **기존 행과 완전히 같은 코드 경로**를 탄다 — `computeBomRowBadges`(새 이름 경고), `resolveAppliedQuantity`(PR-222 발주수량 적용), 저장 시 `buildCommitResult` → `commitSalesOrderAnalysis`까지 전부 동일. |
| `buildCommitResult`와 "새로 만든 행" | `buildCommitResult`는 `handwrittenCandidates`만 제외하고 `bomItems`는 `excludedIndexes`로만 거른다 — **원본 인식 여부를 구분하지 않는다.** 즉 프런트에서 새로 만든 행(후보 변환이든 직접 추가든)도 원본 행과 동일하게 `bomItems` 배열의 원소일 뿐이라 그대로 실린다. |
| 서버 쪽 거부 조건 | `mapping-commit.service.ts`의 `bomItems` 처리 루프(`for (const item of bomItems)`, PR-223 조사에서도 확인)에는 **필터/스킵이 없다** — 모든 항목이 예외 없이 처리된다. `AiBomItemDto`는 `itemName`만 `@IsNotEmpty()`이고 나머지(`category`/`consumption`/`requiredQty`/`spec`/`colorCode`/`supplier`/`remarks` 등)는 전부 `@IsOptional()`이라 null/빈 값이어도 서버가 거부하지 않는다. **→ 서버를 막는 조건은 발견되지 않았다(서버 수정 불필요).** |

**결론: 이번 PR은 PR-223의 경로를 그대로 재사용한다(새 저장 경로를 만들지 않음).** `appendBomItemFromCandidate`가 쓰던 "행을 끝에 추가하고 새 인덱스를 돌려준다" 로직을 `appendBomItem(results, resultIndex, bomItem)`로 일반화하고(`AiHandwrittenCandidate` 대신 `AiBomItem`을 바로 받음), `appendBomItemFromCandidate`는 그 위에 얇게 얹는 래퍼로 바꿨다(동작 변경 없음, 기존 테스트로 확인).

## 2. "＋ 자재 행 직접 추가"

- 자재명세 표 **아래**(버튼 하나)에 항상 보인다(후보 0건이어도). 누르면 `createEmptyBomItem()`(전부 빈 값)을 `appendBomItem`으로 끝에 추가하고, 새 행의 자재명 입력칸(`data-testid="bom-item-name-{index}-{newBomIndex}"`)에 `useEffect` + `document.querySelector`로 포커스한다.

  > **"저장 버튼 위쪽"에 대한 보정**: 이 화면에는 결과 카드마다 저장 버튼이 **표보다 위**(오더개요 영역 옆)에 하나뿐이고, 표 아래에는 "3) 작업명세"만 있어 "표 아래 = 저장 버튼 위"가 기하학적으로는 성립하지 않는다. 지시서의 "표 아래" 요구를 그대로 따라 **표 바로 아래**에 버튼을 뒀다.

- 직접 추가한 행은 **"수기 입력"** 배지(PR-223 "수기 확인 필요"와 문구를 다르게 함 — 손글씨 인식 결과를 다시 확인하라는 뜻이 아니라, 처음부터 사람이 입력했다는 뜻이라 구분했다)를 달고, 이후 **기존 행과 완전히 같은 입력칸·마스터 대조·PR-222 발주수량(적용) 계산**을 받는다(1절에서 확인한 대로 코드 경로가 같아서 별도 작업이 필요 없었다).
- **빈 자재명 처리**: 기존 규칙(`handleSave`의 `hasBlankMaterialName` → 저장 자체를 막고 토스트 "자재명이 빈 행이 있습니다 — 자재명을 채우거나 그 행을 제외해 주세요.")을 **그대로 따랐다**(지시서의 "또는 저장을 막는 기존 규칙이 있으면 그 규칙을 따른다" 분기). 다만 클릭해야만 보이는 토스트 대신, 저장 버튼 근처에 **같은 문구의 안내를 미리(클릭 전부터) 보이게** 추가했다(`hasBlankMaterialName`을 재사용, 로직 추가 없음).
- 직접 추가 행에는 "삭제" 버튼(제외 체크칸 안)을 둬서 배열에서 실제로 제거한다(인식된 원본 행은 여전히 "제외" 체크만, 새 삭제 기능 없음 — 지시서대로). 가운데 행을 지우면 이후 인덱스가 당겨지므로, `removeBomItem` + `shiftIndexesAfterRemoval`(신규 순수 함수)로 `excludedBomIndexes`/`editedBomIndexes`/`handwrittenBomIndexes`/`manualBomIndexes` 네 가지 index 기반 상태를 **전부 함께 당긴다** — 하나라도 빠뜨리면 삭제 후 다른 행에 엉뚱한 배지/체크가 붙는 버그가 생기므로 네 개 전부에 같은 shift 함수를 적용했다.
- 행 번호: 이 표에는 "번호" 열 자체가 없다(제외/구분/자재명/...순서 열만 있음) — 별도 번호 매기기가 필요 없었다. 정렬은 기존처럼 배열 순서(추가된 순서) 그대로다.

## 3. 손글씨 후보 0건 안내

`result.handwrittenCandidates`가 빈 배열이면, PR-223의 "수기 메모 후보" 구역이 그려지던 **같은 자리**에 회색 한 줄 안내("표 밖 손글씨 메모는 읽히지 않았습니다. 작지 원본에 손글씨 자재가 있으면 "＋ 자재 행 직접 추가"로 넣어 주세요.")를 대신 그린다 — 후보가 있으면 원래 구역이 그대로 보이고 이 안내는 안 보인다. 읽기 전용(버튼·입력칸 없음), PR-221 폭·PR-222 열·PR-223 구역의 레이아웃은 건드리지 않았다(같은 자리를 그냥 교체했을 뿐).

## 4. 테스트

### 신규 순수 함수 테스트 — `salesOrderBomReview.test.ts`(+7, 합성 값만)

`createEmptyBomItem`(모든 필드 비어 있음), `appendBomItem`(끝에 추가·새 인덱스·원본 불변), `appendBomItemFromCandidate`가 `appendBomItem`과 같은 결과를 냄(경로 공유 확인), `removeBomItem`(지정 행만 제거·원본 불변), `shiftIndexesAfterRemoval`(지워진 인덱스 제외, 뒤 인덱스 1씩 당김, 앞쪽은 그대로, 빈 Set).

### 컴포넌트 테스트

`SalesOrderUploadModal.test.tsx`의 기존 테스트(PR-221/222/223 포함) **수정 없이 전부 통과**. "＋ 자재 행 직접 추가" 버튼/손글씨 0건 안내는 둘 다 `results.map(...)` 안쪽(업로드 응답이 있어야 그려지는 영역)에 있어, 이 하네스(`renderToStaticMarkup`, jsdom 없음, `results`가 내부 `useState`)로는 `results`가 항상 빈 배열이라 **직접 검증할 수 없었다**(PR-221/222/223과 완전히 같은 이유 — 새 컴포넌트 테스트를 추가하지 않고 그 사유를 그대로 밝힌다). 버튼 클릭·포커스·배지·삭제·발주수량 계산 동작의 로직은 전부 위 순수 함수 테스트와 기존에 이미 검증된 `resolveAppliedQuantity`/`computeBomRowBadges`(PR-222/197)가 그대로 커버한다 — "새 행도 기존 행과 같은 경로를 탄다"는 사실 자체가 1절에서 코드로 확인됐기 때문에 별도 로직은 추가되지 않았다.

### 전체 테스트 숫자

| 구분 | 수정 전(MERGE-27 기준) | 수정 후 |
|---|---|---|
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 582 | ✅ **589/589**(+7, 기존 테스트 무수정 통과) |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(1회) | 1156 | ✅ **1156/1156**(변경 없음 — 백엔드 파일 미변경) |
| e2e | 569 | **생략** — 백엔드 변경 0개(마이그레이션 포함)라 영향 가능성이 없음 |

`git diff origin/main --stat` 확인: 변경 파일은 `frontend-app/src/components/SalesOrderUploadModal.tsx`, `frontend-app/src/utils/salesOrderBomReview.ts`/`.test.ts` 3개 — 전부 `frontend-app/` 범위. `src/migrations/`/`package.json`/락 파일 변경 0, 인식 프롬프트·스키마·서버 코드 변경 0.

## 알려진 한계

1. **"수기 입력"/"수기 확인 필요" 두 배지가 비슷해 보일 수 있다** — 문구는 다르지만(직접 입력 vs 손글씨 인식 확인), 둘 다 같은 인디고색 작은 텍스트 배지라 한눈에 구분이 어려울 수 있다(디자인 개선은 2단계 후보).
2. **빈 직접 추가 행을 깜빡 남기고 저장을 누르면** 기존 토스트+미리보기 안내 둘 다 있지만, 여러 행을 한꺼번에 추가한 뒤 어떤 행이 빈 행인지 표에서 직접 찾아야 한다(행별 강조 표시는 이번 PR에 없음).
3. **삭제는 직접 추가 행에만 가능** — 손글씨 후보로 추가한 행(PR-223)이나 원본 인식 행은 삭제할 수 없다(지시서 범위와 일치하지만, 사용자가 "후보로 추가했는데 잘못 추가했다"고 느끼면 "제외" 체크로만 처리해야 한다).
4. **손글씨 정밀 재인식은 이번 PR 범위가 아니다** — 이 기능은 인식 성공 여부와 무관하게 쓸 수 있는 **우회 수단**일 뿐, 모델이 왜 손글씨를 못 읽었는지(PILOT-21의 ④ 후보, PDF 이중 레이어 등)는 여전히 미해결이다.

## 사람이 화면에서 확인할 것 (병합·배포 후, 수주등록 > 작지 업로드 > 저장 화면)

1. 자재명세 표 아래에 "＋ 자재 행 직접 추가"가 보인다(후보가 있든 없든).
2. 눌러서 자재명 `금속장식`, 규격 `내경 10φ`를 입력하면 "수기 입력" 배지가 붙고, 마스터에 없는 이름이면 "마스터에 없는 이름입니다 — 새로 등록되거나 오독일 수 있습니다" 안내가 나온다.
3. 수량·단위를 넣으면 "발주수량(적용)" 열이 계산된다(단위가 작지수량 단위와 일치해야 "작지" 근거로 잡힘 — PR-222 규칙).
4. 저장 후(스타일번호 대조 체크 등 기존 저장 조건을 마친 뒤) BOM 조회(ItemsManager)에 그 자재가 나온다.
5. 후보가 0건일 때 회색 안내("표 밖 손글씨 메모는 읽히지 않았습니다...")가 보이고, 후보가 있으면 안 보인다.

## 커밋/푸시

코드+테스트 커밋과 본 보고서 커밋을 분리했다(아래 `git log` 참고). **main에 병합하지 않았다.**
