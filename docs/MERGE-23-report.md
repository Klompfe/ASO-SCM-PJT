# MERGE-23 — PR-219 반영 보고서

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `6b9dd36` |
| 병합 후 main SHA | `767cf78` |
| 병합 방식 | fast-forward (`git merge --ff-only feat/po-form-reference`) — 병합 커밋 없음 |
| 변경 파일 수 | 17개(+141줄 보고서 포함), 901 insertions / 51 deletions |
| 마이그레이션 | 0건 |

이 PR 은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending` 과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 된다.

## 게이트 결과

- **게이트 A**(사전 확인): `origin/feat/po-form-reference` head = `767cf78`(사용자 입력 SHA와 일치). `git diff --name-only origin/main...origin/feat/po-form-reference` 로 변경 파일 확인 — `src/migrations/` 0건, `package.json`/락 파일 0건, `.env*`·엑셀·이미지·`vision-eval-out/` 없음, 기존 마이그레이션 파일 수정 0건. `git merge-tree`(dry-run) 결과 충돌 없음(`merged` 로만 표시).
  - **참고**: 서버 변경 범위가 지시서의 "발주·단가표 참고·실/테이프 추천 유틸" 외에 `src/work-orders/utils/material-requirements.util.ts`(BOM 소요량 계산, [A] 부족자재 표의 `suggestedPackaging` 계산)도 포함됐고, 프런트도 `frontend-app/src/api/purchaseOrders.service.ts`(styleNo 파라미터 전달용 API 래퍼)가 포함됐다. 둘 다 PR-219 보고서에 명시된 [A]/[B] 기능 구현에 직접 필요한 파일이라(지시서의 "내용" 설명과 일치) 스코프 위반으로 보지 않고 진행했다 — 사용자가 다르게 판단하면 알려달라.
- **게이트 B**(병합 준비): 브랜치에서 `git merge origin/main` → main 이 분기점과 동일해 "Already up to date". 충돌 없음.
  - 백엔드 `npm run build`: 성공. `jest`(전체): **1100/1100** 통과(하한 1100 충족).
  - 프런트 `tsc -b`: 통과. `vitest run`: **548/548** 통과(하한 548 충족). `npm run build`: 성공.
  - e2e(`--maxWorkers=2`): **564/564** 통과 — **1차 실행에서 하한(564) 충족, 재실행 불필요**.
  - 병합 커밋이 생기지 않아(이미 최신) 브랜치 push 안 함.
- **게이트 C**(승인): 사용자 입력에 `승인: PR-219` 확인 — 통과. (e2e가 1차 실행에서 하한을 충족해 "e2e 판단: 진행" 줄은 필요하지 않았음.)
- **게이트 D**(main 반영): `git switch main && git pull --ff-only` → `6b9dd36`(게이트 A 때와 동일, 변화 없음). `git merge --ff-only feat/po-form-reference` → fast-forward, HEAD `767cf78`(브랜치 head와 트리까지 동일). 프런트 `npm run build` 재실행 — 성공. `git push origin main` 완료.

## 테스트 숫자(전/후)

| 구분 | MERGE-22 기준 | MERGE-23(이번) |
|---|---|---|
| 백엔드 `jest` | 1084 | **1100** |
| e2e(`--maxWorkers=2`) | 563 | **564**(1차 통과) |
| 프런트 `vitest run` | 539 | **548** |

## 충돌 해결 내역

없음 — main 이 분기점(`6b9dd36`)에서 전혀 움직이지 않아 순수 fast-forward.

## 사용자가 확인할 것

1. Render 배포 로그에서 `No migrations are pending` + Live 상태, Cloudflare Pages 빌드 성공, `/health` 200.
2. (배포 완료 후, 브라우저 Ctrl+F5) 자재·발주 > 발주관리 > 발주 탭에서:
   - [B]에서 단가 0으로 "발주 생성" → 버튼 근처 빨간 안내 + 단가 칸 빨간 테두리(시험용 자재로, 실제 발주가 생성되지 않도록 단가 입력 전 취소).
   - 종류 미지정 실 품목(예: 오바사 계열) 선택 → 추천 종류/근거, 콘 수 참고값, 단가표 참고(USD)가 자동 입력 없이 "이 값 사용" 버튼과 함께 보이는지.
   - 본봉+배색이 함께 들어간 이름 → 코아사 추천 + "확인 필요" 표시.
   - [A] 부족자재 표에서 종류 미지정 실의 부족 수량이 더 이상 비정상적으로 크지 않고 "참고" 또는 "종류 확인 필요"로 보이는지.
   - 이미 종류가 지정된 암홀·다데·코아사·오바사 품목의 [A] 표시가 기존(PR-216/218)과 동일한지(회귀 없음).
   - "이 종류로 품목에 저장"은 MANAGER/ADMIN 계정에서만 동작 — 실제 품목 종류가 바뀌므로 확실한 테스트 품목에서만 사용.

**여기서 멈춤 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).
