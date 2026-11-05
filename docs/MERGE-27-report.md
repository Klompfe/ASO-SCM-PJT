# MERGE-27 — PR-223 main 반영 보고서

대상: 브랜치 `feat/handwritten-memo-candidates` (head `baba5d1`, 사용자 입력 SHA와 일치). 마이그레이션 0, DB 변경 0 — **배포 대기 중입니다.**

## 게이트 A — 사전 확인 결과

- `origin/feat/handwritten-memo-candidates` = `baba5d1`(일치). 코드+테스트 커밋 `7eaa804`, 보고서 커밋 `baba5d1` 둘 다 확인.
- `origin/main` = `43430e9`(MERGE-26 보고서 커밋, 분기 이후 변화 없음).

### 변경 파일 (`git diff --name-only origin/main...origin/feat/handwritten-memo-candidates`, 11개)

| 구분 | 파일 |
|---|---|
| 백엔드(비전 서비스) | `src/sales-orders/vision.service.ts`, `vision.service.spec.ts` |
| 백엔드(DTO) | `src/sales-orders/dto/ai-analysis.dto.ts` |
| 백엔드(신규 유틸) | `src/sales-orders/utils/handwritten-candidates.util.ts`, `.spec.ts` |
| 프런트(API 타입) | `frontend-app/src/api/salesOrders.service.ts` |
| 프런트(컴포넌트) | `frontend-app/src/components/SalesOrderUploadModal.tsx`, `.test.tsx` |
| 프런트(순수 함수) | `frontend-app/src/utils/salesOrderBomReview.ts`, `.test.ts` |
| 보고서 | `prompt-reports/PR-223-report.md` |

**검증 결과**: ① `src/migrations/` 변경 0개, 기존 마이그레이션 파일 수정 0개 ② `package.json`/락 파일 변경 0개 ③ `.env*`/엑셀/이미지/`vision-eval-out/` 없음 ④ 변경 전부 `src/sales-orders/`(비전 인식 서비스·DTO·신규 손글씨 후보 유틸)와 `frontend-app/`(`SalesOrderUploadModal.tsx` + 관련 유틸), `prompt-reports/`로 한정됨 — `src/work-orders/`·`src/purchase-orders/`·`mapping-commit.service.ts` 변경 없음 ⑤ 새 테스트는 전부 `generateContent`를 스텁한 합성 fixture만 사용(`stubGenerateContent` 헬퍼) — Gemini 실제 호출 없음.

### 로직 변경 여부 확인

1. `vision.service.ts`: 기존 자재 표 인식 규칙(1~4번 항목)은 **그대로**이고, 새 5번 항목(handwrittenCandidates)과 기존 2번 항목의 금지 문구만 "표 밖 손글씨는 후보 필드로만 보낸다"로 보강됨. 응답 스키마의 `handwrittenCandidates`는 Gemini 응답 측 `required`에는 있지만(모델이 항상 키를 내도록 하는 지시일 뿐), DTO 쪽은 `@IsOptional()`이고 `sanitizeHandwrittenCandidates`가 배열이 아니거나 없으면 빈 배열로 정리해 **없어도 업로드가 성공**함을 확인(테스트 ②로 커버).
2. `buildCommitResult`: `const { handwrittenCandidates: _handwrittenCandidates, ...rest } = result;`로 저장 요청에서 **명시적으로 제외** — 자동 BOM 반영 없음 확인.
3. `material-requirements.util.ts`(서버 소요량 계산)는 이 diff에 **전혀 등장하지 않음** — 경고 문구·분류·계산 로직 변경 없음 확인.

`prompt-reports/PR-223-report.md` 존재 확인. `git merge-tree origin/main baba5d1` 결과 충돌 없음(트리 `cce5d19...`).

## 게이트 B — 병합 준비 결과

### 충돌 해결
없음 — `git merge origin/main`이 "Already up to date"(main이 분기점에서 전혀 움직이지 않음). 병합 커밋 없음, 브랜치 push 불필요.

### 전체 검증 결과

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ 성공 |
| 백엔드 `jest`(전체) | 1156 이상, 실패 0 | ✅ **1156/1156** |
| 프런트 `tsc -b` | 성공 | ✅ 성공 |
| 프런트 `vitest run` | 582 이상, 실패 0 | ✅ **582/582** |
| 프런트 `npm run build` | 성공 | ✅ 성공 |
| e2e(`--maxWorkers=2`) | 569 중 실패 0 | ✅ **569/569 — 1차 실행에서 전부 통과** |

**e2e는 1차 `--maxWorkers=2` 실행에서 569/569 전부 통과해 재시도·단독 재실행·예외 승인이 필요하지 않았습니다.**

## 게이트 C — 승인 확인

사용자 입력에 `승인: PR-223` 확인 — 진행.

## 게이트 D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `43430e9` |
| 병합 후 main SHA(= 브랜치 head) | `baba5d1` |
| 병합 방식 | `git merge --ff-only feat/handwritten-memo-candidates` — fast-forward(병합 커밋 없음) |
| 트리 일치 확인 | `git rev-parse HEAD^{tree}` = `cce5d19...` — 게이트 A의 `git merge-tree` dry-run 결과와 동일(별도 커밋이 섞이지 않음) |
| 반영 후 재검증 | 프런트 `npm run build` 성공 |

**이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태, Cloudflare Pages 빌드 성공만 확인하면 됩니다.**

`git push origin main` 완료(`43430e9..baba5d1`).

## 사용자가 확인할 것 (배포 후, 브라우저는 Ctrl+F5 강력 새로고침 후)

1. Render Live(백엔드 배포 포함), 배포 로그 `No migrations are pending`, `/health` 200, Cloudflare 빌드 성공.
2. **스타일 MB73SLM109Z 작지를 수주등록으로 다시 올린다**(Gemini 1회, 사용자 승인됨 — 반복 업로드 금지). 저장 화면에서 "수기 메모 후보" 구역에 `금속장식 (내경 10φ)`가 읽힌 글자 그대로 보이는가. `BE-WH…` 같은 글자는 의미를 몰라도 원문으로 보이는가.
3. 후보에서 "자재 행으로 추가"를 누르면 표에 행이 생기고 "수기 확인 필요" 배지가 붙는다. 수량·요척이 적혀 있었다면 들어가 있다.
4. 같은 작지의 기존 자재 행(겉감 등)은 이전과 같다(회귀 없음). 후보가 없는 다른 작지에서는 "수기 메모 후보" 구역이 안 보인다.
5. 후보를 처리하지 않고 저장하려 하면 저장은 되고 저장 버튼 근처에 "처리하지 않은 후보 N건" 안내만 나온다.
6. 후보가 읽히지 않으면(손글씨 오독/PDF 이중 레이어 한계) 어떤 글자가 읽혔는지 화면을 캡처해 알려 달라 — 추가 PR로 대응한다.

**여기서 멈춥니다 — 배포 대기 중입니다. 확인 후 알려 주세요.** 문제가 있으면 병합 커밋 revert 등 다음 조치를 지시해 주세요(자동 롤백 없음, force push 금지).

## 결과 보고 형식

- 결과: **완료**(게이트 D까지 진행, main push 완료)
- 브랜치 head SHA: `baba5d1`
- 변경 파일 수: 11개(`src/sales-orders/` 5개, `frontend-app/` 5개, `prompt-reports/` 1개)
- 테스트 숫자: 백엔드 1156/1156, 프런트 582/582, e2e 569/569(1차 통과)
- e2e 처리 내역: `--maxWorkers=2` 1차 실행에서 전부 통과, 재실행 불필요
- 충돌 해결 내역: 없음(main이 분기점과 동일, Already up to date)
- main SHA: 전 `43430e9` → 후 `baba5d1`
- 사용자에게 필요한 다음 입력: 배포 확인(위 6개 항목, 특히 MB73SLM109Z 재인식 결과) 후 결과 알림
