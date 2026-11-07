# MERGE-32 — PR-228 main 반영 보고서

대상: 브랜치 `fix/handwritten-row-qty-mapping` (head `c3caa65`, 사용자 입력 SHA와 일치). 마이그레이션 0, DB 변경 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/fix/handwritten-row-qty-mapping` = `c3caa65`(일치). 코드+테스트 커밋 `6ebb425`, 보고서 커밋 `c3caa65` 둘 다 확인.
- `origin/main` = `3628b51`(MERGE-31 보고서 커밋, 분기 이후 변화 없음). `docs/MERGE-31-report.md`가 `origin/main`에 존재함을 확인.

### 변경 파일 (`git diff --name-only origin/main...origin/fix/handwritten-row-qty-mapping`, 13개)

| 구분 | 파일 |
|---|---|
| 백엔드(소요량 계산 유틸 + 테스트) | `src/work-orders/utils/material-requirements.util.ts`, `.spec.ts` |
| 프런트(순수 함수 + 테스트) | `frontend-app/src/utils/appliedQuantity.ts`, `.test.ts`, `salesOrderBomReview.ts`, `.test.ts`, `purchaseOrderForm.ts`, `.test.ts`, `bomRequirementReport.ts` |
| 프런트(컴포넌트 + 테스트) | `frontend-app/src/components/SalesOrderUploadModal.tsx`, `StyleShortagePanel.tsx`, `ShortageTable.test.tsx` |
| 보고서 | `prompt-reports/PR-228-report.md` |

**검증 결과**: ① `src/migrations/` 변경 0개, 기존 마이그레이션 파일 수정 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `src/work-orders/utils/`(소요량 계산 유틸·테스트)와 `frontend-app/`(`SalesOrderUploadModal.tsx`/`StyleShortagePanel.tsx`/`appliedQuantity.ts` 등 관련 유틸·테스트)·`prompt-reports/`로 한정 — 저장(mapping-commit.service.ts)·인식 서비스(vision.service.ts)·그 밖의 백엔드 모듈 변경 없음 ⑤ 새 테스트는 전부 합성 값만 쓴 순수 함수 단위테스트(Gemini 호출 없음).

### 로직 변경 여부 확인

1. **계산값 우선 규칙·포장단위 환산 로직 불변**: `material-requirements.util.ts` diff는 신규 타입(`QuantityUnitKind`)·신규 함수(`classifyQuantityUnit`, `isExtremeConsumptionMismatch`) 추가와, 기존 `sheetQtyLooksLikeTotalQtyMisread`에 기본값 있는 4번째 인자(`unitKind = 'unknown'`) 추가에 한정됨 — `basis` 선택 순서·`computedRowQty`·`packaging` 환산 코드는 한 줄도 바뀌지 않았음(diff로 직접 확인).
2. 서버·프런트의 `classifyQuantityUnit`이 **완전히 같은 토큰 집합·같은 분류 규칙**(`COUNT_UNIT_TOKENS`, `LENGTH_UNIT_TOKENS`)으로 복제됨 — diff 비교로 확인.
3. `suggestConsumptionFromSheetQty`는 제안값만 계산해 돌려주고, 실제로 `consumption` 필드에 적용하는 코드(`updateBomItemField` 호출)는 `SalesOrderUploadModal.tsx`의 **버튼 onClick 안에만** 있음(자동 적용 없음) — 총수량 0/null이면 함수가 `null`을 돌려줘 칩 자체가 렌더되지 않음 — 확인.
4. `extremeConsumptionMismatch`가 true면 `suggestStyleLinkedQuantity`/`suggestUnlinkedQuantity`가 `packaging`/`conversionWarning` 분기보다 **먼저** 확인해 `quantity: null`을 돌려줌 — 적용값(`applied.qty`, `row.requiredQty`) 자체는 그대로 계산값 — 확인.
5. 저장 요청 형식(`UpdateBomItem`/`buildCommitResult`)과 DB 컬럼은 diff에 없음 — 변경 없음.

`prompt-reports/PR-228-report.md` 존재 확인. `git merge-tree origin/main origin/fix/handwritten-row-qty-mapping` 결과 충돌 없음(트리 `b698d3e...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(브랜치가 이미 `origin/main`보다 앞서 있어 fast-forward 대상).

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1199 이상, 실패 0 | ✅ **1199/1199** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 648 이상, 실패 0 | ✅ **648/648** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차에 바로 통과**(재시도 불필요) |

병합 커밋이 생기지 않아(fast-forward) 브랜치 push는 하지 않음.

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-228` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `3628b51` |
| 병합 후 main SHA(= 브랜치 head) | `c3caa65` |
| 병합 방식 | `git merge --ff-only fix/handwritten-row-qty-mapping` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `b698d3e...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`3628b51..c3caa65`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live(백엔드 배포 포함), 배포 로그 `No migrations are pending`, `/health` 200, Cloudflare 빌드 성공.
2. **이미 저장된 금속장식 행(요척이 잘못 들어간 행)부터 고친다**: 자재·BOM 조회 > 해당 스타일 선택 > 금속장식 행 "수정" > **단위소요량을 1**로 바꿔 저장. (코드는 기존 저장 데이터를 고치지 않는다.)
3. 발주관리 [A] 부족자재 표에서 그 행의 필요 총수량이 **499**로 보이고 "작지 값이 총수량과 같습니다" 오경고가 사라졌다(단위 EA인 개수 품목).
4. 길이 단위(yd/m) 자재에서 작지 값이 총수량과 같으면 경고가 **계속 보인다**(겉감 등 정상 동작).
5. 수주등록 저장 화면에서 "＋ 자재 행 직접 추가"의 입력칸 라벨이 **"개당 소요량(요척)" / "작지 출고량(총 필요 수량)"**으로 보이고, 작지수량만 넣고 요척을 비워 두면 **"작지 수량 ÷ 총수량 = 1.00을 요척으로 사용할까요? [적용]"** 칩이 보인다. 누르기 전에는 요척이 비어 있다.
6. 요척이 비정상적으로 큰 행에는 "요척이 비정상적으로 보입니다" 강한 경고가 보이고, "이 자재로 발주하기" 후 [B] 수량 칸이 비어 있다.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `c3caa65`
- 변경 파일 수: 13개(`src/work-orders/utils/` 2개, `frontend-app/` 10개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1199/1199, 프런트 648/648, e2e 569/569(1차 `--maxWorkers=2`에서 바로 전부 통과, 재시도 불필요)
- e2e 처리 내역: 재시도 없음(1차 통과)
- 충돌 해결 내역: 없음(브랜치가 이미 origin/main보다 앞서 있어 fast-forward)
- main SHA: 전 `3628b51` → 후 `c3caa65`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
