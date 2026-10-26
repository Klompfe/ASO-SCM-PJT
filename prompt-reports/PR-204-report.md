# PR-204 — 자재명 꺾쇠(&lt;&gt;) 미매칭 수정 + 단가표 후보 0건일 때 이유 표시

브랜치: `fix/price-reference-angle-bracket-names` (분기점 `origin/main` `9a08210`). **main에 병합하지 않음.**

## 배경

PILOT-9에서 확인된 문제: `MidoPriceTableService.findCandidates`가 자재명을 토큰으로 쪼개는 정규식(`replace(/[()"/,]/g,' ')`)이 `<`·`>`를 구분 문자로 보지 않아, "암홀&lt;실크&gt;" 같은 이름이 "테이프(TAPE) 암홀"과 매칭되지 않았다. 같은 문자 집합 누락이 `normalizeForFuzzyMatch`(엑셀 매핑 "중복 검토" 화면)에도 있었다. 후보가 0건이고 경고도 없으면 화면엔 빈 입력칸만 남아 "참고단가 블록이 안 보인다"처럼 보였다.

## 변경 파일 (7개)

| 파일 | 내용 |
|---|---|
| `src/mido-price-table/mido-price-table.service.ts` | 토큰화 로직을 `tokenizeMaterialName()` 함수로 추출하고 구분 문자에 `<>[]{}` 추가 |
| `src/mido-price-table/mido-price-table.service.spec.ts` | 꺾쇠/괄호 합성 입력 매칭 수 고정 테스트(`it.each`) + "100%" 토큰 보존 확인 테스트 |
| `src/boms/utils/bom-name-normalize.util.ts` | `normalizeForFuzzyMatch`의 제거 문자 집합에 `<`·`>` 추가(기존에 `()[]{}`는 이미 있었음) |
| `src/boms/utils/bom-name-normalize.util.spec.ts` | `normalizeForFuzzyMatch('암홀<실크>') === normalizeForFuzzyMatch('암홀(실크)')` 테스트 |
| `frontend-app/src/components/PriceReferenceBlock.tsx` | `itemName` prop 추가, 후보 0건·경고 없음 조건을 순수 함수 `shouldShowNoMatchNotice()`로 분리해 안내 문구 렌더 |
| `frontend-app/src/components/PriceReferenceBlockLabels.test.tsx` | `shouldShowNoMatchNotice`의 5가지 분기(후보0+경고없음→표시 / result없음·후보있음·경고있음·단위불일치→숨김) 테스트 |
| `frontend-app/src/components/PurchaseOrdersManager.tsx` | `<PriceReferenceBlock>`에 `itemName={item.name}` 전달 1줄 추가 |

마이그레이션 변경 **0건**, `package.json`/락 파일 변경 **0건**(`git diff origin/main --stat` 확인).

## 정규식 전/후

| | 이전 | 이후 |
|---|---|---|
| `mido-price-table.service.ts` 토큰화 | `materialName.replace(/[()"/,]/g, ' ')` | `tokenizeMaterialName()`: `replace(/[()<>[\]{}"/,]/g, ' ')` (같은 split/filter 로직, 구분 문자만 확장) |
| `bom-name-normalize.util.ts` 정규화 | `replace(/[\s()[\]{}\-_./,·"'`]/g, '')` | `replace(/[\s()<>[\]{}\-_./,·"'`]/g, '')` (`<>` 추가) |

**일반화하지 않음** — `[^\p{L}\p{N}]` 같은 전면 교체 대신 기존 문자 집합에 6글자(`<>[]{}`)만 추가했다. "100%"처럼 숫자+기호가 붙은 토큰은 그대로 보존됨을 테스트로 확인(아래).

## 합성 입력별 매칭 표 (실제 테스트 실행 결과)

| 자재명 | 토큰 | 매칭 건수 |
|---|---|---|
| 암홀&lt;실크&gt; | `["암홀","실크"]` | 1 |
| 암홀(실크) | `["암홀","실크"]` | 1 |
| 테이프(TAPE) 암홀 | `["테이프","TAPE","암홀"]` | 2(다데·암홀 행 둘 다 — 기존과 동일, 회귀 아님) |
| 암홀 테이프 | `["암홀","테이프"]` | 2(〃) |
| 암홀 | `["암홀"]` | 1 |
| 다데&lt;실크&gt; | `["다데","실크"]` | 1 |
| 다데(실크) | `["다데","실크"]` | 1 |
| 지퍼&lt;금속&gt;(오매칭 방지 확인) | `["지퍼","금속"]` | **0**(해당 단가표 행 없음 — 오매칭 안 생김) |
| 겉감&lt;면&gt; 100% | `["겉감","100%"]` | — ("100%"가 한 토큰으로 보존됨만 확인, 쪼개지지 않음) |

## `normalizeForFuzzyMatch`의 호출처

`src/mapping/utils/bom-diff.util.ts`(`isSimilarMaterialName` 경유) 1곳뿐 — 엑셀 매핑 "중복 검토(diff)" 화면에서만 쓰인다. 기존 테스트(`bom-name-normalize.util.spec.ts` 6건)는 전부 그대로 통과(`<`·`>`가 보존돼야 한다고 가정한 테스트가 없었음) — **깨진 기존 테스트 없음.**

## 테스트 숫자 (전/후)

| 항목 | 직전 기준선 | 하한 | 이번 검증 |
|---|---|---|---|
| 백엔드 `jest` 전체 | 1002 | 1002 이상 | **1012**(+10) |
| e2e(`--maxWorkers=2`) | 557 | 557 이상 | **557**(변경 없음) |
| 프런트 `vitest run` | 490 | 490 이상 | **495**(+5) |
| 백엔드/프런트 `tsc`·`build` | 통과 | — | **통과** |

전부 하한 충족, 실패 0건.

## 사람이 화면에서 확인할 것

1. 발주관리 > 발주 > 스타일 연결 후 "이 자재로 발주하기"로 `암홀<실크>`를 열면 "단가표 참고(USD)"에 환산 후보가 보인다.
   - **DB의 `material_packaging_unit_rules.AMHOL.unitLengthM`이 아직 `50`이면(마이그레이션 시드 원값, PR-202가 코드 문구만 바꿨을 뿐 DB는 그대로임 — `1791100000000-AddMaterialPackagingUnitRulesAndTapeType.ts:38`)** 롤당 **$0.50**이 뜬다 — **이것이 지금 시점의 정상 동작**이다.
   - 이후 관리 화면("자재 포장단위")에서 `AMHOL` 행을 100으로 고치면 그때부터 롤당 **$1.00**이 뜬다.
2. 단가표에 없는 자재(예: 지퍼·단추처럼 시드 6행에 전혀 없는 이름)를 열면 회색 안내("단가표에서 이 자재와 맞는 항목을 찾지 못했습니다…")가 보인다. 종류 미지정 경고나 단위 불일치 경고가 뜨는 자재는 이 회색 안내 대신 그 경고가 우선 표시된다.

## 이번 PR에서 하지 않은 것

저장(commit) 단계 이름 매칭 변경, 공급업체 자동 제안 변경, 소요량 계산 변경, 단가표 관리 화면 신설 — 전부 손대지 않음(PILOT-10에서 조사만 된 상태 그대로).

## 브랜치 상태

병합하지 않음 — `fix/price-reference-angle-bracket-names`만 push됨.
