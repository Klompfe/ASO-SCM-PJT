# MERGE-30 — PR-226 main 반영 보고서

대상: 브랜치 `fix/applied-qty-computed-first-lot-sum` (head `f5c2bd7`, 사용자 입력 SHA와 일치). 마이그레이션 0, DB 변경 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/fix/applied-qty-computed-first-lot-sum` = `f5c2bd7`(일치). 코드+테스트 커밋 `aaa8059`, 보고서 커밋 `f5c2bd7` 둘 다 확인.
- `origin/main` = `a1b76df`(MERGE-29 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/fix/applied-qty-computed-first-lot-sum`, 17개)

| 구분 | 파일 |
|---|---|
| 백엔드(소요량 계산) | `src/work-orders/utils/material-requirements.util.ts`, `.spec.ts` |
| 백엔드(비전 서비스) | `src/sales-orders/vision.service.ts`, `.spec.ts` |
| 백엔드(DTO) | `src/sales-orders/dto/ai-analysis.dto.ts` |
| 백엔드(신규 유틸) | `src/sales-orders/utils/required-qty-lots.util.ts`, `.spec.ts` |
| 프런트(순수 함수) | `frontend-app/src/utils/appliedQuantity.ts`, `.test.ts`, `salesOrderBomReview.ts`, `.test.ts`, `bomRequirementReport.ts` |
| 프런트(컴포넌트) | `frontend-app/src/components/SalesOrderUploadModal.tsx`, `StyleShortagePanel.tsx`, `ShortageTable.test.tsx` |
| 프런트(API 타입) | `frontend-app/src/api/salesOrders.service.ts` |
| 보고서 | `prompt-reports/PR-226-report.md` |

**검증 결과**: ① `src/migrations/` 변경 0개, 기존 마이그레이션 파일 수정 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `src/work-orders/`(소요량 계산 유틸)·비전 서비스(`vision.service.ts`)/타입·`frontend-app/`(`appliedQuantity.ts`/`StyleShortagePanel.tsx`/`SalesOrderUploadModal.tsx` 관련)·`prompt-reports/`로 한정됨 — `purchase-orders`/`mapping-commit.service.ts` 변경 없음 ⑤ 새 테스트는 전부 합성 fixture만 사용(Gemini 호출 없음, `stubGenerateContent` 패턴).

### 로직 변경 여부 확인

1. `material-requirements.util.ts`: 우선순위가 **계산값(색상수량표 합계×요척 또는 총수량×요척) → 작지 값(계산값이 없을 때만)**으로 바뀌었고, 색상 있는데 근거 없으면 그대로 `needsColorQty`(숫자 없음) — `frontend-app/src/utils/appliedQuantity.ts`가 **완전히 같은 순서**로 복제됨(diff 비교로 확인: `isCommonColor → colorQtyValue → unitMatches → unknown` 순서 동일).
2. `sumRequiredQtyLots`: 단위 불일치는 LOT별 단위 필드 자체가 스키마에 없어 프롬프트로만 방지(보고서에 알려진 한계로 기재됨), 소수 2자리 반올림(`round2`) 확인, 개수 상한 10·음수·NaN 제외 확인.
3. `vision.service.ts` 프롬프트: "출고량 칸의 값만", "①②③도 LOT 구분자", "소수 둘째 자리" 문구 추가 확인. `requiredQtyLots` 스키마 필드는 `nullable: true`이고 `bomItems`의 `required: ['itemName']`에 포함되지 않음 — **없어도 업로드 성공**(테스트로 확인됨).
4. 저장(commit) 경로: `sheetQty`는 여전히 `requiredQty`(서버가 LOT 합산한 값)를 그대로 받는 기존 PR-220 경로 그대로, `requiredQtyLots` 자체는 `buildCommitResult`가 `bomItems`에서 제외해 저장되지 않음 — DB 컬럼 변경 없음.
5. 바뀐 기존 테스트: **0개**(diff 확인 결과 두 스펙 파일 모두 import 줄만 변경, 기존 assertion 전부 무수정) — "작지 값 우선 전제 테스트"조차 건드리지 않고 새 테스트만 추가했음(기존 테스트들이 전부 "계산값 없음" 케이스만 다뤄 우선순위 변경과 무관했기 때문).

`prompt-reports/PR-226-report.md` 존재 확인. `git merge-tree origin/main f5c2bd7` 결과 충돌 없음(트리 `cfc2405...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1185 이상, 실패 0 | ✅ **1185/1185** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 619 이상, 실패 0 | ✅ **619/619** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ❌ 1차 21건 실패(2개 스펙 — `search-select-audit-followup-flow`, 500 에러) |
| e2e(`--maxWorkers=1`, 재시도) | 569 중 실패 0 | ✅ **569/569 — 재시도에서 전부 통과** |

**1차 `--maxWorkers=2` 실행에서 21건 실패(2개 스펙 파일, 모두 `POST /items` 호출이 500 Internal Server Error로 실패)했으나, 이 브랜치가 `src/items/`를 전혀 건드리지 않았고(`git diff --stat` 범위에 없음) 같은 테스트를 `--maxWorkers=1`로 단독 재실행하자 100% 통과했다 — 리소스 경합(여러 e2e 스펙이 동시에 품목 코드 등 공유 자원을 만들며 충돌)으로 판단, 코드 회귀가 아니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-226` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `a1b76df` |
| 병합 후 main SHA(= 브랜치 head) | `f5c2bd7` |
| 병합 방식 | `git merge --ff-only fix/applied-qty-computed-first-lot-sum` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `cfc2405...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`a1b76df..f5c2bd7`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live(백엔드 배포 포함), 배포 로그 `No migrations are pending`, `/health` 200, Cloudflare 빌드 성공.
2. **이미 저장된 스타일 MB73SLM109Z**의 발주관리 > 발주 탭 [A] 부족자재 표에서 겉감 필요량이 **계산값(총수량 499 × 요척 1.52 = 758.48 → 정수 올림 759 yd)**으로 보인다(작지 값 499가 아님). 근거 `title`에 계산식이 보인다. (Gemini 호출 없음 — 저장된 데이터를 새 규칙으로 읽는 확인이다.)
3. 작지 수량이 없는 다른 자재(색상 N/A 일반 자재)는 이전과 같다.
4. 작지 값과 계산값이 5% 넘게 다른 행에는 빨간 안내 "계산값 N 적용 · 작지 값 M(LOT 합산)와 차이 P% — 확인"이 보인다. 작지 값이 총수량과 같은 행에는 "출고량 칸이 아닌 수량을 읽었을 수 있습니다"가 붙는다.
5. **LOT 합산 실제 확인은 Gemini 1회 호출이 필요하다** — **사용자가 별도로 승인할 때만** 같은 작지(겉감 LOT 2줄)를 수주등록으로 다시 올려, 겉감 작지수량이 LOT 합계(≈760.08)로 읽히고 "발주수량(적용)"이 계산값과 같으며 경고가 없는지 본다. 승인 전에는 올리지 않는다.
6. 스타일 관리에서 이 스타일의 총수량이 499로 저장되어 있는지(계산값 기준값).

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `f5c2bd7`
- 변경 파일 수: 17개(`src/work-orders/` 2개, `src/sales-orders/` 5개, `frontend-app/` 9개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1185/1185, 프런트 619/619, e2e 569/569(1차 `--maxWorkers=2`에서 21건 실패 → `--maxWorkers=1` 재시도로 전부 통과)
- e2e 처리 내역: 1차 실패는 리소스 경합(이 브랜치가 건드리지 않은 `src/items/` 관련 500 에러, 공유 자원 충돌) — 단독 재실행(사실상 `--maxWorkers=1` 전체 재실행)으로 100% 통과 확인, 코드 회귀 아님
- 충돌 해결 내역: 없음(main이 분기점과 동일, Already up to date)
- main SHA: 전 `a1b76df` → 후 `f5c2bd7`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
