# MERGE-15 반영 보고서

지시서: "MERGE-15 — PR-204 병합(자재명 꺾쇠(&lt;&gt;) 미매칭 수정, 마이그레이션 없음, 1단계)" — 사용자가 대화로 전달, 파일 미보관.

대상: 브랜치 `fix/price-reference-angle-bracket-names`, head `d6ce933`.

---

## 병합 전/후 main SHA

- 병합 전 main SHA: `9a08210`(MERGE-14 보고서 커밋)
- 병합 후 main SHA: `d6ce933`
- 병합 방식: `git merge --ff-only fix/price-reference-angle-bracket-names` — **fast-forward**(main이 분기점 이후 달라지지 않아 병합 커밋 자체가 생기지 않음). `git rev-parse HEAD^{tree}`가 `fix/price-reference-angle-bracket-names^{tree}`와 정확히 일치함을 확인(`fd2f303`).

## 변경 파일 (8개, `origin/main...origin/fix/price-reference-angle-bracket-names`)

1. `src/mido-price-table/mido-price-table.service.ts` — 토큰화 로직을 `tokenizeMaterialName()`으로 추출, 구분 문자에 `<>[]{}` 추가
2. `src/mido-price-table/mido-price-table.service.spec.ts` — 꺾쇠/괄호 합성 입력 매칭 수 고정 테스트
3. `src/boms/utils/bom-name-normalize.util.ts` — `normalizeForFuzzyMatch` 제거 문자 집합에 `<`·`>` 추가
4. `src/boms/utils/bom-name-normalize.util.spec.ts` — 꺾쇠/괄호 동일 정규화 테스트
5. `frontend-app/src/components/PriceReferenceBlock.tsx` — `itemName` prop + `shouldShowNoMatchNotice()` 안내 문구
6. `frontend-app/src/components/PriceReferenceBlockLabels.test.tsx` — 안내 표시 조건 5가지 분기 테스트
7. `frontend-app/src/components/PurchaseOrdersManager.tsx` — `itemName` prop 전달 1줄
8. `prompt-reports/PR-204-report.md`(신규)

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**. **DB의 암홀 포장단위(AMHOL)는 아직 50이며 이 병합과 무관하다** — 코드/매칭 로직만 변경.

## 충돌 해결 내역

**없음.** main이 분기점(`9a08210`) 이후 달라지지 않아 `git merge origin/main`이 "Already up to date"였고, main 쪽 반영도 `--ff-only`로 충돌 없이 끝났다(`git merge-tree` dry-run도 CONFLICT 0건).

## 테스트 숫자(전/후)

| 항목 | 직전(MERGE-14 완료 시점) 기준선 | 하한 | 이번 게이트 B 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1002 | 1012 이상 | **1012** |
| e2e(`--maxWorkers=2`) | 557 | 557 이상 | **557** |
| 프런트 `vitest run` | 490 | 495 이상 | **495** |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 배포 참고

이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 **`No migrations are pending`**과 **Live** 상태만 확인하면 된다.

## 사용자가 확인할 것 (배포 후)

1. Render Live, Cloudflare 빌드 성공.
2. 발주관리 > 발주에서 스타일을 연결해 "이 자재로 발주하기"로 `암홀<실크>`를 열면 "단가표 참고(USD)" 블록에 환산 후보가 보인다. **DB의 암홀 포장단위가 아직 50이면 롤당 0.5가 나오는 것이 정상**이고, 관리 화면("자재 포장단위")에서 AMHOL을 100으로 고치면 1.0이 된다.
3. 단가표에 없는 자재(예: 지퍼)를 열면 회색 안내 "단가표에서 이 자재와 맞는 항목을 찾지 못했습니다"가 보이고, 종류 미지정·단위 불일치 경고가 있을 때는 그 경고만 보인다.
