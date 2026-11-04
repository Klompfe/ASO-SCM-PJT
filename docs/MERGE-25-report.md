# MERGE-25 — PR-221 main 반영 보고서

대상: 브랜치 `feat/mapping-preview-wide-layout` (head `a9901bd`, 사용자 입력 SHA와 일치). 백엔드 변경 0, 마이그레이션 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/mapping-preview-wide-layout` = `a9901bd`(일치). 코드+테스트 커밋 `6b2e1be`, 보고서 커밋 `a9901bd` 둘 다 확인.
- `origin/main` = `be9b22d`(MERGE-24 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/mapping-preview-wide-layout`, 5개)

| 구분 | 파일 |
|---|---|
| 프런트(컴포넌트) | `frontend-app/src/components/SalesOrderUploadModal.tsx` |
| 프런트(테스트) | `frontend-app/src/components/SalesOrderUploadModal.test.tsx` |
| 프런트(신규 유틸) | `frontend-app/src/utils/warningChips.ts` |
| 프런트(신규 유틸 테스트) | `frontend-app/src/utils/warningChips.test.ts` |
| 보고서 | `prompt-reports/PR-221-report.md` |

**검증 결과**: ① `src/` 아래 백엔드 파일 변경 **0개**, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `frontend-app/`과 `prompt-reports/`로 한정됨 ⑤ 기존 마이그레이션 파일 수정 0개.

### 로직 변경 여부 확인

`SalesOrderUploadModal.tsx` diff를 읽은 결과, 경고 6종(`isNewMaterial`/`requiredQtyMismatch`/`duplicateLooking`/`unknownName`/`yocheokMismatch`/`duplicateWarning`)의 **문구·분류(색상)·순서·버튼 onClick(`updateBomItemField`, `setExcludedBomIndexes`)은 전혀 바뀌지 않았고**, 모달 폭 클래스(`max-w-4xl`→`max-w-[1680px]`)·열 `min-width`·경고를 세로 `<div>` 쌓기에서 `flex flex-wrap` 칩 + 3개 초과 시 접기로 바꾼 표시 방식만 변경되었습니다. 계산/저장/검증 로직 변경 없음.

`prompt-reports/PR-221-report.md` 존재 확인. `git merge-tree origin/main a9901bd` 결과 충돌 없음(트리 `f716ea2...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1143 이상, 실패 0 | ✅ **1143/1143** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 566 이상, 실패 0 | ✅ **566/566** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-221` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `be9b22d` |
| 병합 후 main SHA(= 브랜치 head) | `a9901bd` |
| 병합 방식 | `git merge --ff-only feat/mapping-preview-wide-layout` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `f716ea2...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`be9b22d..a9901bd`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live, 배포 로그에 `No migrations are pending`, Cloudflare Pages 빌드 성공.
2. 수주등록에서 작지를 올려 저장 화면이 뜨면 창이 화면 폭 대부분을 쓴다.
3. 자재명세 표 맨 오른쪽 "확인 필요" 열이 세로로 길게 늘어나지 않고, 경고가 가로 칩으로 흐른다.
4. 경고가 3개를 넘는 행은 처음 2개와 "+N"이 보이고, 클릭하면 펼쳐진다.
5. 입력칸(작지수량·단위·공급사·실/테이프 종류)과 저장 버튼 동작은 이전과 같다.
6. 작은 노트북 화면(약 1366px)에서도 가로 스크롤이 과하지 않다.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `a9901bd`
- 변경 파일 수: 5개(전부 `frontend-app/`, `prompt-reports/`)
- 테스트 숫자: 백엔드 1143/1143, 프런트 566/566, e2e 569/569(1차 통과)
- e2e 처리 내역: `--maxWorkers=2` 1차 실행에서 전부 통과, 재실행 불필요
- 충돌 해결 내역: 없음(main이 분기점과 동일, Already up to date)
- main SHA: 전 `be9b22d` → 후 `a9901bd`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
