# PR-199b 완료 보고: vision-eval 측정 도구 보정 (모드 A 정렬 버그 · 재채점 · 이름/값 비교 · 겉감 색상 분할)

Written for: 이 저장소를 관리하는 개발자(변경 요약/재채점 전후 비교/사용법을 보려는 사람).

- 브랜치: `fix/vision-eval-mode-a-alignment` (`origin/main` 최신에서 분기, PR-199까지 반영된 상태)
- **`src/`(운영 코드) 변경 없음** — `git status --short -- src/ test/` 결과 없음(빈 출력)으로 확인.
- **Gemini API를 한 번도 호출하지 않았습니다.** 검증은 전부 단위 테스트와 `--rescore`(API 호출 0)로만 했습니다.
- 실제 업무 데이터(스타일번호·자재명·거래처명)는 테스트에 넣지 않았습니다 — 전부 가짜 값(`FAKE-1`, `가짜코드-001` 등). `vision-eval-out/`·`C:\vision-eval\`의 파일은 저장소로 복사하지 않았습니다(여전히 `.gitignore` 대상).

## 배경 (PILOT-2에서 확인된 치명적 버그)
모드 A가 manifest 행(페이지)마다 PDF 전체를 다시 호출하면서 돌아온 배열에서 항상 `results[0]`만 썼다 — 2페이지 이후 데이터는 한 번도 채점되지 않았고, 같은 PDF가 페이지 수만큼 중복 호출됐다. 그 외에 정답 자재명의 영문 설명·괄호 세부사항이 그대로 비교에 들어가 값이 맞아도 이름이 다르다고 잡히는 문제, AI 값이 `null`인 것을 숫자 오독으로 섞는 문제, 겉감(소재)을 AI가 색상별로 쪼개면 MISSING+EXTRA_OTHER 쌍으로 잘못 잡히는 문제, manifest의 정답 시트가 없을 때 조용히 빠지는 문제가 함께 확인됐다. 이번 PR은 이 5가지를 전부 고친다.

## ① 변경 파일 목록

| 파일 | 상태 | 내용 |
|---|---|---|
| `scripts/vision-eval/alignment.ts`(+spec) | 신규 | 모드 A 1회 호출 결과를 manifest 행에 `results[page-1]`로 짝짓는다. 배열 길이가 안 맞으면 `PAGE_COUNT_MISMATCH`, 스타일번호 편집거리 ≤2·유일 최소일 때만 `ALIGNED_BY_STYLE`로 대체 매칭. |
| `scripts/vision-eval/scoring-pipeline.ts`(+spec) | 신규 | 라이브 실행과 `--rescore`가 공유하는 채점 집계 로직(`buildSummaryData`/`renderSummaryMarkdown`) — 정렬 상태(`EntryAlignmentStatus`)·SHEET_NOT_FOUND·불안정 필드·FACE_SPLIT_BY_COLOR를 모두 반영. |
| `scripts/vision-eval/scoring/face-split.ts`(+spec) | 신규 | 겉감(소재) 색상 분할 병합 — 운영 표준 이름 사전은 바꾸지 않고 채점기 안에서만 처리. |
| `scripts/vision-eval/types.ts` | 수정 | `FieldErrorType`에 `VALUE_MISSING`·`NAME_ABBREV`·`FACE_SPLIT_BY_COLOR` 추가, `EntryAlignmentStatus` 추가. |
| `scripts/vision-eval/scoring/bom-match.ts`(+spec) | 수정 | 이름 비교를 정답 **첫 줄만** 비교 + `classifyNameMatch`(EXACT/ABBREV/DIFF) 도입, AI 값이 `null`이면 `VALUE_MISSING`으로 분리. |
| `scripts/vision-eval/call-count.util.ts`(+spec) | 수정 | `computeCallCountByMode`/`countDistinctPdfs` 추가 — 모드 A는 PDF 수, 나머지는 페이지 수로 호출 수 계산. |
| `scripts/vision-eval/cli.ts` | 수정 | 모드 A를 PDF당 1회 호출로 재구성, `--rescore <폴더>` 추가, 새 집계 파이프라인으로 교체, SHEET_NOT_FOUND 추적. |

## ② 재채점 전후 비교 표 (실제 명령 실행, API 호출 0건)

```powershell
npm run vision:eval -- --rescore vision-eval-out/2026-10-17T15-00-54-756Z --manifest C:\vision-eval\manifest.csv --xlsx C:\vision-eval\xlsx\vanek.xlsx --xlsx C:\vision-eval\xlsx\misens.xlsx
```
콘솔: `[vision-eval] 재채점 완료(API 호출 0건) — .../summary.md 작성됨.` (API 호출이 없었음을 직접 확인)

**주의**: 예전 summary는 "페이지당 1건"(9건)만 채점했지만, 재채점은 같은 PDF의 **반복 호출을 전부 별도 실행 회차로 재구성**해 채점하므로(41건) 절대 숫자가 그대로 비교되지는 않는다 — 비율과 "새로 생긴/없어진 분류"를 보는 것이 목적이다.

| 분류 | 이전 summary(버그, 9건 중) | 재채점(41건 중, 반복 호출 전부 포함) |
|---|---|---|
| 스타일번호 EXACT | 1 | 11 |
| 스타일번호 SUFFIX_MISSING | 1 | 12 |
| 스타일번호 SUFFIX_DIGIT | 0 | 0 |
| 스타일번호 OTHER_MISMATCH | 5 | 8 |
| 자재명세 OK | **0** | **31** |
| 자재명세 VALUE_DIFF | 18 | 17 |
| 자재명세 VALUE_MISSING | (분류 없었음, VALUE_DIFF에 섞임) | 10 |
| 자재명세 NAME_DIFF | 10 | 42 |
| 자재명세 NAME_ABBREV | (분류 없었음, 전부 NAME_DIFF로 잡힘) | **54** |
| 자재명세 EXTRA_DUPLICATE | 2 | 0 |
| 자재명세 EXTRA_OTHER | 54 | 172 |
| 자재명세 MISSING | 48 | 159 |
| 자재명세 FACE_SPLIT_BY_COLOR | (분류 없었음, MISSING+EXTRA_OTHER로 잡힘) | **23** |
| 정답 시트 없음(SHEET_NOT_FOUND) | (조용히 빠짐) | 목록 2건(미도작지.선적.0918.pdf 3·4페이지) |
| 불안정 필드(반복 실행 간 값 변동) | (측정 안 함, `--runs 1`) | 5건(모두 styleNo, 20~25% 불안정) |

**가장 중요한 변화**: **OK가 0 → 31로 늘었다** — 모드 A 버그 때문에 맞는 비교조차 전혀 없었던 것이 드러났다. **NAME_ABBREV가 새로 54건** 분리됐는데, 이는 이전 summary의 NAME_DIFF 10건보다도 많다 — 즉 예전 "자재명이 다르다"로 잡힌 문제 대부분이 실제로는 "값은 맞고 표기만 다름"이었다는 뜻이다. **FACE_SPLIT_BY_COLOR 23건**도 전부 예전엔 MISSING+EXTRA_OTHER로 이중 집계됐던 것이다.

## ③ 라벨 구역 조사 결과 (코드 + 가짜 샘플로 조사, 수정 없음)
`golden-extract.util.ts`의 `MAIN+SIZE` 마커 판별 자체는 **정상 동작**한다 — 실제 정답 시트(`MB73SKM109Z`)에서 18개 항목 중 8개(`MAIN+SIZE`, `CARE LABEL`, `PRICE TAG`, `SIZE STICKER`, `프리미엄택`, `TAG PIN`, `이미지택`, `POLY BAG`)가 정확히 `isLabelZone: true`로 분류됐다. **PILOT-2 보고서의 "마커가 안 걸리는 것 같다"는 추정은 틀렸다** — 진짜 원인은 `checkLabelZonePresence()`가 AI 행의 "존재 여부"를 `standardGroupOf()`(본봉·오바·다데 등 14개 자재 키워드 사전)로 판별하는데, 이 사전에 라벨/택/스티커류 키워드가 하나도 없어서 골든의 긴 원문 이름(`"MAIN+SIZE\nLABEL\n메인라벨"`)과 AI의 짧은 이름(`"MAIN 라벨"`)이 영원히 같은 그룹으로 묶이지 못하기 때문이다. 그 결과 라벨류는 항상 `present: false`로 나오고, `classifyBomItems`에선 애초에 라벨 구역 골든 항목이 비교 대상에서 빠져 있으니 AI의 라벨 행은 짝 없이 `EXTRA_OTHER`로 잡힌다(이번에 고친 범위 밖 — 보고만).

## ④ 모드 B/C/E 점검 (한 줄, 코드만 읽음·수정 안 함)
B(`pdfseparate`로 1페이지씩 분리)·C(`pdftoppm`으로 1페이지씩 PNG 렌더)·E(`pdftocairo`로 1페이지씩 영역 크롭)는 각각 `buildInputsForMode`가 `page` 인자를 받아 **그 페이지만** 잘라/렌더해 호출하므로 모드 A와 같은 "페이지 무시" 버그가 없다 — manifest 행(페이지) 수만큼 정확히 그 페이지의 입력만 호출되는 것을 코드로 확인했다(실제 호출은 하지 않음).

## 테스트 결과
| 항목 | 결과 |
|---|---|
| `npm run vision:eval:typecheck` | 통과 |
| `npm run vision:eval:test`(하네스 전용 jest) | **14 suites / 107 tests** 통과 — 신규: `alignment.spec.ts` 5건, `scoring-pipeline.spec.ts` 10건, `scoring/face-split.spec.ts` 6건, `bom-match.spec.ts`/`call-count.util.spec.ts`에 각각 추가. 기존 테스트 전부 회귀 없음. |
| 백엔드 `tsc --noEmit` | 통과(참고용 — `src/` 변경이 없어 사실상 영향 없음을 재확인) |
| `--rescore` 실측 | 위 ② 표 — API 호출 0건으로 완료 |
| 모드 A 호출 수 안내(`--yes` 없이) | `[vision-eval] 예상 호출 수: 2건 (A=2PDF × 실행 1 × 모델 1)` — 파일럿 manifest(PDF 2개, 9페이지) 기준 **2건**으로 정확히 나옴(예전엔 9건으로 잘못 표시됐었음) |
| `git status --short -- src/ test/` | 빈 출력(변경 없음) |

## ⑤ 브랜치·SHA
브랜치: `fix/vision-eval-mode-a-alignment`. 커밋 완료 후 push — SHA는 완료 메시지에서 확인. **main 병합하지 않음**(브랜치만 push).

## ⑥ 남은 위험
- `NAME_ABBREV`/`VALUE_MISSING`/`FACE_SPLIT_BY_COLOR`는 이번에 새로 만든 분류라 PR-200이 참고할 "합격 기준" 문서에는 아직 반영돼 있지 않다 — PR-200 작업 시 이 세 분류를 신호/합격 기준에 포함할지 사람이 결정해야 한다.
- `FACE_SPLIT_BY_COLOR` 병합은 허용오차(0.05)와 "색상코드가 있는 EXTRA 행 2개 이상"이라는 휴리스틱이다 — 실제 데이터가 더 다양해지면(예: 색상별 요척이 크게 다른 원단) 과소/과대 병합이 생길 수 있어 재검증이 필요하다.
- `checkLabelZonePresence`의 사전 공백(③) 문제는 이번 PR에서 고치지 않았다 — 라벨류(MAIN/CARE/PRICE TAG 등) 존재 여부 확인은 여전히 항상 `false`로 나온다.
- `--rescore`는 저장된 `details.jsonl`의 `outcome.results` 배열만 믿고 재구성한다 — 원래 호출이 정상 응답이 아니었던 줄(에러)은 "저장된 응답에 결과 배열이 없어 재채점에서 제외"로만 보고하고 추측하지 않는다.
