# MERGE-31 — PR-227 main 반영 보고서

대상: 브랜치 `fix/bom-lookup-qty-unit-edit` (head `305242e`, 사용자 입력 SHA와 일치). 백엔드 변경 0, 마이그레이션 0, DB 변경 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/fix/bom-lookup-qty-unit-edit` = `305242e`(일치). 코드+테스트 커밋 `39f28a0`, 보고서 커밋 `305242e` 둘 다 확인.
- `origin/main` = `f925d27`(MERGE-30 보고서 커밋). `docs/MERGE-30-report.md`가 `origin/main`에 존재함을 확인(MERGE-30이 먼저 반영된 뒤 실행하라는 전제 충족).

### 변경 파일 (`git diff --name-only origin/main...origin/fix/bom-lookup-qty-unit-edit`, 5개)

| 구분 | 파일 |
|---|---|
| 프런트(API 타입) | `frontend-app/src/api/boms.service.ts` |
| 프런트(컴포넌트) | `frontend-app/src/components/ItemsManager.tsx` |
| 프런트(신규 순수함수+테스트) | `frontend-app/src/utils/bomQtyReason.ts`, `.test.ts` |
| 보고서 | `prompt-reports/PR-227-report.md` |

**검증 결과**: ① `src/` 아래 백엔드 파일 변경 **0개**, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `frontend-app/`과 `prompt-reports/`로 한정 — `appliedQuantity.ts`·`SalesOrderUploadModal.tsx`·`StyleShortagePanel.tsx`·공용 컴포넌트는 **수정되지 않음**(diff에 없음, import만 추가해 재사용) ⑤ 기존 마이그레이션 파일 수정 0개.

### `ItemsManager.tsx` diff 확인

1. 단위 저장: 기존 `PATCH /items/:id`(`updateItem`)만 사용, 단위가 실제로 바뀌었을 때만(`isUnitChanged`) `window.confirm(UNIT_CHANGE_CONFIRM_TEXT)` 확인창 — 확인.
2. 소요수량: `it.requiredQty`(저장값) 자체를 바꾸는 코드 없음, 입력칸도 추가되지 않음(계산값이므로 읽기 전용 그대로) — 칸 아래 "계산 근거(참고)"만 추가 — 확인.
3. "계산 근거(참고)"는 `appliedQuantity.ts`의 기존 `resolveAppliedQuantity`를 **import해서 호출만** 함 — 계산 로직 복제·변경 없음 — 확인.
4. 기존 `formatBomItemQty`/`bomItemQtyDisplay`(PR-218, 포장단위 N롤/N콘·정수 올림)는 수정되지 않고 그대로 호출 — 확인.

`prompt-reports/PR-227-report.md` 존재 확인. `git merge-tree origin/main origin/fix/bom-lookup-qty-unit-edit` 결과 충돌 없음(트리 `d891ebe...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(브랜치가 이미 `origin/main`보다 앞서 있어 병합 커밋 불필요, fast-forward 대상).

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1185 이상, 실패 0 | ✅ **1185/1185** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 628 이상, 실패 0 | ✅ **628/628** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차에 바로 통과**(재시도 불필요) |

병합 커밋이 생기지 않아(fast-forward) 브랜치 push는 하지 않음.

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-227` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `f925d27` |
| 병합 후 main SHA(= 브랜치 head) | `305242e` |
| 병합 방식 | `git merge --ff-only fix/bom-lookup-qty-unit-edit` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `d891ebe...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`f925d27..305242e`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후, 자재·BOM 조회 화면)

1. Render Live, Cloudflare 빌드 성공(프런트 전용이라 Render는 `No migrations are pending`만 확인).
2. 자재 표에 **"단위" 열**이 있다.
3. 행의 "수정"에서 **단위를 입력/선택**해 저장하면 "단위는 자재(품목) 마스터 값입니다 … 모든 스타일에 적용됩니다" 확인창이 뜬다. 저장 후 실·테이프 행의 "단위 확인 필요(EA ↔ M)" 경고와 N롤/N콘 표시가 갱신된다.
4. 소요수량이 0인 행에는 숫자 0 대신 **이유 문구**(예: 총수량 미입력 / 저장 당시 수량 기준값 없음)가 보이고, 마우스를 올리면 어디서 고치는지 안내가 나온다. 진짜 0인 행은 0으로 보인다.
5. 소요수량 칸 아래에 **"계산 근거(참고)"**가 보인다(총수량 × 요척 등, 지금 규칙으로 계산한 값). 저장된 소요수량은 바뀌지 않는다.
6. 소요수량 **입력칸은 없다**(계산값이므로 의도된 것). 필요하면 "수동 덮어쓰기" 설계 제안은 `prompt-reports/PR-227-report.md`를 본다.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `305242e`
- 변경 파일 수: 5개(`frontend-app/` 4개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1185/1185, 프런트 628/628, e2e 569/569(1차 `--maxWorkers=2`에서 바로 전부 통과, 재시도 불필요)
- e2e 처리 내역: 재시도 없음(1차 통과)
- 충돌 해결 내역: 없음(브랜치가 이미 origin/main보다 앞서 있어 fast-forward)
- main SHA: 전 `f925d27` → 후 `305242e`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
