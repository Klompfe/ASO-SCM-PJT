# MERGE-67 — PR-262 머지 결과 (겉감 점검 화면 오표시 차단 + 응답 일관성 검사 + 최신 응답만 반영)

## 결과
- 승인(`승인: PR-262`)에 따라 `feat/outer-fabric-audit-consistency` 를 `main` 에 fast-forward 머지하고 푸시했습니다.
- `main`: `424a4e6` → `71cd6506c026bbc16f00eefe6c28be7489cdaff4` (커밋 1개, 별도 머지 커밋 없음)
- 마이그레이션·package/lock 변경·새 의존성·Gemini 호출 없음. 운영 DB 를 쓰는 서버 기동·스크립트는 실행하지 않았습니다.
- 푸시할 때 저장소 이동 안내(`Klompfe/ASO-SCM-PJT`)가 나왔습니다. 푸시는 성공했고 원격 주소는 바꾸지 않았습니다.
- **배포 상태와 실제 화면은 아직 확인하지 않았습니다.**

## 테스트
| 항목 | 머지 전 main(424a4e6) 직접 측정 | 하한(측정 + 추가분) | 최종 |
|---|---|---|---|
| 백엔드 jest | 1633 | 1645 (+12) | 1645 통과 (96 suites) |
| 프런트 vitest | 1156 | 1187 (+31) | 1187 통과 (105 files) |
| e2e `--maxWorkers=2` | 684 | 684 (+0) | 684 통과 (90 suites) |

- e2e 는 main·최종 모두 `--maxWorkers=2` 첫 실행에서 통과했습니다(실패·재실행 없음).
- 최신 `origin/main` merge 결과는 "Already up to date" 입니다(브랜치 이후 main 에 추가된 커밋 0개).
- 백엔드 `npm run build`, 프런트 `tsc -b`·build 종료 코드 0.
- 참고: 작업 PC 에서는 루트 `npm run build` 가 종료 코드 0 이어도 `dist` 를 만들지 않았습니다. 남아 있는 `tsconfig.build.tsbuildinfo`(증분 빌드)와 `deleteOutDir` 설정이 겹친 것으로 보입니다(원인 후보, 이 PR 과 무관). 저장소 밖에 `--incremental false` 로 컴파일해 출력과 성공을 확인했습니다. 해당 파일은 git 에 없습니다.

## 변경 파일 (7개)
- `src/boms/utils/outer-fabric-audit.util.ts`
- `src/boms/utils/outer-fabric-audit-consistency.spec.ts` (신규)
- `frontend-app/src/api/boms.service.ts` (응답 타입만)
- `frontend-app/src/utils/outerFabricAudit.ts`
- `frontend-app/src/utils/outerFabricAuditScreen.test.ts` (신규)
- `frontend-app/src/components/OuterFabricAuditList.tsx`
- `frontend-app/src/components/OuterFabricAuditList.test.tsx`

서버 서비스·컨트롤러·DTO, 겉감 판정 함수(`소재` 정확 일치 포함), 활성 BOM 선택, 다른 화면은 바뀌지 않았습니다. 공백을 무시한 diff stat 이 같아 줄바꿈만 바뀐 파일은 없습니다.

## 추가된 응답 필드와 불변식
- `overall` {total, noBom, noRow, blank, okCount}: 검색·필터와 무관한 전체 수치
- `applied` {q, status, page, pageSize}: 서버가 적용한 조건(검색어 앞뒤 공백 제거)
- `generatedAt`: 응답 생성 시각
- 불변식: `total === noBom + noRow + blank + okCount`(모두 0 이상의 정수). 깨지면 500.
- 기존 필드의 이름·계산 방식은 그대로이고, 쿼리는 추가하지 않았습니다(SELECT 3개 유지).
- 불변식 확인
  - 스타일마다 `okCount` 증가와 누락 목록 추가 중 정확히 하나가 실행됩니다. 건너뛰는 경우는 중복 스타일뿐입니다.
  - `master_style.styleNo` 는 기본 키이고, `overview` 조인은 `style_overview.id`(기본 키)로 이어져 행이 늘지 않습니다.
  - 합성 입력 무작위 20,000건(저장소 밖 임시 스크립트, DB 접속 없음): 500 0건, 스타일이 정확히 한 번 세어지지 않은 경우 0건, 정상 서버 응답을 프런트가 의심 응답으로 판정한 경우 0건, 조건에 맞지 않는 초록 0건.
  - `소재`+`겉감` 공존(모두 입력·일부 빈값·모두 빈값)은 **점검 계산의 전용 자동 테스트가 없습니다.** 같은 임시 스크립트에서 각각 입력 완료·blank·blank 로 한 번씩 세어짐을 확인했습니다.

## 초록 안내의 유일한 조건
정상 응답 + 항목 0개 + 전체 스타일 > 0 + **검색 없음 + "전체 누락" + 1쪽 + `okCount === total`**.
로딩·요청 실패·의심 응답에는 초록과 숫자가 나오지 않습니다.

## 빈 상태 문구와 우선순위 (위에서부터)
| 조건 | 문구 |
|---|---|
| 전체 스타일 0 | 등록된 스타일이 없습니다 |
| 결과 0 + 검색어 적용 중 | 검색 결과 없음 (검색어: …) — 함께 표시: "검색은 점검 대상(누락) 스타일 안에서 합니다. 겉감 혼용률 입력이 끝난 스타일은 목록에 나오지 않습니다." |
| 결과 0 + 상태 필터 선택 | 이 상태는 0건입니다 |
| 결과는 있는데 쪽 범위 초과 | 마지막 쪽을 넘었습니다(N쪽) + "1쪽으로" |
| 초록 조건 충족 | 겉감 점검 대상이 없습니다 — 모든 스타일의 겉감 혼용률이 입력되어 있습니다 |

## 의심 응답 판정 4종
숫자·목록을 숨기고 "점검 결과를 확인할 수 없습니다 — 다시 조회해 주세요"와 "다시 조회"만 보입니다.
1. 새 필드 누락(옛 서버 응답 포함)
2. 불변식 위반
3. `applied`(또는 응답의 쪽·쪽 크기)가 마지막으로 보낸 조건과 불일치
4. 기존 필드와의 불일치: `styleCount` ≠ `overall.total`, 개수 합 불일치, 검색이 없는데 `counts` ≠ `overall`(검색 중에는 `counts` 가 `overall` 을 넘는 경우), `total`·항목 수 불일치

그 밖에 형식 오류와, 어느 빈 상태에도 맞지 않는 응답도 의심 응답입니다.

## 최신 응답만 반영
- 요청마다 일련번호를 받고(`createLatestGate`), 응답이 왔을 때 최신 번호의 성공·실패만 반영합니다(`runAuditLoad`). 이전 요청은 취소하지 않고 응답만 버립니다.
- 새 조회를 시작하면 이전 데이터를 지웁니다. 조건이 바뀐 직후의 렌더도 로딩으로 보입니다.
- "다시 조회"는 `reloadKey` 를 올려 조회 효과를 다시 실행합니다(코드 확인, 클릭 테스트 없음).

## 수정한 기존 테스트 (`OuterFabricAuditList.test.tsx`, 단언 변경 없음)
다른 기존 테스트 파일은 수정하지 않았습니다.

1) 합성 응답 `sample` — 추가만
```ts
// 전 (이 줄 뒤에 바로 "};")
  total: 3, page: 1, pageSize: 50, counts: { noRow: 1, blank: 1, noBom: 1, total: 3 }, styleCount: 10,
// 후 (위 줄은 그대로, 아래를 추가)
  // PR-262: 새 응답 필드(없으면 화면이 "의심 응답"으로 본다) — 요청 조건과 일치하는 합성 값.
  overall: { total: 10, noRow: 1, blank: 1, noBom: 1, okCount: 7 },
  applied: { q: '', status: 'all', page: 1, pageSize: 50 },
  generatedAt: '2026-01-01T00:00:00.000Z',
```

2) "목록이 비면 안내 문구, 이때 표는 없다" — 입력 보강
```ts
// 전
    const html = render({ data: { ...sample, items: [], total: 0, counts: { noRow: 0, blank: 0, noBom: 0, total: 0 } } });
// 후
    // PR-262: 초록 안내는 "빈 목록"이 아니라 확인된 전부 완료(okCount === total)일 때만 — 그 입력을 만든다.
    const html = render({ data: { ...sample, items: [], total: 0, counts: { noRow: 0, blank: 0, noBom: 0, total: 0 }, overall: { total: 10, noRow: 0, blank: 0, noBom: 0, okCount: 10 } } });
```
두 단언(초록 문구가 있다, 표가 없다)은 그대로입니다. "빈 목록이면 초록"에서 "전부 완료가 확인되면 초록"으로 바뀐 것은 확정된 결정이고, 초록이 나오면 안 되는 경우는 새 테스트가 확인합니다.

## 배포
- 프런트와 백엔드는 **같은 이미지·같은 서비스가 아닙니다.** 루트 `.dockerignore` 가 `frontend-app` 을 제외하고, `docs/DEPLOYMENT.md` 는 두 개의 독립 서비스로 설명합니다. 이전 MERGE 보고서들은 프런트를 Cloudflare Pages 로 적고 있습니다. 실제 배포 설정 화면은 확인하지 않았습니다.
- 따라서 **배포 시차가 생길 수 있습니다.** 프런트가 먼저 올라가면 백엔드 배포가 끝날 때까지 의심 응답 경고가 나옵니다. 백엔드가 먼저 올라가는 경우는 필드 추가뿐이라 기존 화면에 영향이 없습니다.
- 백엔드·프런트 배포가 모두 끝난 뒤에도 경고가 계속 나오면 알려 주세요. 백엔드 배포 로그에는 `No migrations are pending` 이 나와야 합니다.

## 알려진 한계
- 클릭 자동 테스트가 없습니다. 순서 뒤바뀜은 함수 수준, 화면은 정적 렌더로 확인했고, 버튼과 상태를 잇는 부분은 코드 확인·타입 검사까지입니다.
- 검색과 상태 필터를 함께 써서 0건이면 "검색 결과 없음"이 우선합니다. 다른 상태에는 검색 결과가 있을 수 있어, 문구만 보면 "검색해도 아예 없다"로 읽힐 수 있습니다. 같은 화면의 "검색 결과 중 점검 대상 N개 — …" 줄로 구분합니다(문구 개선은 후속 후보, 이 조합의 전용 테스트는 없음).
- 검색 중에는 `counts` 가 `overall` 을 넘는지만 비교하며, 항목은 개수만 확인하고 내용은 대조하지 않습니다.
- 서버의 500 은 화면에서 일반 조회 오류 안내로 보입니다.
- **사용자가 처음 겪은 0건 증상의 원인은 확정되지 않았습니다.** 다시 생기면 브라우저 개발자 도구 Network 탭의 요청 주소 전체(`q=` 여부)와 응답을 캡처해 주세요. 이것이 증거가 됩니다.
- 자재·BOM 조회에서 이전 응답이 늦게 뜨는 문제는 이번 범위 밖이며 별도 후보입니다.

## 배포 후 사용자 확인 (겉감 점검 탭)
1. 조건 없이 열었을 때 전체 기준 숫자가 나온다.
2. 없는 검색어 → "검색 결과 없음"(초록 아님).
3. 검색어를 해제한 상태에서 0건인 상태 필터 → "이 상태는 0건입니다"(0건인 상태가 없으면 건너뜀).
4. 검색어를 적용한 뒤 칩의 × 로 해제하면 원래 숫자·목록이 돌아온다.

## 롤백
fast-forward 머지라 머지 커밋이 없습니다. 롤백은 `git revert 71cd6506c026bbc16f00eefe6c28be7489cdaff4` 후 push 합니다(force-push 금지). 마이그레이션이 없어 DB 작업은 필요 없습니다.
