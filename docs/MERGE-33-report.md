# MERGE-33 — PR-229 main 반영 보고서

대상: 브랜치 `feat/bom-lookup-live-required-qty` (head `dd0d087`, 사용자 입력 SHA와 일치). 마이그레이션 0, DB 변경 0, 백엔드 변경 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/bom-lookup-live-required-qty` = `dd0d087`(일치). 코드+테스트 커밋 `83776ff`, 보고서 커밋 `dd0d087` 둘 다 확인.
- `origin/main` = `7c06c56`(MERGE-32 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/bom-lookup-live-required-qty`, 4개)

| 구분 | 파일 |
|---|---|
| 프런트(컴포넌트) | `frontend-app/src/components/ItemsManager.tsx` |
| 프런트(순수 함수 + 테스트) | `frontend-app/src/utils/bomQtyReason.ts`, `.test.ts` |
| 보고서 | `prompt-reports/PR-229-report.md` |

**검증 결과**: ① `src/` 백엔드 파일 변경 0개, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경이 `frontend-app/`(`ItemsManager.tsx`, `bomQtyReason.ts`+테스트)와 `prompt-reports/`로 한정됨 — `appliedQuantity.ts`·`SalesOrderUploadModal.tsx`·`StyleShortagePanel.tsx`·`material-requirements.util.ts`는 **수정되지 않음**(diff에 없음, PR-226/228 로직을 읽어서 재사용만 함) ⑤ 기존 마이그레이션 파일 수정 0개.

### 로직 변경 여부 확인 (`ItemsManager.tsx` diff 한 줄씩)

1. **소요수량 주 값이 `resolveAppliedQuantity` 재사용인지**: `bomItemApplied()`가 PR-227 때와 **완전히 같은 인자**(`consumption`, `totalQty`, `sheetQty`, `sheetQtyUnit`, `itemUnit`, `colorCode`, `colorQtyMap`)로 `resolveAppliedQuantity`를 호출 — 새 계산 공식 없음, 복제 없음.
2. **스냅샷을 DB에 쓰는 호출 없음**: diff에 `updateItem`/API 쓰기 호출 추가 없음 — 조회 화면은 읽기만 한다.
3. **포장단위(N롤/N콘)·정수 올림 로직(`formatBomItemQty`) 불변**: 함수 자체는 import된 그대로 — 입력만 `it.requiredQty`에서 `applied.qty`(또는 스냅샷 비교용으로 `it.requiredQty`)로 바뀌었을 뿐, 내부 로직은 손대지 않음.
4. **PR-227의 단위 열·수정 모드 단위 저장 유지**: diff 범위 밖(단위 `<th>`/`<input list="bom-unit-options">`/`handleUpdateBomItem`의 단위 변경 확인 로직)에 변경 없음 — 그대로 유지.
5. **BOM 소요명세서 엑셀 내보내기**: `prompt-reports/PR-229-report.md` 1-2절에 "별도 엑셀 내보내기 함수 없음, `BomRequirementReport.tsx`가 이미 서버 실시간 계산(`work-orders` API)을 쓰고 있어 이번 PR과 어긋날 일이 없음 — 미적용(해당 없음)"으로 명시돼 있음. 코드 diff에도 `BomRequirementReport.tsx`/엑셀 관련 파일 변경 없음 — 보고서 설명과 diff가 일치함을 확인.

`prompt-reports/PR-229-report.md` 존재 확인. `git merge-tree origin/main origin/feat/bom-lookup-live-required-qty` 결과 충돌 없음(트리 `52f25d1c...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(브랜치가 이미 `origin/main`보다 앞서 있어 fast-forward 대상).

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1199 이상, 실패 0 | ✅ **1199/1199** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 666 이상, 실패 0 | ✅ **666/666** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차에 바로 통과**(재시도 불필요) |

병합 커밋이 생기지 않아(fast-forward) 브랜치 push는 하지 않음.

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-229` 확인 — 진행. (e2e가 1차에 하한을 충족해 "e2e 판단" 입력은 필요하지 않았음.)

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `7c06c56` |
| 병합 후 main SHA(= 브랜치 head) | `dd0d087` |
| 병합 방식 | `git merge --ff-only feat/bom-lookup-live-required-qty` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `52f25d1c...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`7c06c56..dd0d087`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후, 자재·BOM 조회 화면)

1. Render Live, 배포 로그 `No migrations are pending`, Cloudflare 빌드 성공(프런트 전용).
2. 라벨류(CARE LABEL 등, 단위 EA, 요척 1)의 소요수량이 **"저장된 값 0(다시 저장 필요)" 대신 499**(또는 해당 스타일 총수량)로 보인다. 저장 당시 값이 계산값과 다르면 작은 회색 "저장 당시 값 N"이 보인다.
3. 실·테이프 행이 N롤/N콘으로 보인다(종류 미지정이면 "종류 확인 필요" 경고).
4. 색상 있는 자재(겉감 등)가 색상별 수량 기반 값으로 보이고 "색상수량표 기준" 근거 배지가 있다. 근거가 없으면 "색상별 수량 확인 필요"가 보인다.
5. 스타일 총수량이 없으면 "스타일 총수량 미입력" 이유 문구가 보인다.
6. 발주관리 [A] 부족자재 표의 필요량과 같은 값이다(겉감 759 yd, 금속장식 499, 오바사 28콘 등 — 둘 다 같은 계산 규칙).
7. **BOM 소요명세서 엑셀 내보내기**: 본 PR은 이 화면을 건드리지 않았다(이미 서버 실시간 계산을 쓰고 있어 어긋날 일이 없음, 위 게이트 A 5번 참고) — 별도 확인 불필요.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `dd0d087`
- 변경 파일 수: 4개(`frontend-app/` 3개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1199/1199, 프런트 666/666, e2e 569/569(1차 `--maxWorkers=2`에서 바로 전부 통과, 재시도 불필요)
- e2e 처리 내역: 재시도 없음(1차 통과)
- 충돌 해결 내역: 없음(브랜치가 이미 origin/main보다 앞서 있어 fast-forward)
- main SHA: 전 `7c06c56` → 후 `dd0d087`
- 사용자에게 필요한 다음 입력: 배포 확인(위 7개 항목) 후 결과 알림
