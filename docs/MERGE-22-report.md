# MERGE-22 — PR-218 main 반영 (포장단위 표시·정수 올림 확장, 프런트 전용, 마이그레이션 없음)

대상: `feat/package-unit-display-all`(SHA `733723b`) → `main`

## 게이트 A — 사전 확인

- `origin/feat/package-unit-display-all` head: `733723b97e472c1906c9b7aef0b642f67b9c3010` — 사용자 입력 SHA와 일치.
- `origin/main`: `d50ea8c295f611fa1224d0aee27f6704a91b17ed` — 이번 분기점과 일치(그 뒤로 달라지지 않음).

변경 파일(7개, `git diff --name-only origin/main...origin/feat/package-unit-display-all`):

| 파일 |
|---|
| frontend-app/src/components/ItemsManager.tsx |
| frontend-app/src/components/MappingPreviewModal.tsx |
| frontend-app/src/components/MappingPreviewModalPackaging.test.tsx |
| frontend-app/src/utils/bomRequirementReport.ts |
| frontend-app/src/utils/materialRequirementDisplay.test.ts |
| frontend-app/src/utils/materialRequirementDisplay.ts |
| prompt-reports/PR-218-report.md |

확인 결과: ① `src/`(백엔드) 변경 0개, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지 등 데이터 파일 없음 ④ 변경이 `frontend-app/`(유틸·BomRequirementReport 연동·MappingPreviewModal·ItemsManager와 테스트)와 `prompt-reports/`로 한정됨(그 밖 파일 없음) ⑤ 기존 마이그레이션 파일 수정 0개. `prompt-reports/PR-218-report.md` 존재 확인.

`git merge-base origin/main origin/feat/package-unit-display-all` = `d50ea8c`(= origin/main 현재 tip) — 즉 분기 이후 main에 새 커밋이 없어 **충돌 가능성 자체가 없는 순수 fast-forward**임을 확인(`git merge-tree`로도 충돌 마커 없이 병합됨을 재확인).

## 게이트 B — 병합 준비

- 브랜치 체크아웃 후 `git merge origin/main` → main이 분기점과 같아 **"Already up to date"**(병합 커밋 없음 → push 불필요).
- 전체 검증:

| 항목 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1084 | ✅ 1084/1084 (73 suites) |
| e2e(`--maxWorkers=2`) | 563 | ✅ 563/563 (70 suites) — **1차 실행에서 통과, 재실행 불필요** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 539 | ✅ 539/539 (68 files) |
| 프런트 `build` | 성공 | ✅ 성공 |

숫자 감소 없음, 실패 0. 병합 커밋 없음 → 브랜치 push 생략(지시서 §게이트B-5).

## 게이트 C — 승인

사용자 입력에 `승인: PR-218` 확인 — 통과. (e2e가 1차 실행에서 하한을 충족해 "e2e 판단: 진행" 줄은 필요하지 않았음.)

## 게이트 D — main 반영

- `git switch main && git pull --ff-only` → 게이트 A 때와 동일한 `d50ea8c` 확인.
- `git merge --ff-only feat/package-unit-display-all` → fast-forward. **병합 전 main SHA**: `d50ea8c295f611fa1224d0aee27f6704a91b17ed`, **병합 후(=병합 SHA)**: `733723b97e472c1906c9b7aef0b642f67b9c3010`.
- `git rev-parse HEAD^{tree}`(`ff11ba9acc32a220dfafd464862d3aa9ecd0c403`)가 게이트 B에서 검증한 브랜치 트리와 일치 확인.
- 프런트 `npm run build` 재실행 → 성공.
- `git push origin main` 완료.

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

## 사용자가 확인할 것 (배포 후, Ctrl+F5 강력 새로고침 후)

1. Render Live, 배포 로그에 `No migrations are pending`, Cloudflare Pages 빌드 성공.
2. 스타일 BOM 조회 화면(ItemsManager)에서 암홀·다데·코아사·오바사 필요량이 소수 없이 `N롤`/`N콘`으로 보인다. 종류 미지정 테이프는 "종류 지정 필요" 경고.
3. BOM 소요명세서 엑셀 내보내기를 받아 같은 값이 정수·포장단위로 들어 있다.
4. MATERIAL LIST 업로드 미리보기에서 일반 자재(원단·안감·부자재) 필요량이 정수로 보인다.
5. 소요량 보고서·부족자재 화면은 이전과 같다(회귀 없음).
6. 자재 포장단위 화면(MANAGER/ADMIN)에서 암홀·다데·코아사·오바사 값이 사용자 기준(100/50/2500/4000)과 맞는지 확인하고 다르면 직접 수정(이 PR은 값을 바꾸지 않음) — PR-216·PR-218에서 반복 보고된 **암홀 50M(DB) vs 100M(지시서) 불일치**가 아직 해결되지 않았습니다.

**여기서 멈춤 — 배포 대기 중. 확인 후 알려 주세요.** 롤백은 자동으로 하지 않습니다(문제가 있으면 지시: 병합 커밋 revert, force push 금지).

---

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
