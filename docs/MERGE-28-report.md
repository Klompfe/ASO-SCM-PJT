# MERGE-28 — PR-225 main 반영 보고서

대상: 브랜치 `feat/mapping-preview-manual-row` (head `9ec88cf`, 사용자 입력 SHA와 일치). 백엔드 변경 0, 마이그레이션 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/mapping-preview-manual-row` = `9ec88cf`(일치). 코드+테스트 커밋 `8f9da76`, 보고서 커밋 `9ec88cf` 둘 다 확인.
- `origin/main` = `bb290f7`(MERGE-27 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/mapping-preview-manual-row`, 4개)

| 구분 | 파일 |
|---|---|
| 프런트(컴포넌트) | `frontend-app/src/components/SalesOrderUploadModal.tsx` |
| 프런트(순수 함수) | `frontend-app/src/utils/salesOrderBomReview.ts`, `.test.ts` |
| 보고서 | `prompt-reports/PR-225-report.md` |

**검증 결과**: ① `src/` 아래 백엔드 파일 변경 **0개**, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `frontend-app/`과 `prompt-reports/`로 한정됨 ⑤ 기존 마이그레이션 파일 수정 0개.

### 로직 변경 여부 확인

`SalesOrderUploadModal.tsx`/`salesOrderBomReview.ts` diff를 읽은 결과: 직접 추가 행은 `appendBomItem`(PR-223 `appendBomItemFromCandidate`가 위임하는 공통 경로)을 그대로 타고, `buildCommitResult`(저장 요청 형식)는 이 diff에 전혀 등장하지 않음(수정 없음) — 서버로 가는 저장 요청 형식 변경 없음. 인식된 원본 행은 `isManual` 게이트로 삭제 버튼이 안 붙고 기존 "제외" 체크만 유지됨 — 기존 동작 불변 확인.

`prompt-reports/PR-225-report.md` 존재 확인. `git merge-tree origin/main 9ec88cf` 결과 충돌 없음(트리 `ce8f723...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1156 이상, 실패 0 | ✅ **1156/1156** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 589 이상, 실패 0 | ✅ **589/589** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-225` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `bb290f7` |
| 병합 후 main SHA(= 브랜치 head) | `9ec88cf` |
| 병합 방식 | `git merge --ff-only feat/mapping-preview-manual-row` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `ce8f723...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`bb290f7..9ec88cf`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live, Cloudflare 빌드 성공(프런트 전용이라 Render는 `No migrations are pending`만 확인).
2. 수주등록에서 작지를 올려 저장 화면이 뜨면 자재명세 표 **아래에 "＋ 자재 행 직접 추가"** 버튼이 있다(손글씨 후보가 없어도 보임).
3. 눌러서 `금속장식` / 규격 `내경 10φ`를 입력하면 **"수기 입력" 배지**가 붙고 마스터 대조 안내(새 이름)가 나온다. 수량·단위를 넣으면 "발주수량(적용)"이 계산된다.
4. 직접 추가한 행에는 "삭제" 버튼이 있고, 인식된 원본 행에는 새 삭제 버튼이 없다.
5. 손글씨 후보가 0건이면 회색 안내 한 줄이 보인다.
6. **저장은 스타일 중복 판단(비슷한 스타일 안내)을 마친 뒤에** 한다. 저장 후 자재·BOM 조회에서 그 자재가 나오는지 본다.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `9ec88cf`
- 변경 파일 수: 4개(전부 `frontend-app/`, `prompt-reports/`)
- 테스트 숫자: 백엔드 1156/1156, 프런트 589/589, e2e 569/569(1차 통과)
- e2e 처리 내역: `--maxWorkers=2` 1차 실행에서 전부 통과, 재실행 불필요
- 충돌 해결 내역: 없음(main이 분기점과 동일, Already up to date)
- main SHA: 전 `bb290f7` → 후 `9ec88cf`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
