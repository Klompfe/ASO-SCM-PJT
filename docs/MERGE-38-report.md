# MERGE-38 — PR-234(작지 인식 자재명에서 영문 표기·작업 위치 분리) main 반영 보고서

대상: 브랜치 `fix/recognition-name-cleanup` (head `7b37398`, 사용자 입력 SHA 앞 7자리와 일치). 마이그레이션 0, DB 변경 0.

## Gate A — 머지 전 점검 결과

- `origin/fix/recognition-name-cleanup` = `7b37398`(일치).
- `origin/main` = `acd605a`(변화 없음).

### 변경 파일(11개, 기대 범위와 일치)
| 파일 | 내용 |
|---|---|
| `src/sales-orders/utils/vision-guardrails.util.ts`(+spec) | `cleanupRecognizedMaterialName()` 신규 — 라벨/끝붙은 영문 덩어리 분리, 꺾쇠·괄호 안 보존, 빈 이름 방지. `mergeRemarksWithLocation()` 신규 |
| `src/sales-orders/vision.service.ts`(+spec) | RESPONSE_SCHEMA에 `englishName`/`location` 선택 필드 추가(하위 호환), 프롬프트 문구 보강, `applyGuardrails()`에서 정제 적용(AI가 직접 채운 값 우선) |
| `src/sales-orders/dto/ai-analysis.dto.ts` | `AiBomItemDto.englishName`/`location` 선택 필드 추가 |
| `src/sales-orders/sales-orders.service.ts`(+spec) | `commitAnalysis()`가 `englishName` 전달, `location`을 `mergeRemarksWithLocation`으로 remarks에 합침 |
| `src/mapping/dto/commit-mapping.dto.ts` | `CommitBomItemDto.englishName` 선택 필드 추가 |
| `src/mapping/services/mapping-commit.service.ts`(+spec) | `commit()`에서 신규 Item은 englishName 채움, 기존 Item은 비어 있을 때만 채움(덮어쓰기 없음) |
| `test/recognition-name-cleanup-flow.e2e-spec.ts`(신규) | 정제된 이름 재저장 시 Item/BomItem 비중복 + 영문명 보존, 위치→remarks 저장 — 2개 |

위 11개 외 파일 없음(`src/migrations/`·`package.json`·락 파일·`.env*`·엑셀·이미지·데이터 파일 변경 0개).

### diff 확인 결과 (7개 항목)
| 항목 | 결과 |
|---|---|
| ① 라벨("(영문표기)","(작업위치)") 제거 + 영문 덩어리 분리 | ✅ `ENGLISH_NAME_LABEL_REGEX`/`LOCATION_LABEL_REGEX`/`splitTrailingBareEnglish` |
| ② 영문뿐인 이름(약어) 유지 | ✅ `splitTrailingBareEnglish`가 남는 이름 부분에 한글이 없으면(`HANGUL_REGEX` 가드) 분리하지 않음 |
| ③ `다데<면>`/`다데<실크>` 등 괄호·꺾쇠 안 내용 보존 | ✅ 라벨 패턴이 정확히 "(영문표기)" 등 리터럴 문구에만 반응, 괄호·꺾쇠 안 일반 내용은 건드리지 않음(테스트로 증명) |
| ④ 정제 후 빈 문자열이면 원래 이름 유지 | ✅ `const itemName = core \|\| original;` |
| ⑤ 기존 영문명 미덮어쓰기 | ✅ `else if (item.englishName && !material.englishName)` — 이미 값이 있으면 이 분기 자체가 실행되지 않음 |
| ⑥ Gemini 호출·실행 코드 변경 없음(프롬프트 문구만) | ✅ `generateContent`/`getGenerativeModel` 호출부 변경 없음. 바뀐 것은 RESPONSE_SCHEMA 선언(데이터 구조)과 PROMPT 문자열, 그리고 응답을 받은 뒤의 순수 후처리(`applyGuardrails`)뿐 |
| ⑦ 새 필드·마이그레이션 없음(기존 필드 재사용) | ✅ `src/migrations/` 변경 0개. `Item.englishName`(기존 컬럼)·`BomItem.remarks`(기존 컬럼) 그대로 사용 |

삭제·스키마 변경·외부 호출 없음. 범위 밖 모듈 변경 없음.

## Gate B — 전체 테스트 결과

최신 main과 병합: "Already up to date"(분기 이후 main 변화 없음 — 병합 충돌 없음).

| 구분 | 하한 | 결과 |
|---|---|---|
| 백엔드 `jest`(전체) | 1232 이상 | ✅ **1232/1232** |
| 프런트 `vitest run` | 681 이상 | ✅ **681/681** |
| e2e(`--maxWorkers=2`) | 586 이상, 실패 0 | ✅ **586/586 — 1차 통과**(재시도 불필요) |

## Gate C — 승인 확인

이번 지시서 맨 아래 `승인: PR-234` 확인 — 진행.

## Gate D — main 반영 결과

| 항목 | 값 |
|---|---|
| 병합 전 main SHA | `acd605a` |
| 병합 후 main SHA(= 브랜치 head) | `7b37398` |
| 병합 방식 | `git merge --ff-only fix/recognition-name-cleanup` — fast-forward |
| `git push origin main` | 완료(`acd605a..7b37398`) |

마이그레이션이 없는 PR이라 별도 배포 전 DB 검증 절차는 불필요하다.

문제가 있으면 머지 커밋 revert로 되돌린다(force-push 금지).
