# MERGE-29 — PR-224 main 반영 보고서

대상: 브랜치 `feat/bom-lookup-style-autocomplete` (head `2b0b579` → `origin/main` 병합 후 `4435ed1`, 사용자 입력 SHA와 일치). 백엔드 변경 0, 마이그레이션 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/bom-lookup-style-autocomplete` = `2b0b579`(일치). 코드+테스트 커밋 `e8ee961`, 보고서 커밋 `2b0b579` 둘 다 확인.
- `origin/main` = `cf6b75f`(MERGE-28 보고서 커밋 — `docs/MERGE-28-report.md` 존재 확인됨, PR-225 반영 이후).
- 이 브랜치는 `43430e9`(PR-222 시점) 근처에서 분기해 main보다 뒤쳐져 있었음(예상된 상태).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/bom-lookup-style-autocomplete`, 5개)

| 구분 | 파일 |
|---|---|
| 프런트(컴포넌트) | `frontend-app/src/components/ItemsManager.tsx`, `ItemsManagerLabels.test.tsx` |
| 프런트(신규 유틸) | `frontend-app/src/utils/bomLookupFilter.ts`, `.test.ts` |
| 보고서 | `prompt-reports/PR-224-report.md` |

**검증 결과**: ① `src/` 아래 백엔드 파일 변경 **0개**, `src/migrations/` 변경 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `ItemsManager.tsx`·`bomLookupFilter` 관련과 `prompt-reports/`로 한정됨 — `SalesOrderUploadModal`·`PurchaseOrdersManager`·`SearchSelectField` 등 공용 컴포넌트는 **수정되지 않음**(소비만 함) ⑤ 기존 마이그레이션 파일 수정 0개.

### 로직 변경 여부 확인

`ItemsManager.tsx` diff를 읽은 결과: 기존 "스타일 번호(직접 입력)" + 검색 버튼, 납기일 From/To 필터는 **그대로 유지**됨(동작 변경 없음, 레이블만 "스타일 번호(직접 입력)"로 보강). BOM 자재 목록의 `bomItemQtyDisplay`/`formatBomItemQty`(포장단위 N롤/N콘, 정수 올림) 함수는 이 diff에 **호출 방식만 그대로** 유지되고(`bom.items.map` → `filterBomRows`로 거른 `filteredBomItems.map`으로만 바뀜, 표시 로직 자체는 무변경) 계산 로직 변경 없음. `SearchSelectField`는 새 `renderRow` prop으로 **소비만** 하고 그 컴포넌트 파일 자체는 수정되지 않음(diff에 `SearchSelectField.tsx` 없음). 로직 변경 없음 확인.

`prompt-reports/PR-224-report.md` 존재 확인. `git merge-tree origin/main 2b0b579` 결과 충돌 없음(트리 `cd62c87...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결

브랜치가 main보다 뒤쳐져 있어(PR-223/PR-225가 먼저 반영됨) `git merge origin/main`이 **자동 병합 커밋**을 만들었다(`ort` strategy). PR-224(`ItemsManager.tsx`/`bomLookupFilter.ts` 등)와 PR-223/225(`SalesOrderUploadModal.tsx`/`vision.service.ts` 등)가 **파일을 전혀 겹치지 않아** 충돌 없이 자동 병합됨(사용자가 보고서에서 예상한 그대로). 기계적 해결이 필요한 부분 없음. 병합 커밋을 브랜치에 push함(`2b0b579..4435ed1`, force 아님).

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1156 이상, 실패 0 | ✅ **1156/1156** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 600 이상, 실패 0 | ✅ **601/601** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-224` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `cf6b75f` |
| 병합 후 main SHA(= 브랜치 head) | `4435ed1` |
| 병합 방식 | `git merge --ff-only feat/bom-lookup-style-autocomplete` — fast-forward(브랜치가 이미 main의 후손이라 가능, 별도 병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `cd62c87...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`cf6b75f..4435ed1`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후, 자재·BOM 조회 화면)

1. Render Live, Cloudflare 빌드 성공(프런트 전용이라 Render는 `No migrations are pending`만 확인).
2. 스타일 번호 칸 옆/아래의 **"또는 목록에서 선택"** 콤보를 열면 등록된 스타일 목록이 나오고, 하나를 고르면 검색 버튼 없이 그 스타일의 자재 목록이 아래에 바로 나온다(발주 화면과 같은 방식 — 타이핑하면 바로 아래 후보가 뜨는 방식은 아니고 클릭→팝업→선택 방식).
3. 자재 목록 위의 **자재명 키워드·구분·색상**으로 걸러지고 "자재 N건 중 M건"이 보인다. 초기화로 해제된다.
4. 기존 직접 입력 + 검색 버튼, 납기일 From/To 검색이 이전처럼 동작한다.
5. 품목 마스터 관리는 접혀 있다. 자재 목록의 N롤/N콘 표시는 이전과 같다.
6. 아쉬운 점(타이핑 즉시 후보 표시, 공급사·발주상태 열, 자재 → 스타일 역조회)은 2단계로 이어진다 — 써 보고 우선순위를 알려 달라.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `4435ed1`(origin/main 병합 후, 브랜치에 push됨)
- 변경 파일 수: 5개(`frontend-app/` 4개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1156/1156, 프런트 601/601, e2e 569/569(1차 통과)
- e2e 처리 내역: `--maxWorkers=2` 1차 실행에서 전부 통과, 재실행 불필요
- 충돌 해결 내역: 없음(파일이 겹치지 않아 자동 병합 — PR-223/225와 PR-224가 서로 다른 파일을 수정)
- main SHA: 전 `cf6b75f` → 후 `4435ed1`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목) 후 결과 알림
