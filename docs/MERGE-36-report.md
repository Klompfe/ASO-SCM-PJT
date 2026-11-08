# MERGE-36 — PR-232(품목 검색 수정) main 반영 보고서

대상: 브랜치 `fix/items-search` (head `07111b3`, 사용자 입력 SHA와 일치). 마이그레이션 0, DB 변경 0.

## Gate A — 머지 전 점검 결과

- `origin/fix/items-search` = `07111b3`(일치).
- `origin/main` = `1abb94b`(변화 없음).

### 변경 파일(4개, 기대 범위와 일치)
| 파일 | 내용 |
|---|---|
| `src/items/items.service.ts` | `findAll()`의 키워드/구분 trim + `LOWER()` 비교(Postgres/sqlite 동일 결과 보장) |
| `frontend-app/src/components/ItemsManager.tsx` | 빈 조건 검색 시 토스트로 막던 가드 제거(전체 목록 조회로 대체), 검색 행 제목·placeholder 추가 |
| `frontend-app/src/components/ListSearchGuard.test.tsx` | 위 UI 변경에 맞춰 단언 갱신(작업지시 목록 쪽 테스트는 그대로) |
| `test/items-search-flow.e2e-spec.ts`(신규) | 이름/코드 부분일치, 구분 필터, 결과 없음, 공백 트림, 대소문자 무시, 빈 조건 전체 조회 — 9개 |

위 4개 외 파일 없음(마이그레이션·`package.json`·락 파일·데이터 파일·`.env` 변경 0개). diff 내용이 PR-232 보고 요약(trim, LOWER(), 빈 검색 시 전체 목록, placeholder/제목)과 정확히 일치함을 확인. 삭제·스키마 변경·외부 호출 등 위험한 변경 없음.

## Gate B — 전체 테스트 결과

최신 main과 병합: "Already up to date"(분기 이후 main 변화 없음 — 병합 충돌 없음).

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `npm run build` | 성공 | ✅ |
| 백엔드 `jest`(전체) | 1199 이상 | ✅ **1199/1199** |
| 프런트 `vitest run` | 672 이상 | ✅ **672/672** |
| e2e(`--maxWorkers=2`) | 578 이상, 실패 0 | ✅ **578/578 — 1차 통과**(재시도 불필요) |

## Gate C — 승인 확인

이번 지시서 맨 아래 `승인: PR-232` 확인 — 진행.

## Gate D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `1abb94b` |
| 병합 후 main SHA(= 브랜치 head) | `07111b3` |
| 병합 방식 | `git merge --ff-only fix/items-search` — fast-forward |
| `git push origin main` | 완료(`1abb94b..07111b3`) |

마이그레이션이 없는 PR이라 별도 배포 전 DB 검증 절차는 불필요하다.

문제가 있으면 머지 커밋 revert로 되돌린다(force-push 금지).
