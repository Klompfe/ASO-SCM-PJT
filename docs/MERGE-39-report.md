# MERGE-39 — PR-235(작지 저장 전 기존 자재 비교·확인 화면) main 반영 보고서

대상: 브랜치 `feat/save-compare-screen` (head `91fc680`, 사용자 입력 SHA 앞 7자리와 일치, 커밋 3개). 마이그레이션 0, DB 변경 0.

## Gate A — 머지 전 점검 결과 (이전 턴에서 완료)

- `origin/feat/save-compare-screen` = `91fc680`(일치), 커밋 3개 확인.
- 변경 파일 **17개**(사용자가 16→17로 정정 확인) — `mapping-commit` 서비스/DTO/컨트롤러(비교 API, decisions), 작지 업로드 저장 모달·비교 화면 컴포넌트·유틸, 해당 테스트 범위와 일치. `src/migrations/`·`package.json`·락 파일·`.env*`·엑셀·이미지·데이터 파일 없음.
- 확인 항목 11개(① 비교 API 읽기 전용 ② decisions 없으면 기존 동작 그대로(`ai-analysis.dto.ts`의 `decisions` 필드가 선택(optional)임을 diff로 재확인 — `decisions?: CommitDecisionsDto`, `@IsOptional()`) ③ 발주·입고 연결 행 삭제는 서버가 거부+전체 롤백 ④ 삭제는 BOM 행만, 자재 마스터 미삭제 ⑤ 합치기/갱신 시 확정 값 유지 ⑥ 괄호 안 내용 다른 자재는 후보 추천 안 함 ⑦ 기본 선택 "새 인식 우선" ⑧ 기존 BOM 없는 스타일은 화면 없이 그대로 저장 ⑨ 일괄 저장은 비교 화면 미적용(한계로 명시) ⑩ Gemini 호출·마이그레이션·새 의존성 없음) 모두 diff/테스트로 확인 완료.

## Gate B — 전체 테스트 결과

최신 main과 병합: "Already up to date"(분기 이후 main 변화 없음 — 병합 충돌 없음).

최초 e2e 실행(`--maxWorkers=2`)에서 `ECONNRESET` 등 환경성 오류로 미달이 발생해(다른 프로그램·OneDrive 동기화로 인한 자원 경합으로 추정), 사용자가 OneDrive 동기화를 일시 중지하고 다른 프로그램을 종료한 뒤 환경을 정리한 상태로 재실행했다.

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `jest`(전체) | 1258 이상 | ✅ **1258/1258** |
| 프런트 `vitest run` | 692 이상 | ✅ **692/692** |
| e2e(`--maxWorkers=2`, 환경 정리 후 재실행) | 593 이상, 실패 0 | ✅ **593/593 — 1차 통과**(140초, 재시도 불필요) |

## Gate C — 승인 확인

이번 지시서 맨 아래 `승인: PR-235` 확인 — 진행.

## Gate D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `38f9e4c` |
| 병합 후 main SHA(= 브랜치 head) | `91fc680` |
| 병합 방식 | `git merge --ff-only feat/save-compare-screen` — fast-forward |
| `git push origin main` | 완료(`38f9e4c..91fc680`) |

마이그레이션이 없는 PR이라 별도 배포 전 DB 검증 절차는 불필요하다.

### 알려진 한계 (PR-235 보고서에서 재확인)
- **일괄 저장(여러 스타일 한 번에 저장)은 이번 비교·확인 화면을 거치지 않는다** — 대화형 확인이 일괄 처리와 상충해 범위에서 제외했다. `decisions` 없이 기존 동작 그대로 저장된다.
- 이 프로젝트에 jsdom/testing-library가 없어 비교 화면의 클릭/선택 상호작용 자체는 자동화 테스트로 확인할 수 없다 — 결정 로직(기본 선택·요약·위험 필터·페이로드 생성)은 순수 함수 테스트로, 초기 렌더는 정적 렌더(`renderToStaticMarkup`) 테스트로만 확인했다.
- 오독 이름 방지·이미 생긴 중복 정리는 범위 밖(PR-234/PILOT-23과 동일).

문제가 있으면 머지 커밋 revert로 되돌린다(force-push 금지).
