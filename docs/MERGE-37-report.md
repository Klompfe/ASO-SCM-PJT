# MERGE-37 — PR-233(작지 저장 시 자재명 정규화 매칭) main 반영 보고서

대상: 브랜치 `fix/commit-name-normalize` (head `7d99de6`, 사용자 입력 SHA 앞 7자리와 일치). 마이그레이션 0, DB 변경 0.

## Gate A — 머지 전 점검 결과

- `origin/fix/commit-name-normalize` = `7d99de6`(일치).
- `origin/main` = `44a3418`(변화 없음).

### 변경 파일(3개, 기대 범위와 일치)
| 파일 | 내용 |
|---|---|
| `src/mapping/services/mapping-commit.service.ts` | `commit()`의 자재명 매칭을 완전 일치 → `normalizeForFuzzyMatch`(정규화 일치)로 변경, 정규화 이름이 같은 Item 중 가장 오래된 id 재사용, 색상/규격 매칭 조건은 그대로 유지 |
| `src/mapping/services/mapping-commit.service.spec.ts` | 매칭 방식 변경에 맞춰 기존 mock 보강(`find(Item)` 기본 반환값, Item 저장 시 고유 id 부여) |
| `test/commit-name-normalize-flow.e2e-spec.ts`(신규) | 같은 이름 재저장/표기만 다른 이름 병합/괄호 안 내용 다른 자재 미병합/색상별 별개 행/사전 중복 시 오래된 id 재사용/수동 값 보존 — 6개 |

위 3개 외 파일 없음(마이그레이션·`package.json`·락 파일·데이터 파일·`.env` 변경 0개). diff 내용이 PR-233 보고 요약(정규화 이름 비교 적용, 괄호 안 내용 보존, 다른 자재 미병합, 수동 값 보존)과 정확히 일치함을 확인. 이름 비교 외 다른 매칭 조건(색상·구분)을 느슨하게 만든 변경, 삭제·스키마 변경, 외부 호출 없음.

## Gate B — 전체 테스트 결과

최신 main과 병합: "Already up to date"(분기 이후 main 변화 없음 — 병합 충돌 없음).

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `jest`(전체) | 1199 이상 | ✅ **1199/1199** |
| 프런트 `vitest run` | 672 이상 | ✅ **672/672** |
| e2e(`--maxWorkers=2`) | 584 이상, 실패 0 | ✅ **584/584 — 1차 통과**(재시도 불필요) |

## Gate C — 승인 확인

이번 지시서 맨 아래 `승인: PR-233` 확인 — 진행.

## Gate D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `44a3418` |
| 병합 후 main SHA(= 브랜치 head) | `7d99de6` |
| 병합 방식 | `git merge --ff-only fix/commit-name-normalize` — fast-forward |
| `git push origin main` | 완료(`44a3418..7d99de6`) |

마이그레이션이 없는 PR이라 별도 배포 전 DB 검증 절차는 불필요하다.

문제가 있으면 머지 커밋 revert로 되돌린다(force-push 금지).
