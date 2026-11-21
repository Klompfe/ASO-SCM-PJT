# MERGE-58 — PR-253 머지 결과

- 대상: `fix/e2e-hook-timeout` (head ff4df28) → `main` fast-forward (272de4c → ff4df28). 테스트 코드만 변경, 운영 코드·마이그레이션 없음 → 배포 동작 변화 없음. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 변경 (파일 2개, 각 1줄 교체)
`test/purchase-order-search-flow.e2e-spec.ts`(줄 61 `beforeAll` 닫는 줄), `test/search-select-audit-followup-flow.e2e-spec.ts`(줄 57) — `});` → `}, 30000); // 순차 HTTP 105회 — 병렬 부하에서 jest 기본 5초 초과 (PR-253)`. 제한 시간 값은 양쪽 모두 30000ms. 105회 생성 방식·요청 내용·다른 훅·테스트·describe·단언 변경 없음. jest 설정·`src/`·package/lock 변경 없음.

## 테스트
| | 병합 직전 main(272de4c, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1445 | 1445 | 1445 통과 |
| 프런트 vitest | 999 | 999 | 999 통과 |
| e2e `--maxWorkers=2` | 654 | 654 | 654 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과. **e2e `=2` 실패 없음** — 두 스위트의 5000ms 훅 시간 초과 재발 없음(이번 병합 검증 1회). 원래 실패율이 3회 중 1회꼴이라 1회 통과가 해소를 증명하지는 않는다(PR-253 에서 연속 2회 통과 추가 확인).

## 후보·한계
- 순차 반복 30회 이상 + 제한 시간 미지정 `beforeAll` 은 이 두 스위트뿐. `list-pagination-flow`(25회·23회)는 30회 미만이라 범위 밖 후보.
- `import-shipments-first-documentation-flow` 의 과거 간헐 실패는 원인 미확인(PILOT-27: 훅·테스트 시간이 5초와 멀어 일시 과부하 가설) — 이번 PR 에서 건드리지 않았다. 이후 `=2` 에서 다시 실패하면 스위트 이름과 오류 첫 줄을 기록해 조사한다.
