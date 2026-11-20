# MERGE-52 — PR-247 머지 결과

- 대상: `feat/composition-recognition` (head ef4388e) → `main` fast-forward (74a130a → ef4388e)
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트
| | 병합 직전 main(74a130a, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1347 | 1380 | 1380 통과 |
| 프런트 vitest | 882 | 898 | 898 통과 |
| e2e (`--maxWorkers=2`) | 631 | 634 | 634 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과.

## 변경 파일 (7개, 범위 내)
`src/sales-orders/vision.service.ts`, `src/sales-orders/utils/vision-guardrails.util.ts`, `src/sales-orders/vision.composition.spec.ts`, `test/composition-recognition-flow.e2e-spec.ts`, `frontend-app/src/utils/compositionReview.ts`(+test), `frontend-app/src/components/SalesOrderUploadModal.tsx`
마이그레이션·package/lock·`.env`·데이터 파일·엑셀 파서·수입 선적/서류 코드·HS 분류 마스터·`prompt-reports/`·`CLAUDE.md` 없음. 인식 모델·온도·호출·재시도 코드 변경 없음, 안감 기본값 코드 수정 없음.

## 후처리 규칙 요약 (`checkComposition`)
- 비문자열 → null
- trim 후 빈 값 또는 자리표시자(`-`, `—`, `N/A`, `NA`, `없음`, `해당없음`, `NULL`, 대소문자 무관) → null
- 500자 초과 → 잘라 내지 않고 null + `COMPOSITION_TOO_LONG`
- 원단류 외 구분 행의 값 → 보존 + `COMPOSITION_ON_NON_FABRIC` 경고(저장·진행을 막지 않음)
- 그 외 변환 없음(대소문자·약어·번역 없음, 앞뒤 공백 제거만)

## 경고 판정 구분 목록
원단류: `겉감`, `안감`, `배색`, `배색감`, `퀼팅안감`, `폴리트윌안감` (`vision-guardrails.util.ts` `COMPOSITION_FABRIC_CATEGORIES`, 프런트 `compositionReview.ts` 와 동일). 구분이 비어 있으면 경고하지 않는다. 이 목록 밖의 구분에는 값이 있으면 안내 경고가 뜬다.

## 한계
실제 작지로 인식을 확인하지 못했다(Gemini 호출 없음, 테스트는 스텁 응답). 혼용률 위치는 저장소에 정의가 없어 프롬프트가 위치 비의존 문구다. 프런트 jsdom 없음 — 약어 안내 렌더는 순수 함수 테스트·빌드로 대체.
