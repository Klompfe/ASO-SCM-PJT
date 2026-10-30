# MERGE-20 — PR-216 main 반영 보고서

## 결과: 완료 — main push됨, 배포 대기 중

- 병합 전 main SHA: `4a062aa` (MERGE-18 보고서 커밋)
- 병합 후 main SHA: `b8f1670`
- 병합 방식: fast-forward (`git merge --ff-only feat/package-unit-display`) — 충돌 없음, main이 분기점(`4a062aa`)과 동일한 상태였음.
- 변경 파일 수: 7개 (전부 `frontend-app/` + `prompt-reports/`, 백엔드/마이그레이션/패키지 파일 0개)
  - `frontend-app/src/components/BomRequirementReport.tsx`
  - `frontend-app/src/components/MappingPreviewModal.tsx`
  - `frontend-app/src/components/MappingPreviewModalPackaging.test.tsx` (신규)
  - `frontend-app/src/components/StyleShortagePanel.tsx`
  - `frontend-app/src/utils/materialRequirementDisplay.test.ts` (신규)
  - `frontend-app/src/utils/materialRequirementDisplay.ts` (신규)
  - `prompt-reports/PR-216-report.md` (신규)

## 게이트 A (사전 확인)
- `origin/feat/package-unit-display` head = `b8f1670` (사용자 입력 SHA와 일치)
- `git diff --name-only origin/main...origin/feat/package-unit-display` → 위 7개 파일, 전부 범위 내
- `src/migrations/` 변경 0, `package.json`/락 파일 변경 0, `.env*`/엑셀/이미지/`vision-eval-out/` 없음
- `prompt-reports/PR-216-report.md` 존재 확인
- `git merge-tree` 드라이런 — 충돌 없음(main이 분기점과 동일)

## 게이트 B (병합 준비) — 충돌 해결 내역: 없음(충돌 발생하지 않음, main이 분기점과 동일해 "Already up to date")

### 검증 결과 (전/후 동일 — 병합 전후 코드가 같으므로 한 번만 실행)

| 항목 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1057 | ✅ **1057/1057 통과** |
| 프런트 `tsc -b` | 오류 0 | ✅ 오류 없음 |
| 프런트 `vitest run` | 522 | ✅ **522/522 통과** |
| 프런트 `build` | 성공 | ✅ 성공(기존 청크 크기 경고만, 무관) |
| e2e | 558 | ✅ **558/558 통과**(아래 참고) |

### e2e 처리 내역
PR-216 보고서는 e2e가 3회 모두 `beforeAll`의 NestJS 앱 부트스트랩이 Jest 기본 훅 타임아웃(5000ms)을 넘겨 하한(558)에 미달했다고 기록했다(환경 문제, 백엔드 변경 0건이라 PR-216 자체와는 무관하다고 분석). 이번 MERGE-20에서 지시된 규칙대로 **`--maxWorkers=2`로 1차 실행**한 결과 **69개 스위트, 558개 테스트 전부 통과(실패 0)** 했다 — 재발하지 않았으므로 `--maxWorkers=1` 재실행은 필요하지 않았다. (참고: 이전 PR-216 보고서의 타임아웃은 재현성이 낮은 환경 부하성 문제였던 것으로 보인다.)

### 병합 커밋/push
병합이 fast-forward였고(main이 분기점과 동일한 상태였음) 새 병합 커밋이 생기지 않았으므로, 브랜치 자체에는 추가로 push할 것이 없었다(기존 `feat/package-unit-display`가 이미 `origin`에 올라가 있던 그대로).

## 게이트 D (main 반영)
1. `git switch main && git pull --ff-only` — 최신 main이 게이트 A 때와 동일(`4a062aa`)함을 재확인.
2. `git merge --ff-only feat/package-unit-display` — fast-forward 성공, `git rev-parse HEAD^{tree}`가 `feat/package-unit-display^{tree}`와 일치(`e39634b...`) 확인. 프런트 `npm run build` 재실행 — 성공.
3. `git push origin main` — `4a062aa..b8f1670 main -> main` 성공.

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

## 사용자가 확인할 것 (배포 후)
1. Render Live, Cloudflare 빌드 성공.
2. MATERIAL LIST를 올려 미리보기에서: 암홀·다데 테이프와 코아사·오바사에 소수점이 없고 `N롤`/`N콘`으로 보인다. 종류가 모호한 품목은 "종류 확인 필요" 경고가 보인다.
3. 예전에 등록한 스타일의 소요명세서와 부족자재 표에서 `120.0000콘` 같은 소수 표시가 없다.
4. 발주 폼 수량 초기값이 정수이다.

## 그 밖에 사용자가 참고할 것 (PR-216 보고서에서 가져온 열린 사항, 이번 MERGE 대상은 아님)
- 암홀(AMHOL) 포장단위가 DB 시드 50m/롤인데 비해 PR-216 지시서는 100/ROLL로 적혀 있던 불일치 — 마이그레이션 없이 기존 값 그대로 썼으므로, 맞는 값인지 확인 후 필요하면 별도 PR로 수정.
- MATERIAL LIST 파서가 시트의 "단위" 열을 읽지 않아 "단위 확인 필요" 경고는 이번에 구현하지 않음 — 후속 PR 필요.

## 다음 입력
배포 대기 중 — 위 "사용자가 확인할 것" 4가지를 확인한 뒤 알려 주세요. 문제가 있으면 롤백은 자동으로 하지 않으니 지시해 주세요(병합 커밋 revert, force push 금지).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
