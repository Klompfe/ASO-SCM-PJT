# MERGE-13 반영 보고서

지시서: "MERGE-13 — PR-202 병합(암홀테이프 포장단위 100M/롤, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `fix/amhol-tape-unit-100m`, head `ee36df5`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `06e1a64`(MERGE-12 보고서 커밋)
- 병합 후 main SHA: `ee36df5`
- 병합 방식: `git merge --ff-only fix/amhol-tape-unit-100m` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `fix/amhol-tape-unit-100m^{tree}`와 정확히 일치함을 확인(`fc96e1d`).

## 변경 파일 (5개, `origin/main...origin/fix/amhol-tape-unit-100m`)

1. `frontend-app/src/components/ItemsManager.tsx` — 하드코딩 드롭다운 "암홀 (50M/롤)" → "암홀 (100M/롤)"
2. `frontend-app/src/components/SalesOrderUploadModal.tsx` — 같은 변경
3. `frontend-app/src/components/tapePackagingUnitLabels.test.ts`(신규) — 위 두 파일 소스 텍스트 회귀 테스트
4. `src/boms/utils/thread-cone-price.util.spec.ts` — 순수 포맷 테스트 픽스처 AMHOL 50→100
5. `prompt-reports/PR-202-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**. **DB의 실제 `AMHOL` 값은 이 병합으로 바뀌지 않는다**(코드/문구만 변경).

## 충돌 해결 내역

**없음.** main이 분기점(`06e1a64`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(MERGE-12 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1002 | 1002 이상 | **1002** |
| e2e(`--maxWorkers=2`) | 555 | 555 이상 | **555** |
| 프런트 `vitest run` | 485 | 487 이상 | **487** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. 작지 분석 검토 화면의 테이프 행 포장단위 드롭다운에 **"암홀 (100M/롤)"**, **"다데 (50M/롤)"**이 보인다. 품목 화면(`ItemsManager`)의 같은 선택지도 같다.
3. **DB 값은 이 병합으로 바뀌지 않는다.** 병합·배포 확인 후 별도 안내(관리 화면 "자재 포장단위"에서 `AMHOL` 행을 50 → 100으로 고치는 순서, `prompt-reports/PR-202-report.md` 1-(e) 참고)에 따라 DB를 고치기 전까지는, 화면 표시는 100M/롤이지만 롤 수·가격 환산 계산은 여전히 DB의 50을 쓴다(지금과 같은 상태).
