# PR-199c — vision-eval 측정 도구 소형 보정

브랜치: `fix/vision-eval-pairing-implicit` (선행 조건 PR-199b `c5927ce`가 main에 있음 확인) ·
`src/` 변경 0, `package.json`/lock 변경 0, 실제 업무 데이터(엑셀·결과물) 저장소에 없음.
Gemini API 호출 0건(검증은 단위 테스트와 `--rescore`로만 수행).

## ① 변경 파일 목록

| 파일 | 내용 |
|---|---|
| `scripts/vision-eval/alignment.ts` | 정렬 경고 기준을 "행 단위(`page ≤ 배열 길이`)"로 변경, `usage.pageCount` 불일치 검사 추가 |
| `scripts/vision-eval/alignment.spec.ts` | 위 변경에 맞춰 테스트 보강(6Y 사례 재현 포함) |
| `scripts/vision-eval/scoring/style-field.ts` | 정답 스타일번호 셀의 메모를 분리(`GT_STYLE_NOTE`) |
| `scripts/vision-eval/scoring/style-field.spec.ts` | 위 보강 테스트 |
| `scripts/vision-eval/scoring/value-pairing.ts` (신규) | 값 기반 보조 짝짓기 — `NAME_DIFF_PAIRED_BY_VALUE` |
| `scripts/vision-eval/scoring/value-pairing.spec.ts` (신규) | 위 테스트 |
| `scripts/vision-eval/scoring/implicit-items.ts` (신규) | 암묵 자재 목록 로드·매칭·`MISSING_IMPLICIT` 분리 |
| `scripts/vision-eval/scoring/implicit-items.spec.ts` (신규) | 위 테스트 |
| `scripts/vision-eval/implicit-items.json` (신규) | 암묵 자재 목록 설정(`["사이즈 스티커","케어라벨","이미지택","폴리백"]`) |
| `scripts/vision-eval/README.md` (신규) | 암묵 자재 목록 사용법 |
| `scripts/vision-eval/types.ts` | `FieldErrorType`에 `NAME_DIFF_PAIRED_BY_VALUE`·`MISSING_IMPLICIT` 추가 |
| `scripts/vision-eval/scoring-pipeline.ts` | 4개 보정을 한 파이프라인으로 연결, PDF·쪽별 표(`pageRows`)·합계 검증(`validatePageRowTotals`) 추가 |
| `scripts/vision-eval/scoring-pipeline.spec.ts` | 위 전체 보강 테스트 |
| `scripts/vision-eval/cli.ts` | `usage.pageCount` 전달, `implicit-items.json` 로드·주입 |
| `prompt-reports/PR-199c-report.md` (이 문서) | 보고서 |

단위 테스트: 하네스 전체 **16 suites / 135 tests** 통과(가짜 데이터만 사용). 하네스 타입체크 통과.
백엔드 전체 `tsc --noEmit`·`npm run build` 통과(영향 없음 — `src/` 미변경).

## ② 재채점 전후 비교 (`--rescore`, API 호출 0건)

```
npm run vision:eval -- --rescore vision-eval-out/2026-10-19T15-18-00-330Z \
  --manifest C:/vision-eval/manifest.csv \
  --xlsx C:/vision-eval/xlsx/vanek.xlsx --xlsx C:/vision-eval/xlsx/misens.xlsx
```
→ `[vision-eval] 재채점 완료(API 호출 0건)`.

> **주의**: `C:\vision-eval\manifest.csv`가 PILOT-3 분석 시점(72.pdf 1쪽 = `MB72JKM101C`) 이후
> 사용자 쪽에서 수정돼(현재 `MB72JKM101A`) 있었다. 이 한 줄(72.pdf 1쪽)의 정답 내용 자체가
> 달라진 것이라 아래 표의 그 줄은 **코드 변경 효과와 섞여 있다**(정답행수 15→13도 이 때문).
> 나머지 13개 쪽은 코드 변경 효과만 반영한다.

**스타일번호 분류**

| 분류 | 이전(PILOT-3) | 이후(PR-199c) |
|---|---|---|
| EXACT | 11 | **12**(+1) |
| SUFFIX_MISSING | 0 | 0 |
| SUFFIX_DIGIT | 0 | 0 |
| OTHER_MISMATCH | 3 | **2**(-1) |
| 정렬 경고(6Y) | 2건(`ALIGNED_BY_STYLE`) | **0건 — 섹션 자체가 사라짐** |
| GT_STYLE_NOTE(신규) | — | 1건(`MB72JKM105F: "MB72JKM105F(끝자리 확인요망)"`) |

72-2(3) 5쪽은 예상대로 `EXACT`+`GT_STYLE_NOTE`로 바뀌었다(①의 메모 분리 덕분).

**자재명세 분류**

| 분류 | 이전 | 이후 |
|---|---|---|
| OK | 14 | 14 |
| VALUE_DIFF | 20 | 16 |
| VALUE_MISSING | 1 | 1 |
| NAME_DIFF | 24 | 26 |
| NAME_ABBREV | 18 | 20 |
| NAME_DIFF_PAIRED_BY_VALUE(신규) | — | **57** |
| EXTRA_DUPLICATE | 1 | 1 |
| EXTRA_OTHER | 80 | 23 |
| MISSING | 129 | **70** |
| MISSING_IMPLICIT(신규) | — | 0 |
| FACE_SPLIT_BY_COLOR | 6 | 6 |

MISSING은 129→70으로 줄었다 — 대부분(57건)은 값 기반 보조 짝짓기로 흡수됐고, 나머지 차이는
위 manifest 수정(72.pdf 1쪽, 정답행수 15→13) 때문이다. `MISSING_IMPLICIT`은 0건 — ⑤ 참고
(이번 4개 PDF는 전부 라벨 구역 처리가 이미 그 자재들을 걸러내고 있었음).

## ③ `NAME_DIFF_PAIRED_BY_VALUE` 예시 6쌍 (전체 57건 중)

| 정답 자재명 | AI 자재명 | 판단 |
|---|---|---|
| 겉감 OUT-SHELL | 유코)마드리드 | 정상 — 겉감 소재명 표기 차이 |
| 실크 암홀 테이프 EDEG TAPE | 아웃구(실크) | 정상 — 같은 실크 테이프류 |
| 트윌 LINING 해리,주머니감 | P/twill | 정상 — "트윌"=twill |
| **심지 INTERLINING (M-250)** | **M-260** | **의심** — 자재 코드 자체가 다름(250≠260). 수량이 우연히 같아 짝지어졌을 뿐일 수 있음. 다만 숫자 1자리 오독(5↔6)과 패턴이 같아 같은 자재의 오독일 가능성이 더 높아 보임 — 사람 확인 필요 |
| 본봉사 코아사 45S/2H THREAD | 코아사 | 정상 — "본봉사"=코아사 |
| 비바테이프(실크) EDGE TAPE AH | 아사테이프 | **약한 의심** — "실크" vs "아사(리넨)"는 소재가 다를 수 있음. 다만 둘 다 테이프류·같은 수량이라 표기 차이일 가능성이 더 높음 |

→ 57건 중 2건(약 3.5%)에서 소재/코드가 실제로 다를 가능성이 있는 의심 사례가 보였다. 이 분류는
"사람이 눈으로 검증"하도록 OK에 합산하지 않게 설계했으므로 설계 의도대로 동작한다.

## ④ `MISSING_IMPLICIT` 목록 + 6Y 3쪽·4쪽 정답 행 전체 목록

**`MISSING_IMPLICIT` 목록**: 이번 재채점에서는 0건(해당 없음) — ⑤ 참고.

**6Y 3쪽(`MB6YHMM106Z`, 전체 32행 = 라벨구역 7 + 비교대상 25)**

라벨구역(비교 제외, 7행): `MAIN+SIZE 메인라벨`, `CARE LABEL`, `PRICE TAG`, `SIZE STICKER`, `TAG PIN`, `품질보증택`, `POLY BAG`

| 자재명 | 분류 |
|---|---|
| (싸개패드)다후다 | MISSING |
| 트윌 LINING 해리,주머니감 | MISSING |
| 쉬폰 LINING | MISSING |
| 심지 INTERLINING(M-250) | MISSING |
| 심지 INTERLINING(M-252) | MISSING |
| (면) 다데테이프 EDEG TAPE | NAME_DIFF ↔ "다데(스판)" |
| (실크) 다데테이프 EDEG TAPE | MISSING |
| 비바테이프 EDEG TAPE | MISSING |
| 본봉사 코아사 45S/2H THREAD | NAME_ABBREV ↔ "봉사" |
| 오바사(가당사) 60S/3H THREAD | MISSING |
| 지누이도 45S/3H THREAD | MISSING |
| 싸개PAD | MISSING |
| 솜마꾸라지 | MISSING |
| 양면 지퍼 ZIPPER | MISSING |
| 스토퍼 | MISSING |
| 겉단추 | MISSING |
| 속단추 | MISSING |
| 금속 앞단추 | MISSING |
| 이단마이깡 HOOK | MISSING |
| E-BAND | MISSING |
| 단추 후다,뒤트임 | MISSING |
| E-스트링 | MISSING |
| **핸드메이드 라벨** | **MISSING**(암묵 목록에 없음 — 작지에 실제로 적혀 있는 라벨이라 암묵 자재가 아님, 지시서대로 그대로 MISSING 유지) |
| 겉감 OUT-SHELL | NAME_DIFF_PAIRED_BY_VALUE ↔ "유코)마드리드" |
| 실크 암홀 테이프 EDEG TAPE | NAME_DIFF_PAIRED_BY_VALUE ↔ "아웃구(실크)" |

→ 25행의 정체: **7행(라벨구역) + 25행(비교대상) = 32행**이 전체 행수였다(PILOT-3에서 "25행 중
약 15행이 설명 안 됨"이라 썼던 건 당시 라벨구역 7행을 25행 안에 포함해 센 오산 — 실제로는
비교대상 25행 전부가 위 표로 설명된다).

**6Y 4쪽(`MB6YHMM101Z`, 전체 32행 = 라벨구역 7 + 비교대상 25)**

| 자재명 | 분류 |
|---|---|
| 겉감 OUT-SHELL | FACE_SPLIT_BY_COLOR ↔ "성주)24SIA-001"(색상별 분할 병합) |
| (싸개패드)다후다 | MISSING |
| 쉬폰 LINING | MISSING |
| 심지 INTERLINING(M-252) | MISSING |
| (면) 다데테이프 EDEG TAPE | NAME_DIFF ↔ "다데(스판)" |
| (실크) 다데테이프 EDEG TAPE | NAME_DIFF ↔ "다데(실크)" |
| 실크 암홀 테이프 EDEG TAPE | MISSING |
| 비바테이프 EDEG TAPE | MISSING |
| 오바사(가당사) 60S/3H THREAD | MISSING |
| 지누이도 45S/3H THREAD | VALUE_DIFF ↔ "지누이도" |
| 싸개PAD | MISSING |
| 솜마꾸라지 | MISSING |
| 양면 지퍼 ZIPPER | MISSING |
| 스토퍼 | MISSING |
| 겉단추 | NAME_ABBREV ↔ "단추" |
| 속단추 | MISSING |
| 금속 앞단추 | MISSING |
| 이단마이깡 HOOK | MISSING |
| E-BAND | MISSING |
| 단추 후다,뒤트임 | MISSING |
| E-스트링 | MISSING |
| **핸드메이드 라벨** | **MISSING**(동일 — 암묵 자재 아님) |
| 트윌 LINING 해리,주머니감 | NAME_DIFF_PAIRED_BY_VALUE ↔ "P/twill" |
| 심지 INTERLINING(M-250) | NAME_DIFF_PAIRED_BY_VALUE ↔ "M-260"(③의 의심 사례) |
| 본봉사 코아사 45S/2H THREAD | NAME_DIFF_PAIRED_BY_VALUE ↔ "코아사" |

## ⑤ 라벨 구역 코드와의 겹침

이번 4개 PDF 전부 `checkLabelZonePresence`/`isLabelZone`(`MAIN+SIZE` 마커)가 암묵 자재
4종(사이즈 스티커·케어라벨·이미지택·폴리백)을 **이미 전부 라벨구역으로 걸러내고 있어서**
`MISSING_IMPLICIT`이 0건이었다 — 두 분류가 겹칠 땐 라벨구역 판별이 먼저 적용돼 해당 행이
`classifyBomItems`의 비교 대상에 아예 들어오지 않으므로 충돌은 없다. `implicit-items.json`은
라벨구역 마커가 없거나 깨진 시트(마커 인식 실패 사례)에서 안전망으로 작동한다.

## ⑥ 브랜치명·SHA

- 브랜치: `fix/vision-eval-pairing-implicit`
- 선행 조건 확인: PR-199b `c5927ce`가 `origin/main`에 있음(`git log origin/main` 확인)
- 커밋 SHA: `76bfd37`

## ⑦ 남은 위험

- `C:\vision-eval\manifest.csv`가 검증 중 외부에서 바뀌어(72.pdf 1쪽 스타일번호) 비교표 한 줄이
  코드 변경과 입력 변경이 섞여 있다 — 해석 시 주의.
- `NAME_DIFF_PAIRED_BY_VALUE`의 "구분"·"단위" 호환성 검사는 현재 스키마상 양쪽 다 판별 수단이
  없어(golden에 category 없음, AI에 unit 없음) 사실상 항상 통과한다 — 수량만으로 짝짓다 보니
  ③에서 본 것처럼 다른 자재 코드가 같은 수량이라는 이유로 짝지어질 수 있다(약 3.5% 사례).
- `implicit-items.json` 목록은 라벨구역 마커가 정상 동작하는 시트에서는 항상 0건이 나온다 —
  실제로 마커가 깨진 시트를 찾아 넣어 봐야 이 기능이 제대로 작동하는지 추가로 확인할 수 있다
  (이번 샘플엔 그런 시트가 없었음).
