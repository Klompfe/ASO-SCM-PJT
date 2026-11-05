# MERGE-26 — PR-222 main 반영 보고서

대상: 브랜치 `feat/mapping-preview-applied-qty` (head `734bbed`, 사용자 입력 SHA와 일치). 백엔드 변경 0, 마이그레이션 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/mapping-preview-applied-qty` = `734bbed`(일치). 코드+테스트 커밋 `ecedd22`, 보고서 커밋 `734bbed` 둘 다 확인.
- `origin/main` = `de315bf`(MERGE-25 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/mapping-preview-applied-qty`, 5개)

| 구분 | 파일 |
|---|---|
| 프런트(API) | `frontend-app/src/api/styles.service.ts` |
| 프런트(컴포넌트) | `frontend-app/src/components/SalesOrderUploadModal.tsx` |
| 프런트(신규 유틸) | `frontend-app/src/utils/appliedQuantity.ts` |
| 프런트(신규 유틸 테스트) | `frontend-app/src/utils/appliedQuantity.test.ts` |
| 보고서 | `prompt-reports/PR-222-report.md` |

**검증 결과**: ① `src/` 아래 백엔드 파일 변경 **0개**, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `frontend-app/`과 `prompt-reports/`로 한정됨 ⑤ 기존 마이그레이션 파일 수정 0개.

### 로직 변경 여부 확인

`SalesOrderUploadModal.tsx` diff를 읽은 결과, 기존 입력칸("작지수량" `bom-sheet-qty-${index}-${i}`)의 `onChange`/값·"계산값" 회색 글씨·경고 문구·저장 로직(`handleSave`/`commitSalesOrderAnalysis`)은 전혀 건드리지 않았고, 추가된 것은 **읽기 전용 새 `<td>`(발주수량/적용) + 표 위 요약 줄 + 조회용 state/useEffect(색상×사이즈 수량표, 포장단위 규칙, 기존 자재 단위)뿐**이다. 새 순수 함수 `resolveAppliedQuantity`/`buildColorQtyMap`(`appliedQuantity.ts`)은 서버 `material-requirements.util.ts`를 호출하거나 수정하지 않고 같은 규칙을 프런트에 복제만 했다. 계산값을 작지수량 입력칸에 자동으로 써 넣는 코드는 없음(새 `<td>`에만 표시). 계산/저장 로직 변경 없음.

`prompt-reports/PR-222-report.md` 존재 확인. `git merge-tree origin/main 734bbed` 결과 충돌 없음(트리 `ec7f259...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1143 이상, 실패 0 | ✅ **1143/1143** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 575 이상, 실패 0 | ✅ **575/575** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-222` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `de315bf` |
| 병합 후 main SHA(= 브랜치 head) | `734bbed` |
| 병합 방식 | `git merge --ff-only feat/mapping-preview-applied-qty` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `ec7f259...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`de315bf..734bbed`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live, 배포 로그에 `No migrations are pending`, Cloudflare Pages 빌드 성공.
2. 수주등록에서 작지를 올려 저장 화면이 뜨면 자재명세 표에 읽기 전용 "발주수량(적용)" 열이 있다. 작지수량 칸이 비어 있던 행에도 정수·포장단위로 값이 보이고, 근거 배지(작지 / 색상수량표 / 계산)가 보인다.
3. 배지에 마우스를 올리면 계산식이 보인다.
4. 색상은 있는데 근거가 없는 행은 숫자 없이 "색상별 수량 확인 필요"만 보인다.
5. 작지수량 칸을 고치면 적용 열이 바뀌고, 입력칸에는 계산값이 자동으로 들어가지 않는다.
6. 표 위에 "기획수량 N · 적용수량 확정 X/Y · 색상별 수량 확인 필요 Z" 한 줄이 보인다.
7. **알려진 차이**: 마스터에 아직 없는 새 자재는 단위를 알 수 없어, 저장 전 초안에서는 작지수량 근거를 건너뛰고 다음 순위(색상수량표·계산)로 표시될 수 있다. 저장 후 발주관리 [A] 부족자재 표의 필요량과 비교해 다른 행이 있으면 알려 달라.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `734bbed`
- 변경 파일 수: 5개(전부 `frontend-app/`, `prompt-reports/`)
- 테스트 숫자: 백엔드 1143/1143, 프런트 575/575, e2e 569/569(1차 통과)
- e2e 처리 내역: `--maxWorkers=2` 1차 실행에서 전부 통과, 재실행 불필요
- 충돌 해결 내역: 없음(main이 분기점과 동일, Already up to date)
- main SHA: 전 `de315bf` → 후 `734bbed`
- 사용자에게 필요한 다음 입력: 배포 확인(위 7개 항목) 후 결과 알림
